"""
Onboarding real: las sesiones que crea ATV Onboarding.

Vive en el esquema `onboarding` de la base compartida, así que se lee con la misma
conexión que la cartera. Cada sesión es un cliente que entra: se le manda el acceso,
completa el formulario, se agenda la llamada y se le abre el canal de Discord.

Si la fuente no está disponible, todo va en cero.
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime

from decouple import config

from src.services import clients_db
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.onboarding")

CACHE_SEGUNDOS = int(config("ONBOARDING_CACHE_SEGUNDOS", default=300))
ESQUEMA = config("ONBOARDING_SCHEMA", default="onboarding")
_cache: dict = {}
_lock = threading.Lock()


def _dias(desde, hasta) -> float | None:
    if not desde or not hasta:
        return None
    return round((hasta - desde).total_seconds() / 86400, 1)


def _mediana(valores: list[float]) -> float | None:
    limpios = sorted(v for v in valores if v is not None)
    if not limpios:
        return None
    medio = len(limpios) // 2
    return limpios[medio] if len(limpios) % 2 else round((limpios[medio - 1] + limpios[medio]) / 2, 1)


def _sesiones(desde: date, hasta: date) -> list[dict]:
    return clients_db.consultar(
        f"SELECT id, client_name, client_email, plan, used, skool_used, form_submitted, "
        f"form_submitted_at, call_scheduled_at, call_completed_at, created_at, discord_channel_id "
        f"FROM {ESQUEMA}.sessions WHERE created_at >= %s AND created_at < %s ORDER BY created_at DESC",
        (desde, hasta),
    )


def _fila(s: dict) -> dict:
    creado = s["created_at"]
    tiene_discord = bool((s["discord_channel_id"] or "").strip())
    if s["call_completed_at"]:
        etapa = "completo"
    elif s["call_scheduled_at"]:
        etapa = "llamada_agendada"
    elif s["form_submitted"]:
        etapa = "formulario"
    elif s["used"]:
        etapa = "entro"
    else:
        etapa = "sin_abrir"
    return {
        "id": str(s["id"]),
        "cliente": (s["client_name"] or "").strip() or (s["client_email"] or "").split("@")[0] or "Sin nombre",
        "email": (s["client_email"] or "").strip(),
        "plan": (s["plan"] or "").strip() or "Sin plan",
        "creadoAt": creado.isoformat() if creado else None,
        "abrio": bool(s["used"]),
        "formulario": bool(s["form_submitted"]),
        "formularioAt": s["form_submitted_at"].isoformat() if s["form_submitted_at"] else None,
        "llamadaAgendadaAt": s["call_scheduled_at"].isoformat() if s["call_scheduled_at"] else None,
        "llamadaHechaAt": s["call_completed_at"].isoformat() if s["call_completed_at"] else None,
        "skool": bool(s["skool_used"]),
        "discord": tiene_discord,
        "etapa": etapa,
        "diasHastaFormulario": _dias(creado, s["form_submitted_at"]),
        "diasHastaLlamada": _dias(creado, s["call_completed_at"]),
    }


def _bloque(sesiones: list[dict]) -> dict:
    filas = [_fila(s) for s in sesiones]
    return {
        "total": len(filas),
        "abrieron": sum(1 for f in filas if f["abrio"]),
        "conFormulario": sum(1 for f in filas if f["formulario"]),
        "conLlamadaAgendada": sum(1 for f in filas if f["llamadaAgendadaAt"]),
        "conLlamadaHecha": sum(1 for f in filas if f["llamadaHechaAt"]),
        "conDiscord": sum(1 for f in filas if f["discord"]),
        "enSkool": sum(1 for f in filas if f["skool"]),
        "sinAbrir": sum(1 for f in filas if f["etapa"] == "sin_abrir"),
        "medianaFormularioDias": _mediana([f["diasHastaFormulario"] for f in filas]),
        "medianaLlamadaDias": _mediana([f["diasHastaLlamada"] for f in filas]),
        "porPlan": [
            {"plan": plan, "total": sum(1 for f in filas if f["plan"] == plan)}
            for plan in sorted({f["plan"] for f in filas})
        ],
        "sesiones": filas,
    }


def semana(desde: date, hasta: date) -> dict:
    """El bloque de onboarding para el reporte semanal."""
    if not clients_db.disponible():
        return _bloque([])
    return _bloque(_sesiones(desde, hasta))


def resumen(mes: str | None = None, refrescar: bool = False) -> dict:
    hoy = datetime.now(AR_TZ).date()
    mes = mes or hoy.strftime("%Y-%m")
    with _lock:
        guardado = _cache.get(mes)
        if guardado and not refrescar and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]

    anio, m = int(mes[:4]), int(mes[5:7])
    inicio = date(anio, m, 1)
    fin = date(anio + (m == 12), (m % 12) + 1, 1)
    previo_inicio = date(anio - (m == 1), 12 if m == 1 else m - 1, 1)

    if not clients_db.disponible():
        data = {"mes": mes, "generadoAt": datetime.now(AR_TZ).isoformat(), "conectado": False,
                "detalle": "Sin acceso a la base de ATV Onboarding.",
                "delMes": _bloque([]), "previo": _bloque([]), "historico": _bloque([])}
    else:
        data = {
            "mes": mes,
            "generadoAt": datetime.now(AR_TZ).isoformat(),
            "conectado": True,
            "delMes": _bloque(_sesiones(inicio, fin)),
            "previo": _bloque(_sesiones(previo_inicio, inicio)),
            "historico": _bloque(_sesiones(date(2020, 1, 1), fin)),
        }
    with _lock:
        _cache[mes] = {"at": datetime.utcnow(), "data": data}
    return data


def estado() -> dict:
    if not clients_db.disponible():
        return {"conectado": False, "detalle": "Sin acceso a la base compartida."}
    filas = clients_db.consultar(f"SELECT count(*) AS n FROM {ESQUEMA}.sessions")
    if not filas:
        return {"conectado": False, "detalle": "No se pudo leer el esquema onboarding."}
    return {"conectado": True, "sesiones": filas[0]["n"]}
