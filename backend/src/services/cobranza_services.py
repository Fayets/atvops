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


# ------------------------------------------------------------------ próximos a vencer


# En cuántos días se corta cada tramo. No es decorativo: lo que vence esta semana se
# llama hoy, lo del mes se prepara, y lo de más adelante solo se mira.
TRAMOS = (
    ("esta_semana", "Esta semana", 7),
    ("este_mes", "En el mes", 30),
    ("despues", "Más adelante", 90),
)


class CobranzaServices:

    def proximos_a_vencer(self, dias: int = 90) -> dict:
        """Los clientes cuyo acceso vence en los próximos `dias`, para salir a renovarlos.

        Sale del esquema `clients`, que es donde vive la cartera: el vencimiento manda sobre
        todo lo demás —si venció, el cliente pierde el Classroom— y es el disparador de la
        conversación de renovación.

        Van agrupados por urgencia y no en una lista sola: lo que vence esta semana es una
        llamada de hoy, lo del mes se prepara, y lo de más adelante solo se mira. Una lista
        ordenada por fecha deja las tres cosas con el mismo peso visual.
        """
        from src.services import clients_db

        if not clients_db.disponible():
            raise HTTPException(status_code=503,
                                detail="Sin acceso al esquema clients: falta CLIENTS_DSN.")
        dias = max(1, min(int(dias or 90), 365))
        hoy = _hoy_ar()
        filas = clients_db.consultar(
            "SELECT nombre, plan_actual, estado_cliente, oportunidad, responsable, "
            "       fecha_inicio, fecha_vencimiento, "
            "       coalesce(total_pagado_usd, 0) AS pagado, "
            "       coalesce(total_adeudado_usd, 0) AS adeudado, "
            "       coalesce(observaciones, '') AS observaciones "
            "FROM {esquema}.clientes "
            "WHERE fecha_vencimiento >= %s AND fecha_vencimiento <= %s "
            "ORDER BY fecha_vencimiento",
            (hoy, hoy + timedelta(days=dias)),
        )

        def _dias(f) -> int:
            v = f.get("fecha_vencimiento")
            return (v - hoy).days if v else 0

        clientes = [{
            "nombre": (f.get("nombre") or "Sin nombre").strip(),
            "plan": (f.get("plan_actual") or "").strip(),
            "estado": (f.get("estado_cliente") or "").strip(),
            "oportunidad": (f.get("oportunidad") or "").strip(),
            "responsable": (f.get("responsable") or "").strip(),
            "inicioAt": f["fecha_inicio"].isoformat() if f.get("fecha_inicio") else None,
            "venceAt": f["fecha_vencimiento"].isoformat() if f.get("fecha_vencimiento") else None,
            "dias": _dias(f),
            "pagadoUsd": round(float(f.get("pagado") or 0), 2),
            "adeudadoUsd": round(float(f.get("adeudado") or 0), 2),
            "nota": (f.get("observaciones") or "").strip()[:300],
        } for f in filas]

        grupos, usados = [], 0
        for clave, titulo, tope in TRAMOS:
            if tope > dias:
                tope = dias
            items = [c for c in clientes if usados <= c["dias"] <= tope]
            usados = tope + 1
            if items:
                grupos.append({
                    "clave": clave, "titulo": titulo, "hastaDias": tope,
                    "clientes": items,
                    "deudaUsd": round(sum(c["adeudadoUsd"] for c in items), 2),
                })

        return {
            "generadoAt": datetime.utcnow().isoformat(),
            "hoy": hoy.isoformat(),
            "dias": dias,
            "grupos": grupos,
            "clientes": clientes,
            "resumen": {
                "total": len(clientes),
                "conDeuda": sum(1 for c in clientes if c["adeudadoUsd"] > 0),
                "deudaUsd": round(sum(c["adeudadoUsd"] for c in clientes), 2),
                "inactivos": sum(1 for c in clientes if c["estado"].lower() in ("inactivo", "pausa")),
            },
        }


    def caja_uno(self, mes: str | None = None) -> dict:
        """Caja 1: la plata de las ventas nuevas, que es la que cierra el closer.

        Caja 1 son las cuotas de una venta nueva y sus señas; Caja 2 es upsell y
        recompra. El tipo vive en la primera línea de `notas` de cada cuota
        (`cuota_venta`, `sena`, `cuota_upsell`, `cuota_recompra`), que es como lo guarda
        ATV Clients.

        Lo que entró sale de `pagos` —la plata real, con su fecha— y no de la cuota: una
        cuota de 5.000 pagada en dos veces entra 1.000 este mes y 4.000 el que viene, y
        mirarla desde la cuota la hacía aparecer entera el día que se terminó de pagar.
        Así octubre decía 28.600 cuando en ATV Clients habían entrado 26.500. Lo que vence
        y lo atrasado se miran desde la cuota, pero con el saldo que falta, descontando
        lo que ya se imputó.
        """
        from src.services import clients_db

        if not clients_db.disponible():
            raise HTTPException(status_code=503,
                                detail="Sin acceso al esquema clients: falta CLIENTS_DSN.")
        mes = (mes or _mes_label()).strip()
        try:
            anio, m = int(mes[:4]), int(mes[5:7])
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="El mes va como YYYY-MM.") from None
        desde = date(anio, m, 1)
        hasta = date(anio + (m == 12), (m % 12) + 1, 1)

        TIPO = "split_part(coalesce(q.notas, ''), chr(10), 1)"

        def _fila(f: dict, monto) -> dict:
            tipo = (f.get("tipo") or "").strip()
            return {
                "cliente": (f.get("nombre") or "Sin nombre").strip(),
                "montoUsd": round(float(monto or 0), 2),
                "venceAt": f["fecha_vence"].isoformat() if f.get("fecha_vence") else None,
                "pagoAt": f["fecha_pago"].isoformat() if f.get("fecha_pago") else None,
                "cuota": f.get("numero_cuota"),
                "tipo": tipo,
                "estado": (f.get("estado") or "").strip(),
                "responsable": (f.get("responsable") or "").strip(),
            }

        # Entró: cada pago del mes imputado a una cuota de venta o a una seña, por lo que
        # se imputó. Un pago sin imputación no se puede atribuir a una caja: queda afuera.
        entro = [_fila(f, f.get("imputado")) for f in clients_db.consultar(
            "SELECT c.nombre, pi.monto_usd AS imputado, p.fecha AS fecha_pago, q.fecha_vence, "
            "       q.numero_cuota, coalesce(q.estado, '') AS estado, "
            f"       {TIPO} AS tipo, coalesce(c.responsable, '') AS responsable "
            "FROM {esquema}.pagos p "
            "JOIN {esquema}.clientes c ON c.id = p.cliente_id "
            "JOIN {esquema}.pago_imputaciones pi ON pi.pago_id = p.id "
            "JOIN {esquema}.cuotas q ON q.id = pi.cuota_id "
            f"WHERE p.fecha >= %s AND p.fecha < %s AND {TIPO} IN ('cuota_venta', 'sena') "
            "ORDER BY p.fecha, c.nombre", (desde, hasta))]

        # Vence y atrasado: la cuota de venta sin pagar, por lo que le falta.
        base = (
            "SELECT c.nombre, q.monto_usd, q.fecha_vence, q.fecha_pago, q.numero_cuota, "
            f"       coalesce(q.estado, '') AS estado, {TIPO} AS tipo, "
            "       coalesce(c.responsable, '') AS responsable, "
            "       q.monto_usd - coalesce((SELECT sum(pi.monto_usd) FROM {esquema}.pago_imputaciones pi "
            "                               WHERE pi.cuota_id = q.id), 0) AS saldo "
            "FROM {esquema}.cuotas q JOIN {esquema}.clientes c ON c.id = q.cliente_id "
            f"WHERE {TIPO} = 'cuota_venta' AND q.fecha_pago IS NULL AND "
        )

        def _pendientes(cond: str, params: tuple) -> list[dict]:
            filas = [_fila(f, f.get("saldo")) for f in clients_db.consultar(base + cond, params)]
            return [f for f in filas if f["montoUsd"] > 0]

        vence = _pendientes("q.fecha_vence >= %s AND q.fecha_vence < %s ORDER BY q.fecha_vence",
                            (desde, hasta))
        atrasado = _pendientes("q.fecha_vence < %s ORDER BY q.fecha_vence", (desde,))

        suma = lambda xs: round(sum(x["montoUsd"] for x in xs), 2)  # noqa: E731
        hoy = _hoy_ar()
        return {
            "mes": mes,
            "entro": {"usd": suma(entro), "cuotas": len(entro), "filas": entro,
                      "senasUsd": suma([x for x in entro if x["tipo"] == "sena"])},
            "vence": {"usd": suma(vence), "cuotas": len(vence), "filas": vence,
                      # Las de este mes que ya pasaron de fecha: son reclamo de hoy, no del 30.
                      "yaVencidas": sum(1 for x in vence
                                        if x["venceAt"] and x["venceAt"] < hoy.isoformat())},
            "atrasado": {"usd": suma(atrasado), "cuotas": len(atrasado), "filas": atrasado},
            "total": {"porCobrarUsd": round(suma(vence) + suma(atrasado), 2)},
        }

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

