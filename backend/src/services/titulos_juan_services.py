"""
Cómo titula Juan lo que publica, aprendido de lo que publica.

La pizarra escribía los títulos "como Juan" a partir de una nota fija con 26 aperturas de
historias, y Franco los seguía sintiendo de IA (22-10-2026). Ahora se guía por lo que Juan
publicó de verdad este año: el arranque de cada reel, el título de cada video de YouTube y
la primera historia de cada secuencia, con las vistas para saber cuáles pegaron.

Se arma en vivo de lo que Ops ya sincroniza, así cada reel y cada video nuevo entra solo.
Las historias son imágenes: la primera de cada secuencia se lee una vez con Claude después
de cada sincronización de Instagram (`leer_aperturas_nuevas`) y queda guardada.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("atv_ops.titulos_juan")

MAX_REELS = 40
MAX_VIDEOS = 40
MAX_APERTURAS = 40
APERTURAS_POR_VUELTA = 12   # secuencias que se leen por sincronización: acota lo que se gasta en Claude

_CTA = re.compile(r"^(comenta|comentá|escribime|link en|mandame|dm)\b", re.I)


def _desde() -> datetime:
    return datetime(datetime.now().year, 1, 1)


def _vistas(metricas: str | None, *claves: str) -> int:
    try:
        m = json.loads(metricas or "{}")
    except ValueError:
        return 0
    for k in claves:
        if m.get(k):
            try:
                return int(m[k])
            except (TypeError, ValueError):
                continue
    return 0


def titulo_de_reel(caption: str | None) -> str:
    """El arranque del reel: la primera línea con texto que no sea el pedido de comentar."""
    for linea in (caption or "").splitlines():
        linea = " ".join(linea.split())
        if linea and not linea.startswith("#") and not _CTA.match(linea):
            return linea[:160]
    return ""


def reels() -> list[dict]:
    from pony.orm import db_session

    from src.models import PublicacionIg

    with db_session:
        filas = [(p.publicado_at, p.caption, p.metricas) for p in list(PublicacionIg.select())
                 if p.tipo == "reel" and p.publicado_at >= _desde()]
    salida = [{"titulo": titulo_de_reel(c), "vistas": _vistas(m, "views", "plays", "reach"), "fecha": f.date()}
              for f, c, m in filas]
    return [x for x in salida if x["titulo"]]


def videos() -> list[dict]:
    from pony.orm import db_session

    from src.models import PublicacionYt

    with db_session:
        return [{"titulo": " ".join((v.titulo or "").split()), "vistas": _vistas(getattr(v, "metricas", None), "vistas", "views"),
                 "fecha": v.publicado_at.date()}
                for v in list(PublicacionYt.select()) if v.publicado_at >= _desde() and (v.titulo or "").strip()]


def aperturas() -> list[dict]:
    from pony.orm import db_session

    from src.models import AperturaHistoria

    with db_session:
        return sorted(({"titulo": a.texto, "fecha": a.fecha} for a in list(AperturaHistoria.select())
                       if (a.texto or "").strip() and a.fecha >= _desde().date()),
                      key=lambda x: x["fecha"], reverse=True)


MIN_CON_CTA = 10


def _de_secuencias_con_cta(lista: list[dict]) -> list[dict]:
    """Solo las secuencias con CTA: la primera historia de un día cualquiera ("abuelo", "I'm
    back") no es un título. Con pocas marcadas todavía, van todas para no quedarse sin ejemplos."""
    from src.services import instagram_services

    marcadas = instagram_services.cta_marcadas()
    con = [x for x in lista if x["fecha"].isoformat() in marcadas]
    return con if len(con) >= MIN_CON_CTA else lista


def bloque() -> str:
    """Lo que lee Claude antes de escribir un título. Vacío si todavía no hay nada."""
    def fecha(d) -> str:
        return f"{d.day}-{d.month}"

    partes = []
    r = sorted(reels(), key=lambda x: x["vistas"], reverse=True)[:MAX_REELS]
    if r:
        partes.append("## Reels (el arranque, de más a menos vistas)\n"
                      + "\n".join(f"- {x['titulo']} ({x['vistas']:,} vistas · {fecha(x['fecha'])})".replace(",", ".") for x in r))
    v = sorted(videos(), key=lambda x: x["vistas"], reverse=True)[:MAX_VIDEOS]
    if v:
        partes.append("## YouTube (títulos, de más a menos vistas)\n"
                      + "\n".join(f"- {x['titulo']} ({x['vistas']:,} vistas · {fecha(x['fecha'])})".replace(",", ".") for x in v))
    a = _de_secuencias_con_cta(aperturas())[:MAX_APERTURAS]
    if a:
        partes.append("## Historias (la primera de cada secuencia, de la más nueva a la más vieja)\n"
                      + "\n".join(f"- {x['titulo']} ({fecha(x['fecha'])})" for x in a))
    if not partes:
        return ""
    return ("# Cómo titula Juan (lo que publicó este año, tal cual)\n"
            "Así escribe Juan sus títulos de verdad. Mirá la forma (largo, minúsculas, números, \"te explico\", "
            "\"pov:\", la acusación, la pregunta) y preferí la de los que más vistas tuvieron.\n\n" + "\n\n".join(partes))


# ------------------------------------------------------------------ historias

SYSTEM_APERTURA = """Te paso capturas de historias de Instagram de Juan Carrizo (ATV), una por secuencia: la primera de cada día.
Leelas con la herramienta Read, una por una. Para cada una copiá el texto escrito que se lee en la historia, TAL CUAL (mismas minúsculas, signos y números). Si hay un texto grande y otros chicos, el grande va primero. Si la historia no tiene texto escrito, devolvé "".
No describas la imagen ni opines.
Devolvé SOLO un objeto JSON: {"historias": [{"archivo": "nombre.jpg", "texto": "..."}]}"""


def _archivo(thumbnail: str | None) -> Path | None:
    from src.db import _BACKEND_ROOT

    if not thumbnail or not thumbnail.startswith("/uploads/"):
        return None
    ruta = _BACKEND_ROOT / "data" / thumbnail[len("/uploads/"):]
    return ruta if ruta.exists() else None


def secuencias_sin_leer() -> list[dict]:
    """La primera pieza de cada secuencia del año que todavía no se leyó, de la más nueva."""
    from pony.orm import db_session

    from src.models import AperturaHistoria, PublicacionIg

    with db_session:
        leidas = {a.ig_id for a in list(AperturaHistoria.select())}
        fechas_leidas = {a.fecha for a in list(AperturaHistoria.select())}
        primeras: dict = {}
        for p in list(PublicacionIg.select()):
            if p.tipo != "historia" or p.publicado_at < _desde():
                continue
            dia = p.publicado_at.date()
            if dia not in primeras or p.publicado_at < primeras[dia][0]:
                primeras[dia] = (p.publicado_at, p.ig_id, p.thumbnail)
    return [{"fecha": dia, "ig_id": ig, "thumbnail": th}
            for dia, (_t, ig, th) in sorted(primeras.items(), reverse=True)
            if ig not in leidas and dia not in fechas_leidas]


def leer_aperturas_nuevas(limite: int = APERTURAS_POR_VUELTA) -> int:
    """Lee el texto de la primera historia de las secuencias nuevas. Devuelve cuántas guardó."""
    from pony.orm import db_session

    from src.models import AperturaHistoria
    from src.services import narrativa_services as nv

    pendientes = []
    for s in secuencias_sin_leer():
        ruta = _archivo(s["thumbnail"])
        if ruta is not None:
            pendientes.append({**s, "ruta": ruta})
        if len(pendientes) == limite:
            break
    if not pendientes:
        return 0
    try:
        data = nv._claude("Historias:\n" + "\n".join(str(p["ruta"]) for p in pendientes),
                          [str(p["ruta"]) for p in pendientes], system=SYSTEM_APERTURA, carpeta=pendientes[0]["ruta"].parent)
    except Exception as e:  # noqa: BLE001 — se reintenta en la próxima sincronización
        logger.info("Aperturas de historias: no se pudieron leer: %s", str(e)[:200])
        return 0
    textos = {str(x.get("archivo")): " ".join(str(x.get("texto") or "").split())[:300]
              for x in data.get("historias") or [] if isinstance(x, dict) and x.get("archivo")}
    guardadas = 0
    with db_session:
        for p in pendientes:
            if p["ruta"].name not in textos:
                continue   # Claude no la devolvió: queda para la próxima
            AperturaHistoria(ig_id=p["ig_id"], fecha=p["fecha"], texto=textos[p["ruta"].name])
            guardadas += 1
    logger.info("Aperturas de historias: %s leídas", guardadas)
    return guardadas
