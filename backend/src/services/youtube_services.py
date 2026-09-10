"""
YouTube propio: los videos del canal traídos con la clave de la cuenta.

Mismo criterio que Instagram. Lo que se publica en el canal se guarda en la base de ATV
Ops, con su miniatura bajada al disco, y desde ahí se muestra: si mañana atv-mkt no
existe, el mes de contenido se sigue viendo igual.

Un video no deja de moverse cuando se publica —sigue sumando vistas durante meses—, así
que cada pasada refresca las métricas de los que ya están guardados, no solo trae los
nuevos.

La Data API v3 da vistas, likes y comentarios. El CTR, las impresiones y la retención
solo salen de YouTube Studio y no se pueden pedir por acá: esos no están.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from decouple import config

from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.youtube")

BUSQUEDA = "https://www.googleapis.com/youtube/v3/search"
VIDEOS = "https://www.googleapis.com/youtube/v3/videos"
CADA_HORAS = int(config("YT_SYNC_HORAS", default=3))
# Cuántos videos del canal se miran en cada pasada, del más nuevo al más viejo.
CUANTOS = int(config("YT_SYNC_VIDEOS", default=50))

_lock = threading.Lock()
_ultima: dict = {}

# Las miniaturas se guardan al lado de las de Instagram y se sirven igual.
FOTOS = Path(__file__).resolve().parents[2] / "data" / "yt"
_DURACION = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


def _credenciales() -> tuple[str, str] | None:
    from src.services import conexiones_services

    c = conexiones_services.obtener("youtube")
    clave = str(c.get("api_key") or c.get("apiKey") or "").strip()
    canal = str(c.get("channel_id") or c.get("channelId") or "").strip()
    return (clave, canal) if clave and canal else None


def _pedir(url: str, **params) -> dict:
    try:
        with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        detalle = e.read().decode()[:200] if e.fp else str(e)
        logger.info("YouTube %s: %s", url.rsplit("/", 1)[-1], detalle)
        return {}
    except Exception as e:  # noqa: BLE001
        logger.info("YouTube %s: %s", url.rsplit("/", 1)[-1], str(e)[:160])
        return {}


def _segundos(iso: str | None) -> int:
    """PT4M13S son 253 segundos. Sirve para separar un short de un video largo."""
    m = _DURACION.fullmatch(str(iso or "").strip())
    if not m:
        return 0
    h, mi, se = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + se


def _fecha(iso: str | None) -> datetime | None:
    """YouTube publica en UTC; en el tablero todo se mira en hora de Argentina."""
    if not iso:
        return None
    texto = str(iso).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(texto)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(AR_TZ).replace(tzinfo=None)


def _miniatura(snippet: dict) -> str:
    """La más grande que haya: la chica se ve mal en el calendario."""
    fotos = snippet.get("thumbnails") or {}
    for nombre in ("maxres", "standard", "high", "medium", "default"):
        url = (fotos.get(nombre) or {}).get("url")
        if url:
            return url
    return ""


def _bajar_foto(url: str, yt_id: str) -> str:
    """Guarda la miniatura y devuelve la ruta pública. Si falla, cadena vacía."""
    if not url:
        return ""
    destino = FOTOS / f"{yt_id}.jpg"
    publica = f"/uploads/yt/{yt_id}.jpg"
    if destino.exists() and destino.stat().st_size > 0:
        return publica
    try:
        FOTOS.mkdir(parents=True, exist_ok=True)
        pedido = urllib.request.Request(url, headers={"User-Agent": "atv-ops"})
        with urllib.request.urlopen(pedido, timeout=25) as r:
            datos = r.read()
        if not datos:
            return ""
        destino.write_bytes(datos)
        return publica
    except Exception as e:  # noqa: BLE001
        logger.info("No se pudo bajar la miniatura de %s: %s", yt_id, str(e)[:120])
        return ""


def _entero(stats: dict, campo: str) -> int:
    try:
        return int(stats.get(campo) or 0)
    except (TypeError, ValueError):
        return 0


def _guardar(item: dict) -> bool:
    """Guarda o actualiza un video. Devuelve True si era nuevo."""
    from pony.orm import db_session

    from src.models import PublicacionYt

    yt_id = item.get("id") or ""
    snippet = item.get("snippet") or {}
    cuando = _fecha(snippet.get("publishedAt"))
    if not yt_id or cuando is None:
        return False
    stats = item.get("statistics") or {}
    metricas = {"vistas": _entero(stats, "viewCount"), "likes": _entero(stats, "likeCount"),
                "comentarios": _entero(stats, "commentCount")}
    duracion = _segundos((item.get("contentDetails") or {}).get("duration"))
    ahora = datetime.utcnow()
    with db_session:
        fila = PublicacionYt.get(yt_id=yt_id)
        if fila is None:
            PublicacionYt(yt_id=yt_id, publicado_at=cuando,
                          titulo=(snippet.get("title") or "")[:300],
                          descripcion=(snippet.get("description") or "")[:2000],
                          url=f"https://www.youtube.com/watch?v={yt_id}",
                          thumbnail=_bajar_foto(_miniatura(snippet), yt_id),
                          duracion_seg=duracion, metricas=json.dumps(metricas),
                          visto_at=ahora, actualizado_at=ahora)
            return True
        fila.titulo = (snippet.get("title") or fila.titulo or "")[:300]
        fila.descripcion = (snippet.get("description") or fila.descripcion or "")[:2000]
        fila.duracion_seg = duracion or fila.duracion_seg
        fila.metricas = json.dumps(metricas)
        fila.actualizado_at = ahora
        if not str(fila.thumbnail or "").startswith("/uploads/"):
            fila.thumbnail = _bajar_foto(_miniatura(snippet), yt_id)
        return False


def sincronizar() -> dict:
    """Trae los últimos videos del canal con sus métricas. Es la pasada de cada tres horas."""
    cred = _credenciales()
    if cred is None:
        return {"ok": False, "detalle": "No hay conexión de YouTube guardada en ATV Ops."}
    clave, canal = cred

    busqueda = _pedir(BUSQUEDA, part="snippet", channelId=canal, maxResults=min(CUANTOS, 50),
                      order="date", type="video", key=clave)
    ids = [((i.get("id") or {}).get("videoId") or "") for i in (busqueda.get("items") or [])]
    ids = [i for i in ids if i]
    if not ids:
        return {"ok": True, "videos": 0, "nuevos": 0, "at": datetime.now(AR_TZ).isoformat(),
                "detalle": "El canal no devolvió videos."}

    # `search` no trae métricas: hay que volver a pedir los videos por id.
    datos = _pedir(VIDEOS, part="snippet,statistics,contentDetails", id=",".join(ids[:50]), key=clave)
    videos = datos.get("items") or []
    nuevos = sum(1 for v in videos if _guardar(v))

    resultado = {"ok": True, "videos": len(videos), "nuevos": nuevos,
                 "at": datetime.now(AR_TZ).isoformat()}
    with _lock:
        _ultima.update(resultado)
    logger.info("YouTube: %s videos (%s nuevos)", len(videos), nuevos)
    return resultado


def _metricas(fila) -> dict:
    try:
        return json.loads(fila.metricas or "{}")
    except ValueError:
        return {}


def contenido(desde, hasta) -> dict:
    """Los videos publicados en el período, con lo que mide YouTube."""
    from pony.orm import db_session

    from src.models import PublicacionYt

    try:
        with db_session:
            # `list(...)` primero: iterar el Query directo dentro de una comprensión
            # revienta con el Pony de esta versión de Python.
            filas = [f for f in list(PublicacionYt.select())
                     if datetime.combine(desde, datetime.min.time()) <= f.publicado_at
                     < datetime.combine(hasta, datetime.min.time())]
            videos = [{
                "id": f.yt_id,
                "fecha": f.publicado_at.isoformat(),
                "titulo": (f.titulo or "").strip() or "(sin título)",
                "url": f.url or None,
                "thumbnail": f.thumbnail or None,
                "duracionSeg": f.duracion_seg,
                # Un short y un video de media hora no se comparan igual.
                "short": 0 < f.duracion_seg <= 180,
                **_metricas(f),
            } for f in filas]
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo leer el contenido de YouTube: %s", str(e)[:160])
        return {"videos": [], "conectado": False}

    videos.sort(key=lambda v: v["fecha"], reverse=True)
    return {
        "videos": videos,
        "conectado": True,
        "totales": {
            "videos": len(videos),
            "vistas": sum(v.get("vistas") or 0 for v in videos),
            "likes": sum(v.get("likes") or 0 for v in videos),
            "comentarios": sum(v.get("comentarios") or 0 for v in videos),
            "vistasPromedio": round(sum(v.get("vistas") or 0 for v in videos) / len(videos)) if videos else 0,
        },
    }


def estado() -> dict:
    cred = _credenciales()
    if cred is None:
        return {"conectado": False, "detalle": "Falta la conexión de YouTube en ATV Ops."}
    from pony.orm import db_session

    from src.models import PublicacionYt

    with db_session:
        filas = list(PublicacionYt.select())
        total = len(filas)
        ultima = max((f.actualizado_at for f in filas), default=None)
    with _lock:
        ultima_pasada = dict(_ultima)
    return {"conectado": True, "videos": total,
            "ultimaAt": ultima.isoformat() if ultima else None,
            "cadaHoras": CADA_HORAS, "ultimaPasada": ultima_pasada or None}


def iniciar_scheduler(stop: threading.Event) -> None:
    """Sincroniza al arrancar y después cada tres horas, como Instagram."""
    espera = max(1, CADA_HORAS) * 3600
    stop.wait(40)   # después de Instagram: no hace falta que peguen las dos juntas
    while not stop.is_set():
        try:
            sincronizar()
        except Exception as e:  # noqa: BLE001
            logger.warning("Sincronización de YouTube falló: %s", str(e)[:200])
        stop.wait(espera)
