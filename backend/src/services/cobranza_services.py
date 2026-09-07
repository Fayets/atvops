"""
Cobranza: lectura de cuotas reales desde ATV Clients (API agente).

Preferencia: `/api/agent/cobranza-mes` (formato ops).
Fallback: `/api/agent/cobros` + `/api/agent/cobrado-mes` (deploy actual de clients).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json

from decouple import config
from fastapi import HTTPException

AR_OFFSET = timedelta(hours=-3)


def _hoy_ar() -> date:
    return (datetime.utcnow() + AR_OFFSET).date()


def _mes_label(d: date | None = None) -> str:
    d = d or _hoy_ar()
    return f"{d.year:04d}-{d.month:02d}"


class CobranzaServices:
    def _clients_base(self) -> str:
        return config("ATV_CLIENTS_API_URL", default="http://127.0.0.1:8001").rstrip("/")

    def _agent_key(self) -> str:
        return config("ATV_CLIENTS_AGENT_KEY", default="").strip()

    def _get_json(self, path: str) -> dict:
        key = self._agent_key()
        if not key:
            raise HTTPException(
                status_code=503,
                detail="Falta ATV_CLIENTS_AGENT_KEY en el .env de atv-ops (misma key que ADMIN_API_KEY de atv-clients).",
            )
        url = f"{self._clients_base()}{path}"
        req = Request(url, headers={"X-Agent-Key": key, "Accept": "application/json"})
        try:
            with urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise HTTPException(
                status_code=e.code if e.code in (401, 403, 404) else 502,
                detail=f"ATV Clients respondió {e.code}: {body[:240]}",
            ) from e
        except URLError as e:
            raise HTTPException(
                status_code=503,
                detail=f"No se pudo conectar a ATV Clients ({self._clients_base()}). ¿Está levantado?",
            ) from e

    def _fetch_cobranza_mes(self, month: str) -> dict:
        """Ops format si existe; si no, arma desde cobros + cobrado-mes."""
        try:
            return self._get_json(f"/api/agent/cobranza-mes?month={month}")
        except HTTPException as e:
            if e.status_code != 404:
                raise

        cobros = self._get_json(f"/api/agent/cobros?month={month}")
        try:
            cobrado_raw = self._get_json(f"/api/agent/cobrado-mes?month={month}")
        except HTTPException:
            cobrado_raw = {"total": 0}

        hoy = _hoy_ar()
        cuotas = []
        for c in cobros.get("cuotas") or []:
            vence = c.get("fecha_vence") or c.get("vence_at") or c.get("venceAt")
            estado_raw = (c.get("estado") or "pendiente").lower()
            if estado_raw in {"pagada", "pago", "cobrada"}:
                estado = "pagada"
            elif vence:
                fv = date.fromisoformat(str(vence)[:10])
                estado = "vencida" if fv < hoy else "pendiente"
            else:
                estado = "pendiente"
            cuotas.append({
                "id": str(c.get("id") or c.get("cliente_id") or f"{c.get('cliente_nombre')}-{vence}"),
                "cliente_id": c.get("cliente_id"),
                "cliente": c.get("cliente_nombre") or c.get("cliente") or "—",
                "plan": c.get("plan") or c.get("tipo") or "—",
                "monto_usd": float(c.get("monto_usd") or 0),
                "vence_at": vence,
                "pagada_at": c.get("pagada_at") or c.get("fecha_pago"),
                "estado": estado,
                "tipo": c.get("tipo"),
            })

        # Si solo tenemos total cobrado del mes (sin filas pagadas), inyectamos un
        # resumen sintético para que el KPI “cobrado” no quede en cero.
        cobrado_total = float(cobrado_raw.get("total") or cobrado_raw.get("caja_1") or 0)
        if cobrado_total > 0 and not any(c["estado"] == "pagada" for c in cuotas):
            cuotas.append({
                "id": f"cobrado-{month}",
                "cliente_id": None,
                "cliente": "Cobrado del mes (caja)",
                "plan": "caja",
                "monto_usd": cobrado_total,
                "vence_at": hoy.isoformat(),
                "pagada_at": hoy.isoformat(),
                "estado": "pagada",
                "tipo": "caja",
            })

        return {
            "mes": month,
            "hoy": hoy.isoformat(),
            "fuente": "atv_clients",
            "cuotas": cuotas,
        }

    def resumen(self, month: str | None = None) -> dict:
        mes = month or _mes_label()
        raw = self._fetch_cobranza_mes(mes)
        hoy = date.fromisoformat(raw.get("hoy") or _hoy_ar().isoformat())
        en7 = hoy + timedelta(days=7)

        cuotas = []
        for c in raw.get("cuotas") or []:
            vence = c.get("vence_at") or c.get("venceAt")
            estado = c.get("estado") or "pendiente"
            dias_atraso = 0
            if estado == "vencida" and vence:
                dias_atraso = max(0, (hoy - date.fromisoformat(str(vence)[:10])).days)
            cuotas.append({
                "id": str(c.get("id")),
                "cliente": c.get("cliente") or "—",
                "clienteId": c.get("cliente_id"),
                "plan": c.get("plan") or "—",
                "montoUsd": float(c.get("monto_usd") or c.get("montoUsd") or 0),
                "venceAt": vence,
                "estado": estado,
                "pagadaAt": c.get("pagada_at") or c.get("pagadaAt"),
                "tipo": c.get("tipo"),
                "diasAtraso": dias_atraso,
            })

        pagadas = [c for c in cuotas if c["estado"] == "pagada"]
        vencidas_list = sorted(
            [c for c in cuotas if c["estado"] == "vencida"],
            key=lambda c: c["diasAtraso"],
            reverse=True,
        )
        por_vencer = [
            c for c in cuotas
            if c["estado"] == "pendiente"
            and c["venceAt"]
            and hoy.isoformat() < str(c["venceAt"])[:10] <= en7.isoformat()
        ]

        total_mes = sum(c["montoUsd"] for c in cuotas)
        cobrado = sum(c["montoUsd"] for c in pagadas)
        esperado_hoy = sum(
            c["montoUsd"] for c in cuotas
            if c["venceAt"] and str(c["venceAt"])[:10] <= hoy.isoformat()
        )
        mas_vieja = vencidas_list[0] if vencidas_list else None

        vencidas = {
            "n": len(vencidas_list),
            "usd": round(sum(c["montoUsd"] for c in vencidas_list), 2),
            "detalle": (
                f"La más vieja es la de {mas_vieja['cliente']}, con {mas_vieja['diasAtraso']} días de atraso"
                if mas_vieja
                else "Sin cuotas vencidas"
            ),
        }
        por_vencer_semana = {
            "n": len(por_vencer),
            "usd": round(sum(c["montoUsd"] for c in por_vencer), 2),
        }

        ahora_iso = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        kpis = [
            {
                "id": "cobrado_mes",
                "label": "Cobrado del mes",
                "value": round(cobrado, 2),
                "format": "usd",
                "previous": round(esperado_hoy, 2),
                "sourceId": "atv_clients",
                "updatedAt": ahora_iso,
                "nota": f"Vencido a hoy: ${esperado_hoy:,.0f}. Fuente: ATV Clients.",
            },
            {
                "id": "cuotas_vencidas",
                "label": "Cuotas vencidas",
                "value": vencidas["n"],
                "format": "count",
                "previous": None,
                "sourceId": "atv_clients",
                "updatedAt": ahora_iso,
                "good": "down",
                "nota": f"${vencidas['usd']:,.0f} en la calle. {vencidas['detalle']}.",
            },
            {
                "id": "por_vencer_7d",
                "label": "Vencen en 7 días",
                "value": por_vencer_semana["n"],
                "format": "count",
                "previous": None,
                "sourceId": "atv_clients",
                "updatedAt": ahora_iso,
                "good": "neutral",
                "nota": f"${por_vencer_semana['usd']:,.0f} por cobrar esta semana.",
            },
            {
                "id": "total_mes",
                "label": "Total del mes",
                "value": round(total_mes, 2),
                "format": "usd",
                "previous": None,
                "sourceId": "atv_clients",
                "updatedAt": ahora_iso,
                "nota": f"{len(cuotas)} cuotas en {mes} (ATV Clients).",
            },
        ]

        return {
            "mes": mes,
            "hoy": hoy.isoformat(),
            "fuente": "atv_clients",
            "cuotas": cuotas,
            "cobrado": round(cobrado, 2),
            "esperadoHoy": round(esperado_hoy, 2),
            "totalMes": round(total_mes, 2),
            "vencidas": vencidas,
            "porVencerSemana": por_vencer_semana,
            "pctSobreVencido": round((cobrado / esperado_hoy) * 100, 1) if esperado_hoy > 0 else 100.0,
            "kpis": kpis,
            "syncAt": ahora_iso,
        }
