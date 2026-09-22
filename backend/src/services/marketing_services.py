"""
Marketing y Ads con datos reales del CRM de ATV Marketing.

Ads: campañas de Meta sincronizadas (`ads_campaign`).
Contenido: reels de Instagram (`reelcontent`), videos de YouTube (`youtubecontent`) y
secuencias de historias (`storysequence`).
Setting: los reportes diarios de los setters, que son el techo del embudo.

Si una fuente no tiene datos del período, los números van en cero: no se inventa nada.
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime

from decouple import config

from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.marketing")

CACHE_SEGUNDOS = int(config("MARKETING_CACHE_SEGUNDOS", default=300))
_cache: dict = {}
_lock = threading.Lock()


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _rango(mes: str) -> tuple[date, date]:
    anio, m = int(mes[:4]), int(mes[5:7])
    return date(anio, m, 1), date(anio + (m == 12), (m % 12) + 1, 1)


def _vacio(mes: str, detalle: str) -> dict:
    inicio, fin = _rango(mes)
    return {
        "mes": mes, "generadoAt": datetime.now(AR_TZ).isoformat(), "conectado": False, "detalle": detalle,
        "ads": {"gastoUsd": 0, "impresiones": 0, "clicks": 0, "conversiones": 0, "costoPorConversionUsd": 0,
                "alcance": 0, "ctr": 0, "campanias": []},
        "contenido": {"reels": 0, "reproducciones": 0, "alcance": 0, "interacciones": 0, "publicaciones": [],
                      "youtube": {"videos": 0, "vistas": 0, "chats": 0}},
        "historias": {"secuencias": 0, "chats": 0, "cashUsd": 0, "conCta": 0},
        "conversaciones": {"total": 0, "respondieron": 0, "porPalabra": {}, "historicoPorPalabra": {},
                           "sinPalabra": 0, "fuente": "Instagram · ManyChat"},
        "setting": {"conversaciones": 0, "linksEnviados": 0, "agendas": 0, "porPersona": []},
        "desde": inicio.isoformat(), "hasta": fin.isoformat(),
    }


def _contenido_propio(inicio: date, fin: date) -> tuple[list, list, list]:
    """Reels, videos e historias de la base de ATV Ops, con las claves que espera la vista.

    Antes salían de `reelcontent`, `youtubecontent` y `storysequence` de atv-mkt. Hoy el
    contenido lo sincroniza ATV Ops con sus propias credenciales: esto solo traduce los
    nombres de los campos para no tocar todo lo que los consume.
    """
    from datetime import datetime as _dt

    from src.services import instagram_services, youtube_services

    def _cuando(iso):
        """Lo que sigue espera fechas, no textos: el CRM las devolvía ya convertidas."""
        try:
            return _dt.fromisoformat(iso) if iso else None
        except (TypeError, ValueError):
            return None

    ig = instagram_services.contenido(inicio, fin)
    yt = youtube_services.contenido(inicio, fin)
    reels = [{
        "title": r.get("titulo"), "permalink": r.get("url"), "fecha_publicacion": _cuando(r.get("fecha")),
        "plays": r.get("views", 0), "reach": r.get("reach", 0), "likes": r.get("likes", 0),
        "comentarios": r.get("comments", 0), "shares": r.get("shares", 0),
        "guardados": r.get("saved", 0), "keyword": r.get("keyword", ""), "chats_manuales": 0,
    } for r in ig.get("reels", [])]
    videos = [{
        "title": v.get("titulo"), "url": v.get("url"), "published_at": _cuando(v.get("fecha")),
        "views": v.get("vistas", 0), "likes": v.get("likes", 0),
        "comments_count": v.get("comentarios", 0),
        # CTR, impresiones y chats solo salen de YouTube Studio: no se inventan.
        "impressions": 0, "ctr": None, "chats": 0, "thumbnail_url": v.get("thumbnail"),
    } for v in yt.get("videos", [])]
    historias = [{
        "sequence_date": _cuando(s.get("fecha")), "title": f"{s.get('piezas', 0)} historias",
        "dolor": "", "angulo": "", "cta": "", "cash": 0,
        "chats": s.get("respuestas", 0), "has_cta": False,
    } for s in ig.get("secuencias", [])]
    return reels, videos, historias


def _setting_propio(inicio: date, fin: date) -> list[dict]:
    """Los reportes diarios del setter, de la base de ATV Ops."""
    from src.services import ventas_services

    por_persona: dict[str, dict] = {}
    for r in ventas_services._reportes_propios("setter", inicio):
        if not (inicio <= r["fecha"] < fin):
            continue
        d = por_persona.setdefault(r["nombre"], {"nombre": r["nombre"], "conversaciones": 0,
                                                 "links_enviados": 0, "agendas": 0, "reportes": 0})
        d["conversaciones"] += _num(r.get("conversaciones"))
        d["links_enviados"] += _num(r.get("links_enviados"))
        d["agendas"] += _num(r.get("agendas"))
        d["reportes"] += 1
    return sorted(por_persona.values(), key=lambda x: -x["conversaciones"])


def _campanias_de_meta(mes: str) -> list[dict]:
    """Las campañas del mes, del Ads Manager. Si Ads no contesta, el mes sigue existiendo:
    el resto del tablero —contenido, chats, setting— no depende de esto."""
    try:
        from src.services.meta_services import MetaServices

        return MetaServices().ads_resumen(mes).get("campanias") or []
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron leer las campañas de Meta: %s", str(e)[:160])
        return []


def _conversaciones_del_bot(inicio: date, fin: date) -> dict:
    """Las conversaciones que se abrieron solas en Instagram, por contenido.

    Cuando alguien comenta la palabra de un reel, ManyChat le abre el DM y atv-mkt guarda
    el lead con esa palabra y la fecha en que arrancó el bot. Contar esos leads es contar
    las conversaciones: no hace falta que nadie las reporte a mano.
    """
    from datetime import datetime as _dt

    from pony.orm import db_session

    from src.models import ConversacionIg

    arranca = _dt.combine(inicio, _dt.min.time())
    termina = _dt.combine(fin, _dt.min.time())
    with db_session:
        todas = [c for c in list(ConversacionIg.select()) if c.evento == "conversacion"]
    del_mes = [c for c in todas if arranca <= c.at < termina]

    def _palabra(c) -> str:
        return (c.keyword or "").strip().lower()

    por_palabra: dict[str, int] = {}
    for c in del_mes:
        if _palabra(c):
            por_palabra[_palabra(c)] = por_palabra.get(_palabra(c), 0) + 1

    # Del total del mes y de siempre: un reel viejo sigue abriendo conversaciones.
    historico: dict[str, dict] = {}
    for c in todas:
        if not _palabra(c):
            continue
        d = historico.setdefault(_palabra(c), {"total": 0, "ultima": None})
        d["total"] += 1
        if d["ultima"] is None or c.at > d["ultima"]:
            d["ultima"] = c.at

    return {
        "total": len(del_mes),
        # `respondio_auto` era una columna del CRM y no tiene equivalente acá: el webhook
        # avisa que la conversación se abrió, no si el bot llegó a contestar. Cero es más
        # honesto que un número inventado.
        "respondieron": 0,
        "porPalabra": dict(sorted(por_palabra.items(), key=lambda kv: -kv[1])),
        "historicoPorPalabra": {k: {"total": v["total"],
                                    "ultima": v["ultima"].isoformat() if v["ultima"] else None}
                                for k, v in historico.items()},
        "sinPalabra": max(0, len(del_mes) - sum(por_palabra.values())),
    }


def resumen(mes: str | None = None, refrescar: bool = False) -> dict:
    """Todo lo que muestran Marketing y Ads, del mes elegido."""
    hoy = datetime.now(AR_TZ).date()
    mes = mes or hoy.strftime("%Y-%m")
    with _lock:
        guardado = _cache.get(mes)
        if guardado and not refrescar and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]

    inicio, fin = _rango(mes)
    try:
        campanias = _campanias_de_meta(mes)
        reels, videos, historias = _contenido_propio(inicio, fin)
        setting = _setting_propio(inicio, fin)
        bot = _conversaciones_del_bot(inicio, fin)
    except Exception as e:  # noqa: BLE001
        logger.warning("Marketing: %s", str(e)[:200])
        return _vacio(mes, "No se pudo armar el mes de marketing.")

    gasto = sum(_num(c["gastoUsd"]) for c in campanias)
    # Meta no devuelve impresiones ni clicks a nivel campaña en este pedido: lo que
    # sí da es alcance, frecuencia y leads. Lo que no viene, no se inventa.
    impresiones = 0
    clicks = 0
    conversiones = sum(_num(c["leads"]) for c in campanias)
    interacciones = sum(_num(r["likes"]) + _num(r["comentarios"]) + _num(r["shares"]) + _num(r["guardados"]) for r in reels)

    data = {
        "mes": mes,
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "conectado": True,
        "desde": inicio.isoformat(),
        "hasta": fin.isoformat(),
        "ads": {
            "gastoUsd": round(gasto, 2),
            "impresiones": int(impresiones),
            "clicks": int(clicks),
            "conversiones": int(conversiones),
            "alcance": 0,
            "ctr": round(clicks / impresiones * 100, 2) if impresiones else 0,
            "costoPorConversionUsd": round(gasto / conversiones, 2) if conversiones else 0,
            "campanias": [
                {
                    "nombre": c["nombre"], "estado": c["estado"], "objetivo": c["objetivo"],
                    "gastoUsd": round(_num(c["gastoUsd"]), 2), "impresiones": 0,
                    "clicks": 0, "conversiones": int(_num(c["leads"])),
                    "costoPorConversionUsd": round(_num(c["cplUsd"]), 2),
                    "alcance": 0, "ctr": 0, "frecuencia": _num(c.get("frecuencia")),
                }
                for c in campanias
            ],
        },
        "conversaciones": {**bot, "fuente": "Instagram · ManyChat"},
        "contenido": {
            "reels": len(reels),
            "reproducciones": int(sum(_num(r["plays"]) for r in reels)),
            "alcance": int(sum(_num(r["reach"]) for r in reels)),
            "interacciones": int(interacciones),
            "publicaciones": [
                {
                    "titulo": (r["title"] or "").strip() or "(sin título)", "url": r["permalink"],
                    "fecha": r["fecha_publicacion"].isoformat() if r["fecha_publicacion"] else None,
                    "reproducciones": int(_num(r["plays"])), "alcance": int(_num(r["reach"])),
                    "likes": int(_num(r["likes"])), "comentarios": int(_num(r["comentarios"])),
                    "guardados": int(_num(r["guardados"])), "keyword": (r["keyword"] or "").strip(),
                    # Cuántas conversaciones abrió: las del mes y las de toda su vida.
                    "conversaciones": bot["porPalabra"].get((r["keyword"] or "").strip().lower(), 0),
                    "conversacionesTotales": (bot["historicoPorPalabra"].get((r["keyword"] or "").strip().lower()) or {}).get("total", 0),
                    "chatsManuales": int(_num(r["chats_manuales"])),
                }
                for r in reels[:20]
            ],
            "youtube": {
                "videos": len(videos),
                "vistas": int(sum(_num(v["views"]) for v in videos)),
                "chats": int(sum(_num(v.get("chats")) for v in videos)),
                "publicaciones": [
                    {
                        "titulo": v["title"], "url": v["url"],
                        "fecha": v["published_at"].isoformat() if v["published_at"] else None,
                        "vistas": int(_num(v["views"])), "likes": int(_num(v["likes"])),
                        "ctr": round(_num(v["ctr"]), 2), "chats": int(_num(v.get("chats"))),
                        "thumbnail": (v.get("thumbnail_url") or "").strip() or None,
                    }
                    for v in videos[:10]
                ],
            },
        },
        "historias": {
            "secuencias": len(historias),
            "chats": int(sum(_num(h["chats"]) for h in historias)),
            "cashUsd": round(sum(_num(h["cash"]) for h in historias), 2),
            "conCta": sum(1 for h in historias if h["has_cta"]),
            "ultimas": [
                {
                    "fecha": h["sequence_date"].isoformat() if h["sequence_date"] else None,
                    "titulo": h["title"], "dolor": h["dolor"], "angulo": h["angulo"], "cta": h["cta"],
                    "chats": int(_num(h["chats"])), "cashUsd": round(_num(h["cash"]), 2),
                }
                for h in historias[:15]
            ],
        },
        "setting": {
            # Lo que el equipo reporta a mano; las que abre el bot van en `conversaciones`.
            "conversaciones": int(sum(_num(s["conversaciones"]) for s in setting)),
            "linksEnviados": int(sum(_num(s["links_enviados"]) for s in setting)),
            "agendas": int(sum(_num(s["agendas"]) for s in setting)),
            "porPersona": [
                {
                    "nombre": s["nombre"], "conversaciones": int(_num(s["conversaciones"])),
                    "linksEnviados": int(_num(s["links_enviados"])), "agendas": int(_num(s["agendas"])),
                    "reportes": int(_num(s["reportes"])),
                }
                for s in setting
            ],
        },
    }
    with _lock:
        _cache[mes] = {"at": datetime.utcnow(), "data": data}
    return data


def estado() -> dict:
    """Si Ads contesta. Antes se miraba la copia que atv-mkt guardaba; ahora se pregunta
    en el origen, que es el Ads Manager con las claves propias de ATV Ops."""
    try:
        from src.services.meta_services import MetaServices

        datos = MetaServices().ads_resumen()
        return {"conectado": True, "campanias": len(datos.get("campanias") or []),
                "ultimaSync": datos.get("syncAt")}
    except Exception as e:  # noqa: BLE001
        return {"conectado": False, "detalle": str(e)[:200]}
