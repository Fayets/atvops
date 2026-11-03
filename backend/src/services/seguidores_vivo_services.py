"""
Los seguidores de la cuenta en vivo: el total ahora y cómo vino subiendo y bajando.

Instagram da el total al instante (`followers_count`) pero no su historia, y las métricas por
día recién se cierran al día siguiente. Entonces se saca una foto del total cada pocos minutos
y la historia es la serie de fotos. Arranca a juntarse el día que se prende esto: para antes,
está el gráfico de los que siguen y dejan por día.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta

from fastapi import HTTPException
from pony.orm import db_session, desc

from src.services.meta_services import AR_OFFSET, MetaServices

logger = logging.getLogger("atv_ops.seguidores_vivo")

CADA_MINUTOS = 10           # la foto de fondo, aunque nadie mire
FRESCA_SEGUNDOS = 120       # con la pantalla abierta, una foto nueva cada 2 minutos como mucho
MAX_HORAS = 24 * 30

_lock = threading.Lock()
_usuario: dict[str, str] = {}


def _pedir_total() -> tuple[int, str | None]:
    meta = MetaServices()
    token, uid = meta._ig_token(), meta._ig_user()
    if not token or not uid:
        raise HTTPException(status_code=503, detail="Falta el token de Instagram.")
    r = meta._graph_get(meta._ig_ver(), f"/{uid}", token, {"fields": "username,followers_count"})
    if r.get("followers_count") is None:
        raise HTTPException(status_code=502, detail="Instagram no devolvió el total de seguidores.")
    return int(r["followers_count"]), r.get("username")


def foto(forzar: bool = False) -> dict:
    """La última foto; si ya es vieja, saca una nueva. Dos pantallas abiertas no duplican pedidos."""
    from src.models import SeguidoresFoto

    with _lock:
        with db_session:
            ultima = SeguidoresFoto.select().order_by(desc(SeguidoresFoto.id)).first()
            previa = {"at": ultima.at, "total": ultima.total} if ultima else None
        if previa and not forzar and (datetime.utcnow() - previa["at"]).total_seconds() < FRESCA_SEGUNDOS:
            return previa
        total, usuario = _pedir_total()
        if usuario:
            _usuario["nombre"] = usuario
        ahora = datetime.utcnow()
        with db_session:
            SeguidoresFoto(at=ahora, total=total)
        return {"at": ahora, "total": total}


def delta_desde(puntos: list[dict], desde: datetime, actual: int) -> int | None:
    """Cuánto cambió el total desde un momento: contra la última foto de antes (o la primera
    de después, si no hay de antes). Sin fotos en esa ventana no hay delta."""
    antes = [p for p in puntos if p["at"] <= desde]
    ref = antes[-1] if antes else next((p for p in puntos if p["at"] > desde), None)
    return None if ref is None else actual - ref["total"]


def serie(horas: int = 48) -> dict:
    from src.models import SeguidoresFoto

    horas = max(1, min(int(horas or 48), MAX_HORAS))
    try:
        ahora_foto = foto()
    except HTTPException as e:
        ahora_foto = None
        error = str(e.detail)[:200]
    else:
        error = None
    desde = datetime.utcnow() - timedelta(hours=horas)
    # Para el delta de hoy hace falta la última foto de antes de la medianoche de Argentina.
    medianoche = (datetime.utcnow() + AR_OFFSET).replace(hour=0, minute=0, second=0, microsecond=0) - AR_OFFSET
    corte = min(desde, medianoche - timedelta(hours=1))
    with db_session:
        todas = sorted(({"at": f.at, "total": f.total} for f in list(SeguidoresFoto.select()) if f.at >= corte),
                       key=lambda p: p["at"])
    if not todas and ahora_foto is None:
        raise HTTPException(status_code=503, detail=error or "Todavía no hay fotos de seguidores.")
    actual = (ahora_foto or todas[-1])["total"]
    return {
        "usuario": _usuario.get("nombre"),
        "actual": actual,
        "at": (ahora_foto or todas[-1])["at"].isoformat() + "Z",
        "hoy": delta_desde(todas, medianoche, actual),
        "ultimaHora": delta_desde(todas, datetime.utcnow() - timedelta(hours=1), actual),
        "puntos": [{"at": p["at"].isoformat() + "Z", "total": p["total"]} for p in todas if p["at"] >= desde],
        "desdeAt": todas[0]["at"].isoformat() + "Z" if todas else None,
        "horas": horas,
        "error": error,
    }


def iniciar_scheduler(stop: threading.Event) -> None:
    """Una foto cada diez minutos, mire alguien o no: si no, la historia tendría huecos de noche."""
    stop.wait(30)
    while not stop.is_set():
        try:
            foto(forzar=True)
        except HTTPException as e:
            logger.info("Seguidores en vivo: %s", e.detail)
        except Exception as e:  # noqa: BLE001
            logger.warning("Seguidores en vivo: %s", str(e)[:200])
        stop.wait(CADA_MINUTOS * 60)
