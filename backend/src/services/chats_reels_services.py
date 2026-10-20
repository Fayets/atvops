"""
Los chats de cada reel, sin ManyChat.

Antes un reel sumaba chats si alguien lo prendía a mano en Marketing → Reels y escribía el
número, o si el flujo de ManyChat avisaba con la palabra cargada en su JSON. Las dos cosas
dependían de que alguien se acordara.

Quien comenta la palabra de un reel es justamente quien dispara la automatización. Ops ya
lee los comentarios de cada reel con el token de Instagram, así que alcanza con:

1. **Saber cuál es la palabra.** Primero la que el texto pide entre comillas (`comenta
   "info"`), que es la forma habitual y vale sola. Si no, una palabra gritada después del
   verbo ("comentá FORMULARIO"), que necesita que alguien la haya comentado. Y si el texto
   no la dice, el comentario que más se repite, siempre que sea una palabra corta y la haya
   escrito una buena parte de la gente: así se encontró "clase" o "papa".
2. **Contar personas distintas** que comentaron esa palabra. Una persona es un chat por
   reel, con la fecha de su comentario: el chat cae en el mes en que se abrió.

Un reel sin palabra reconocible no suma: no pidió que le escriban.
"""

from __future__ import annotations

import logging
import re
import unicodedata
import urllib.parse
from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

logger = logging.getLogger("atv_ops.chats_reels")
AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")

DIAS = 60              # cuántos días hacia atrás se miran los reels en cada pasada
MAX_COMENTARIOS = 3000  # tope por reel, por si uno explota
MIN_PERSONAS = 5        # para tomar el comentario más repetido como la palabra
MIN_PROPORCION = 0.35   # … y que lo haya escrito al menos esta parte de la gente
MAX_PALABRAS = 3        # "doc", "clase", "quiero el doc": una llamada a la acción es corta


def normalizar(texto: str | None) -> str:
    """Minúsculas, sin acentos, sin emojis ni signos: "Clase🔥" y "clase" son lo mismo."""
    base = unicodedata.normalize("NFD", str(texto or "").lower())
    sin_acentos = "".join(c for c in base if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9ñ ]+", " ", sin_acentos)).strip()


def coincide(comentario: str, palabra: str) -> bool:
    """La palabra está en el comentario como palabra entera ("doc" sí en "el doc", no en "doctor")."""
    return bool(palabra) and f" {palabra} " in f" {comentario} "


def detectar_palabra(caption: str | None, comentarios: list[str]) -> str | None:
    """La palabra del reel, o None si el reel no pidió ninguna. `comentarios` ya normalizados."""
    from src.services.instagram_services import palabra_citada, palabra_clave

    comentarios = [c for c in comentarios if c]
    # Entre comillas el texto no deja dudas: es la palabra, aunque Instagram no devuelva
    # ningún comentario (de los que piden una palabra, oculta buena parte por spam).
    citada = normalizar(palabra_citada(caption or ""))
    if citada:
        return citada
    pedida = normalizar(palabra_clave(caption or ""))
    if pedida and any(coincide(c, pedida) for c in comentarios):
        return pedida
    cortos = Counter(c for c in comentarios if len(c.split()) <= MAX_PALABRAS)
    if not cortos:
        return None
    palabra, veces = cortos.most_common(1)[0]
    personas = len(comentarios)
    if veces >= MIN_PERSONAS and veces / personas >= MIN_PROPORCION:
        return palabra
    return None


def _comentarios(token: str, reel_id: str) -> list[dict]:
    from src.services import audiencia_services as aud

    url, params, out = f"{reel_id}/comments", {"fields": "id,text,username,timestamp", "limit": 50}, []
    while url and len(out) < MAX_COMENTARIOS:
        r = aud._pedir(token, url, **params)
        out.extend(r.get("data") or [])
        siguiente = (r.get("paging") or {}).get("next")
        if not siguiente:
            break
        url = aud._ruta_siguiente(siguiente).split("?")[0]
        params = dict(urllib.parse.parse_qsl(siguiente.split("?", 1)[1]))
        params.pop("access_token", None)
    return out + _de_apify(reel_id, out)


def _de_apify(reel_id: str, de_la_api: list[dict]) -> list[dict]:
    """Los comentarios que la API no devolvió, leídos con Apify (ver apify_services)."""
    import json

    from pony.orm import db_session

    from src.models import PublicacionIg
    from src.services import apify_services

    with db_session:
        p = PublicacionIg.get(ig_id=str(reel_id))
        if p is None:
            return []
        permalink = p.permalink
        try:
            total = int(json.loads(p.metricas or "{}").get("comments") or 0)
        except (ValueError, TypeError):
            total = 0
    if not apify_services.hace_falta(len(de_la_api), total):
        return []
    ya = {c.get("id") for c in de_la_api}
    return [c for c in apify_services.comentarios(str(reel_id), permalink, total) if c["id"] not in ya]


def _momento(iso: str | None) -> datetime:
    """Hora de Argentina, como las publicaciones: así el chat cae en el mes correcto."""
    try:
        return datetime.strptime(iso or "", "%Y-%m-%dT%H:%M:%S%z").astimezone(AR_TZ).replace(tzinfo=None)
    except ValueError:
        return datetime.utcnow()


def guardar(reel_id: str, palabra: str, comentarios: list[dict], propia: str) -> int:
    """Una fila por persona que comentó la palabra. Devuelve cuántas nuevas."""
    from pony.orm import db_session

    from src.models import ChatReel

    nuevos = 0
    with db_session:
        ya = {c.usuario for c in ChatReel.select(lambda c: c.reel_id == reel_id)}
        for c in sorted(comentarios, key=lambda x: x.get("timestamp") or ""):
            usuario = (c.get("username") or "").strip().lower()
            if not usuario or usuario == propia or usuario in ya:
                continue
            if not coincide(normalizar(c.get("text")), palabra):
                continue
            ChatReel(reel_id=reel_id, usuario=usuario[:120], palabra=palabra[:60], at=_momento(c.get("timestamp")))
            ya.add(usuario)
            nuevos += 1
    return nuevos


def sincronizar(dias: int = DIAS) -> dict:
    """Lee los comentarios de los reels recientes y anota los chats nuevos."""
    from pony.orm import db_session

    from src.models import PublicacionIg
    from src.services import audiencia_services as aud

    token, uid = aud._credenciales()
    propia = aud._cuenta_propia(token, uid)
    desde = datetime.utcnow() - timedelta(days=dias)
    with db_session:
        reels = [(p.ig_id, p.caption) for p in list(PublicacionIg.select())
                 if p.tipo == "reel" and p.publicado_at and p.publicado_at >= desde]
    con_palabra = nuevos = 0
    for reel_id, caption in reels:
        palabra, n = _procesar(token, propia, reel_id, caption)
        con_palabra += 1 if palabra else 0
        nuevos += n
    resultado = {"reels": len(reels), "conPalabra": con_palabra, "nuevos": nuevos}
    logger.info("Chats de reels: %s", resultado)
    return resultado


def _procesar(token: str, propia: str, reel_id: str, caption: str | None) -> tuple[str | None, int]:
    """Lee los comentarios de un reel, detecta su palabra y anota los chats. (palabra, nuevos)."""
    from pony.orm import db_session

    from src.models import PublicacionIg

    try:
        comentarios = [c for c in _comentarios(token, reel_id)
                       if (c.get("username") or "").strip().lower() != propia]
    except Exception as e:  # noqa: BLE001
        logger.warning("Chats de reels: no se leyeron los comentarios de %s: %s", reel_id, str(e)[:160])
        return None, 0
    # Una persona cuenta una vez para elegir la palabra: el que comenta tres veces no la define.
    por_persona: dict[str, str] = {}
    for c in comentarios:
        por_persona.setdefault((c.get("username") or "").lower(), normalizar(c.get("text")))
    manual = _correccion(reel_id)
    if manual is not None and not manual["esCta"]:
        _borrar_chats(reel_id)          # lo marcaron sin CTA: no suma nada
        return None, 0
    if manual is not None and manual.get("palabra"):
        palabra = normalizar(manual["palabra"])
    else:
        palabra = detectar_palabra(caption, list(por_persona.values()))
    if not palabra:
        return None, 0
    _borrar_chats(reel_id, salvo_palabra=palabra)   # si cambió la palabra, se recuenta
    nuevos = guardar(reel_id, palabra, comentarios, propia)
    with db_session:
        p = PublicacionIg.get(ig_id=reel_id)
        if p is not None and (p.keyword or "").strip().lower() != palabra:
            p.keyword = palabra
    return palabra, nuevos


def sincronizar_reel(reel_id: str, caption: str | None = None) -> dict:
    """Un reel puntual, de cualquier fecha (lo usa el análisis a mano de Audiencia)."""
    from src.services import audiencia_services as aud

    token, uid = aud._credenciales()
    palabra, nuevos = _procesar(token, aud._cuenta_propia(token, uid), str(reel_id), caption)
    return {"reel": reel_id, "palabra": palabra, "nuevos": nuevos}


def _correccion(reel_id: str) -> dict | None:
    from pony.orm import db_session

    from src.models import ReelCta

    with db_session:
        c = ReelCta.get(reel_id=reel_id)
        return {"esCta": c.es_cta, "palabra": c.palabra, "por": c.por} if c else None


def _borrar_chats(reel_id: str, salvo_palabra: str | None = None) -> None:
    from pony.orm import db_session

    from src.models import ChatReel

    with db_session:
        for c in list(ChatReel.select(lambda c: c.reel_id == reel_id)):
            if salvo_palabra is None or c.palabra != salvo_palabra:
                c.delete()


def corregir(reel_id: str, es_cta: bool | None, palabra: str | None, quien: str) -> dict:
    """Lo que dice la persona manda sobre lo detectado.

    es_cta None: vuelve a decidir Ops solo. False: no es un reel con CTA, no suma. True:
    tiene CTA; con `palabra` cuenta esa (si no, la que detecte Ops). Recuenta en el momento."""
    from fastapi import HTTPException
    from pony.orm import db_session

    from src.models import PublicacionIg, ReelCta

    reel_id = str(reel_id or "").strip()
    palabra = normalizar(palabra) if palabra else None
    with db_session:
        p = PublicacionIg.get(ig_id=reel_id)
        if p is None or p.tipo != "reel":
            raise HTTPException(status_code=404, detail="Ese reel no está en Ops.")
        caption = p.caption
        fila = ReelCta.get(reel_id=reel_id)
        if es_cta is None:
            if fila:
                fila.delete()
        elif fila:
            fila.es_cta, fila.palabra, fila.por, fila.at = es_cta, palabra, quien, datetime.utcnow()
        else:
            ReelCta(reel_id=reel_id, es_cta=es_cta, palabra=palabra, por=quien)
    if es_cta is False:
        _borrar_chats(reel_id)
    else:
        sincronizar_reel(reel_id, caption)
    return estado().get(reel_id) or {"origen": "auto", "esCta": False, "palabra": None, "chats": 0}


def estado() -> dict[str, dict]:
    """reel_id → si tiene CTA, con qué palabra, cuántos chats y si lo decidió Ops o una persona.
    Un reel que no aparece no tiene CTA detectado."""
    from pony.orm import db_session

    from src.models import PublicacionIg, ReelCta
    from src.services.instagram_services import palabra_citada

    chats = por_reel()
    out = {rid: {"origen": "auto", "esCta": True, "palabra": c["palabra"], "chats": c["chats"]}
           for rid, c in chats.items()}
    with db_session:
        # Tener CTA y tener chats son dos cosas distintas, y antes estaban pegadas: el estado
        # salía solo de contar gente que comentó la palabra, así que un reel que la pedía pero
        # del que Instagram no devuelve comentarios —oculta por spam justo los que la escriben—
        # figuraba "Sin CTA". Si el texto la pide entre comillas, tiene CTA con 0 chats.
        for p in list(PublicacionIg.select()):
            if p.tipo != "reel" or p.ig_id in out:
                continue
            palabra = normalizar(palabra_citada(p.caption or ""))
            if palabra:
                out[p.ig_id] = {"origen": "auto", "esCta": True, "palabra": palabra, "chats": 0}
        for f in list(ReelCta.select()):
            c = chats.get(f.reel_id) or {}
            out[f.reel_id] = {"origen": "manual", "esCta": f.es_cta, "por": f.por,
                              "palabra": (f.palabra or c.get("palabra")) if f.es_cta else None,
                              "chats": int(c.get("chats") or 0) if f.es_cta else 0}
    return out


def por_reel() -> dict[str, dict]:
    """reel_id → {chats, palabra}: cuántas personas comentaron la palabra, de siempre."""
    from pony.orm import db_session

    from src.models import ChatReel

    out: dict[str, dict] = {}
    with db_session:
        for c in list(ChatReel.select()):
            d = out.setdefault(c.reel_id, {"chats": 0, "palabra": c.palabra})
            d["chats"] += 1
    return out


def del_periodo(inicio: datetime, fin: datetime) -> list:
    """Los chats que se abrieron en el período (por la fecha del comentario)."""
    from pony.orm import db_session

    from src.models import ChatReel

    with db_session:
        return [(c.reel_id, c.palabra, c.at) for c in ChatReel.select(lambda c: c.at >= inicio and c.at < fin)]
