"""
Instagram propio: reels e historias traídos con el token de la cuenta.

Las historias viven 24 horas en Instagram y después no hay forma de recuperarlas, así
que se sincroniza cada tres horas: lo que se guarda acá queda, y la secuencia de un día
se puede mirar entera un mes después.

Los reels se traen con sus métricas de siempre (vistas, alcance, guardados, compartidos)
y se actualizan en cada pasada, porque un reel sigue sumando durante semanas.

Todo sale de la conexión `instagram` que ATV Ops tiene guardada: no depende de atv-mkt.
"""

from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from decouple import config

from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.instagram")

API = "https://graph.facebook.com/v21.0"
CADA_HORAS = int(config("IG_SYNC_HORAS", default=3))
# Un reel deja de moverse con el tiempo: solo se refrescan las métricas de los recientes.
DIAS_REFRESCO = int(config("IG_REFRESCO_DIAS", default=45))

METRICAS_REEL = "views,reach,saved,shares,total_interactions,comments,likes"
METRICAS_HISTORIA = "views,reach,replies,navigation,total_interactions"

_lock = threading.Lock()
_ultima: dict = {}


def _credenciales() -> tuple[str, str] | None:
    from src.services import conexiones_services

    c = conexiones_services.obtener("instagram")
    token = str(c.get("access_token") or "").strip()
    uid = str(c.get("instagram_user_id") or "").strip()
    return (token, uid) if token and uid else None


def _pedir(token: str, path: str, **params) -> dict:
    params["access_token"] = token
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=25) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        detalle = e.read().decode()[:200] if e.fp else str(e)
        logger.info("Instagram %s: %s", path, detalle)
        return {}
    except Exception as e:  # noqa: BLE001
        logger.info("Instagram %s: %s", path, str(e)[:160])
        return {}


def _insights(token: str, media_id: str, metricas: str) -> dict:
    data = _pedir(token, f"{media_id}/insights", metric=metricas).get("data") or []
    salida = {}
    for d in data:
        valores = d.get("values") or [{}]
        try:
            salida[d.get("name")] = int(valores[0].get("value") or 0)
        except (TypeError, ValueError):
            pass
    return salida


def _fecha(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S%z").astimezone(AR_TZ).replace(tzinfo=None)
    except ValueError:
        return None


def _guardar(tipo: str, item: dict, metricas: dict) -> bool:
    """Guarda o actualiza una publicación. Devuelve True si era nueva."""
    from pony.orm import db_session

    from src.models import PublicacionIg

    cuando = _fecha(item.get("timestamp"))
    if cuando is None:
        return False
    ahora = datetime.utcnow()
    with db_session:
        fila = PublicacionIg.get(ig_id=item["id"])
        if fila is None:
            PublicacionIg(ig_id=item["id"], tipo=tipo, publicado_at=cuando,
                          permalink=(item.get("permalink") or "")[:500],
                          caption=(item.get("caption") or "")[:2000],
                          thumbnail=(item.get("thumbnail_url") or item.get("media_url") or "")[:500],
                          metricas=json.dumps(metricas), visto_at=ahora, actualizado_at=ahora)
            return True
        fila.metricas = json.dumps(metricas)
        fila.actualizado_at = ahora
        if item.get("permalink"):
            fila.permalink = item["permalink"][:500]
        if item.get("caption"):
            fila.caption = item["caption"][:2000]
        return False


def sincronizar() -> dict:
    """Trae las historias activas y los reels recientes. Es la pasada de cada tres horas."""
    cred = _credenciales()
    if cred is None:
        return {"ok": False, "detalle": "No hay conexión de Instagram guardada en ATV Ops."}
    token, uid = cred
    nuevas_historias = nuevos_reels = 0
    historias = reels = 0

    # Historias: solo están mientras duran, por eso se miran en cada pasada.
    for h in (_pedir(token, f"{uid}/stories",
                     fields="id,media_type,timestamp,permalink,media_url,thumbnail_url").get("data") or []):
        historias += 1
        if _guardar("historia", h, _insights(token, h["id"], METRICAS_HISTORIA)):
            nuevas_historias += 1

    # Reels: se refrescan los recientes, que son los que todavía se mueven.
    corte = datetime.now(AR_TZ).replace(tzinfo=None) - timedelta(days=DIAS_REFRESCO)
    for m in (_pedir(token, f"{uid}/media", limit=50,
                     fields="id,media_type,media_product_type,timestamp,permalink,caption,thumbnail_url,media_url"
                     ).get("data") or []):
        if str(m.get("media_product_type") or "").upper() != "REELS":
            continue
        cuando = _fecha(m.get("timestamp"))
        if cuando is None or cuando < corte:
            continue
        reels += 1
        if _guardar("reel", m, _insights(token, m["id"], METRICAS_REEL)):
            nuevos_reels += 1

    resultado = {"ok": True, "historias": historias, "historiasNuevas": nuevas_historias,
                 "reels": reels, "reelsNuevos": nuevos_reels,
                 "at": datetime.now(AR_TZ).isoformat()}
    with _lock:
        _ultima.update(resultado)
    logger.info("Instagram: %s historias (%s nuevas) y %s reels (%s nuevos)",
                historias, nuevas_historias, reels, nuevos_reels)
    return resultado


def _metricas(fila) -> dict:
    try:
        return json.loads(fila.metricas or "{}")
    except ValueError:
        return {}


def contenido(desde, hasta) -> dict:
    """Reels y secuencias de historias del período, con lo que midió Instagram.

    Una secuencia es lo que se publicó en un día: así se mira entera, aunque las
    historias ya no existan en Instagram.
    """
    from pony.orm import db_session, select

    from src.models import PublicacionIg

    try:
        with db_session:
            filas = list(select(p for p in PublicacionIg
                                if p.publicado_at >= datetime.combine(desde, datetime.min.time())
                                and p.publicado_at < datetime.combine(hasta, datetime.min.time()))
                         .order_by(lambda p: p.publicado_at))
            reels, historias = [], []
            for f in filas:
                m = _metricas(f)
                item = {"id": f.ig_id, "fecha": f.publicado_at.isoformat(), "url": f.permalink or None,
                        "titulo": (f.caption or "").strip().split("\n")[0][:120] or "(sin caption)",
                        "thumbnail": f.thumbnail or None, **m}
                (reels if f.tipo == "reel" else historias).append(item)
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo leer el contenido de Instagram: %s", str(e)[:160])
        return {"reels": [], "secuencias": [], "conectado": False}

    # Las historias de un mismo día son una secuencia.
    por_dia: dict[str, list[dict]] = {}
    for h in historias:
        por_dia.setdefault(h["fecha"][:10], []).append(h)
    secuencias = [{
        "fecha": dia,
        "historias": sorted(items, key=lambda x: x["fecha"]),
        "piezas": len(items),
        "vistas": sum(x.get("views", 0) for x in items),
        "alcance": max((x.get("reach", 0) for x in items), default=0),
        "respuestas": sum(x.get("replies", 0) for x in items),
        # Cuánta gente se fue en el camino: la primera contra la última.
        "retencion": round(items[-1].get("reach", 0) / items[0].get("reach", 1) * 100, 1)
        if items and items[0].get("reach") else None,
    } for dia, items in sorted(por_dia.items(), reverse=True)]

    return {"reels": sorted(reels, key=lambda r: r["fecha"], reverse=True),
            "secuencias": secuencias, "conectado": True}


def estado() -> dict:
    cred = _credenciales()
    if cred is None:
        return {"conectado": False, "detalle": "Falta la conexión de Instagram en ATV Ops."}
    from pony.orm import db_session, select

    from src.models import PublicacionIg

    with db_session:
        total = select(p for p in PublicacionIg).count()
        ultima = select(p.actualizado_at for p in PublicacionIg).max()
    with _lock:
        ultima_pasada = dict(_ultima)
    return {"conectado": True, "publicaciones": total,
            "ultimaAt": ultima.isoformat() if ultima else None,
            "cadaHoras": CADA_HORAS, "ultimaPasada": ultima_pasada or None}


def iniciar_scheduler(stop: threading.Event) -> None:
    """Sincroniza al arrancar y después cada tres horas.

    Las historias duran un día: si la pasada se espacia más, se pierden secuencias
    enteras y no hay forma de recuperarlas.
    """
    espera = max(1, CADA_HORAS) * 3600
    stop.wait(20)   # deja arrancar al resto del sistema
    while not stop.is_set():
        try:
            sincronizar()
        except Exception as e:  # noqa: BLE001
            logger.warning("Sincronización de Instagram falló: %s", str(e)[:200])
        stop.wait(espera)
