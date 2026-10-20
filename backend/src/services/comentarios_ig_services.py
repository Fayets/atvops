"""
Los comentarios de Instagram que llegan por webhook, en el momento.

Meta manda un aviso por cada comentario nuevo en una publicación de la cuenta (campo
`comments` del webhook de Instagram). Se guardan todos, de cualquier reel: así Audiencia y
el conteo de chats tienen a cada persona aunque después la API no la devuelva.

El aviso trae el id del comentario, quién lo escribió (id y usuario), el texto, y el id y
tipo de la publicación. Las respuestas (las del bot de Juan) traen `parent_id` y se descartan.
"""

from __future__ import annotations

import logging
from datetime import datetime

logger = logging.getLogger("atv_ops.comentarios_ig")


def _momento(valor) -> datetime:
    try:
        n = float(valor)
        return datetime.utcfromtimestamp(n / 1000 if n > 1e11 else n)
    except (TypeError, ValueError, OSError):
        return datetime.utcnow()


def de_aviso(cuerpo: dict) -> list[dict]:
    """Los comentarios de primer nivel que vienen en un aviso de Meta, normalizados."""
    salida = []
    for entrada in (cuerpo.get("entry") or []):
        for cambio in (entrada.get("changes") or []):
            if cambio.get("field") != "comments":
                continue
            v = cambio.get("value") or {}
            if v.get("parent_id"):
                continue
            usuario = str((v.get("from") or {}).get("username") or "").strip().lower()
            media = str((v.get("media") or {}).get("id") or "")
            ident = str(v.get("id") or "")
            if not usuario or not media or not ident:
                continue
            salida.append({"id": ident, "media_id": media, "username": usuario, "text": v.get("text") or "",
                           "at": _momento(entrada.get("time"))})
    return salida


def guardar(cuerpo: dict) -> int:
    """Anota los comentarios nuevos del aviso. Devuelve cuántos eran nuevos."""
    from pony.orm import db_session

    from src.models import ComentarioIg

    nuevos = 0
    with db_session:
        for c in de_aviso(cuerpo):
            if ComentarioIg.get(comentario_id=c["id"]):
                continue
            ComentarioIg(comentario_id=c["id"], media_id=c["media_id"], usuario=c["username"],
                         texto=c["text"][:2000], at=c["at"])
            nuevos += 1
    if nuevos:
        logger.info("Instagram: %d comentarios nuevos por webhook", nuevos)
    return nuevos


def del_reel(media_id: str) -> list[dict]:
    """Los comentarios guardados de un reel, con la forma de la API de Instagram."""
    from pony.orm import db_session

    from src.models import ComentarioIg

    with db_session:
        # Filtrado en Python: con Pony y Python 3.13 el select con lambda no se puede decompilar.
        filas = sorted((f for f in list(ComentarioIg.select()) if f.media_id == str(media_id)), key=lambda f: f.at)
        return [{"id": f.comentario_id, "username": f.usuario, "text": f.texto or "",
                 "timestamp": f.at.strftime("%Y-%m-%dT%H:%M:%S+0000")} for f in filas]
