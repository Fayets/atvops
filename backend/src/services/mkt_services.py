"""
ATV MKT — resumen comercial del mes (chats, agendas, cierres, cash).

Fuente: API agente de ATV MKT (`/api/agent/resumen` + `/api/reportes/ventas`).
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


def _primer_dia(mes: str) -> date:
    y, m = mes.split("-")
    return date(int(y), int(m), 1)


def _primer_dia_siguiente(mes: str) -> date:
    y, m = map(int, mes.split("-"))
    if m == 12:
        return date(y + 1, 1, 1)
    return date(y, m + 1, 1)


class MktServices:
    def _base(self) -> str:
        return config("ATV_MKT_API_URL", default="").rstrip("/")

    def _key(self) -> str:
        return config("ATV_MKT_AGENT_KEY", default="").strip()

    def _get(self, path: str, params: dict | None = None) -> dict:
        base = self._base()
        key = self._key()
        if not base or not key:
            raise HTTPException(
                status_code=503,
                detail="Falta ATV_MKT_API_URL o ATV_MKT_AGENT_KEY en el .env.",
            )
        qs = ""
        if params:
            from urllib.parse import urlencode

            qs = "?" + urlencode({k: v for k, v in params.items() if v is not None})
        url = f"{base}{path}{qs}"
        req = Request(url, headers={"X-Agent-Key": key, "Accept": "application/json"})
        try:
            with urlopen(req, timeout=25) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise HTTPException(
                status_code=502,
                detail=f"ATV MKT respondió {e.code}: {body[:240]}",
            ) from e
        except URLError as e:
            raise HTTPException(
                status_code=503,
                detail=f"No se pudo conectar a ATV MKT ({base}).",
            ) from e

    def resumen(self, month: str | None = None) -> dict:
        mes = month or _mes_label()
        hoy = _hoy_ar()
        desde = _primer_dia(mes).isoformat()
        # reportes/ventas usa hasta exclusive
        hasta_d = min(_primer_dia_siguiente(mes), hoy + timedelta(days=1))
        hasta = hasta_d.isoformat()

        agent = self._get("/api/agent/resumen", {"month": mes})
        ventas = self._get("/api/reportes/ventas", {"desde": desde, "hasta": hasta})
        funnel = ventas.get("funnel") or {}

        ahora_iso = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        return {
            "mes": mes,
            "hoy": hoy.isoformat(),
            "fuente": "atv_mkt",
            "syncAt": ahora_iso,
            "chats": int(agent.get("chats") or 0),
            "conversaciones": int(agent.get("conversaciones") or 0),
            "agendas": int(funnel.get("agendas") or agent.get("agendas") or 0),
            "shows": int(funnel.get("shows") or agent.get("shows") or 0),
            "noShows": int(funnel.get("no_shows") or agent.get("no_shows") or 0),
            "cierres": int(funnel.get("cierres") or agent.get("cierres") or 0),
            "cash": float(funnel.get("cash") or agent.get("ingresos") or 0),
            "porCobrar": float(funnel.get("por_cobrar") or 0),
            "agent": agent,
            "funnel": funnel,
        }
