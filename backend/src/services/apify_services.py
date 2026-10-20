"""
Los comentarios de un reel que la API de Instagram no devuelve, leídos con Apify.

La API oficial entrega una parte de los comentarios y, en algunos reels, ninguno: el del
19-10-2026 marcaba 45 y devolvía 0, aunque en la página se veían 22 (medido con token de
cuenta y de página, en v21, v23 y v25, con todos los permisos). Apify lee la página pública
con sus propias cuentas, no con la de ATV, así que no arriesga el Instagram de Juan.

Es un respaldo y cuesta plata (alrededor de US$2 cada 1.000 comentarios), así que:
- Solo se usa cuando la API devolvió menos del 40 % de lo que marca el reel (el número suma
  las respuestas del bot, así que un reel sano queda cerca del 50 %).
- Un reel se vuelve a pedir solo si sumó comentarios desde la última vez (la marca queda en
  la base, así un reinicio no repite pedidos).
- Lo que trae se guarda unas horas en memoria: Audiencia y el conteo de chats corren en la
  misma pasada y piden el mismo reel.

Devuelve los comentarios con la misma forma que la API de Instagram (id, username, text,
timestamp), para que quien los use no tenga que distinguir de dónde vinieron.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from datetime import datetime

logger = logging.getLogger("atv_ops.apify")

ACTOR = "apify~instagram-comment-scraper"
URL = f"https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items"
# El contador de Instagram suma las respuestas: como el bot le responde a cada uno, en un reel
# con CTA cerca de la mitad del número son respuestas nuestras (19-10: 45 = 23 personas + 22
# respuestas), y la API solo devuelve los de primer nivel. Por eso el corte va en 40 % y no más
# arriba: en los reels normales la API trae todo (56 de 94, 44 de 72) y no hay que pagar nada.
PROPORCION_MINIMA = 0.4
NUEVOS_PARA_REPETIR = 5    # comentarios nuevos que justifican volver a pagar por el mismo reel
MAX_COMENTARIOS = 500
GUARDADO_SEGUNDOS = 6 * 3600

_memoria: dict[str, tuple[float, list[dict]]] = {}


def _token() -> str:
    from src.services import conexiones_services

    return str((conexiones_services.obtener("apify") or {}).get("api_token") or "").strip()


def configurado() -> bool:
    return bool(_token())


def hace_falta(leidos: int, total: int | None) -> bool:
    """La API devolvió bastante menos de lo que marca el reel."""
    total = int(total or 0)
    return total > 0 and leidos < total * PROPORCION_MINIMA


def _marca(media_id: str) -> int | None:
    from pony.orm import db_session

    from src.models import AjusteAudiencia

    with db_session:
        fila = AjusteAudiencia.get(clave=f"apify:{media_id}")
        try:
            return int(fila.valor) if fila and fila.valor else None
        except ValueError:
            return None


def _marcar(media_id: str, total: int) -> None:
    from pony.orm import db_session

    from src.models import AjusteAudiencia

    with db_session:
        fila = AjusteAudiencia.get(clave=f"apify:{media_id}") or AjusteAudiencia(clave=f"apify:{media_id}")
        fila.valor = str(int(total))
        fila.actualizado_at = datetime.utcnow()


def _hora(iso: str | None) -> str | None:
    """Apify da "2026-10-19T14:02:11.000Z"; la API de Instagram, "2026-10-19T14:02:11+0000"."""
    if not iso:
        return None
    try:
        return datetime.strptime(str(iso)[:19], "%Y-%m-%dT%H:%M:%S").strftime("%Y-%m-%dT%H:%M:%S+0000")
    except ValueError:
        return None


def normalizar(items: list[dict]) -> list[dict]:
    """Los ítems de Apify con la forma de un comentario de la API de Instagram."""
    salida, vistos = [], set()
    for it in items or []:
        usuario = it.get("ownerUsername") or (it.get("owner") or {}).get("username") or it.get("username")
        if not usuario:
            continue
        ident = str(it.get("id") or f"ap:{usuario}:{it.get('timestamp') or ''}")
        if ident in vistos:
            continue
        vistos.add(ident)
        salida.append({"id": ident, "username": str(usuario), "text": it.get("text") or "",
                       "timestamp": _hora(it.get("timestamp"))})
    return salida


def _pedir(permalink: str, token: str) -> list[dict]:
    cuerpo = json.dumps({"directUrls": [permalink], "resultsLimit": MAX_COMENTARIOS}).encode()
    pedido = urllib.request.Request(URL, data=cuerpo, method="POST", headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(pedido, timeout=240) as r:
        return json.loads(r.read() or b"[]")


def comentarios(media_id: str, permalink: str | None, total: int | None) -> list[dict]:
    """Los comentarios del reel según Apify. Lista vacía si no hace falta, no está configurado
    o falla: el respaldo nunca corta la corrida."""
    if not permalink:
        return []
    guardado = _memoria.get(permalink)
    if guardado and time.time() - guardado[0] < GUARDADO_SEGUNDOS:
        return guardado[1]
    token = _token()
    if not token:
        return []
    previo = _marca(media_id)
    if previo is not None and int(total or 0) < previo + NUEVOS_PARA_REPETIR:
        return []   # ya se leyó con estos comentarios: lo que trajo quedó en leads y chats
    try:
        items = normalizar(_pedir(permalink, token))
    except urllib.error.HTTPError as e:
        logger.warning("Apify %s: %s %s", media_id, e.code, (e.read() or b"")[:200])
        return []
    except Exception as e:  # noqa: BLE001
        logger.warning("Apify %s: %s", media_id, str(e)[:200])
        return []
    _memoria[permalink] = (time.time(), items)
    _marcar(media_id, int(total or 0))
    logger.info("Apify: reel %s → %d comentarios (la API marcaba %s)", media_id, len(items), total)
    return items
