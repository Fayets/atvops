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

from src.services import crm_db
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
                      "youtube": {"videos": 0, "vistas": 0}},
        "historias": {"secuencias": 0, "chats": 0, "cashUsd": 0, "conCta": 0},
        "conversaciones": {"total": 0, "respondieron": 0, "porPalabra": {}, "historicoPorPalabra": {},
                           "sinPalabra": 0, "fuente": "Instagram · ManyChat"},
        "setting": {"conversaciones": 0, "linksEnviados": 0, "agendas": 0, "porPersona": []},
        "desde": inicio.isoformat(), "hasta": fin.isoformat(),
    }


def _conversaciones_del_bot(inicio: date, fin: date) -> dict:
    """Las conversaciones que se abrieron solas en Instagram, por contenido.

    Cuando alguien comenta la palabra de un reel, ManyChat le abre el DM y atv-mkt guarda
    el lead con esa palabra y la fecha en que arrancó el bot. Contar esos leads es contar
    las conversaciones: no hace falta que nadie las reporte a mano.
    """
    total = crm_db.consultar(
        "SELECT count(*) n FROM lead WHERE fecha_bot >= %s AND fecha_bot < %s", (inicio, fin))
    respondieron = crm_db.consultar(
        "SELECT count(*) n FROM lead WHERE fecha_bot >= %s AND fecha_bot < %s AND respondio_auto", (inicio, fin))
    por_palabra = crm_db.consultar(
        "SELECT lower(trim(keyword)) palabra, count(*) n FROM lead "
        "WHERE fecha_bot >= %s AND fecha_bot < %s AND coalesce(keyword, '') <> '' "
        "GROUP BY 1 ORDER BY 2 DESC", (inicio, fin))
    # Del total del mes y de siempre: un reel viejo sigue abriendo conversaciones.
    historico = crm_db.consultar(
        "SELECT lower(trim(keyword)) palabra, count(*) n, max(fecha_bot) ultima FROM lead "
        "WHERE fecha_bot IS NOT NULL AND coalesce(keyword, '') <> '' GROUP BY 1")
    return {
        "total": int(_num(total[0]["n"])) if total else 0,
        "respondieron": int(_num(respondieron[0]["n"])) if respondieron else 0,
        "porPalabra": {f["palabra"]: int(_num(f["n"])) for f in por_palabra},
        "historicoPorPalabra": {f["palabra"]: {"total": int(_num(f["n"])),
                                               "ultima": f["ultima"].isoformat() if f["ultima"] else None}
                                for f in historico},
        "sinPalabra": max(0, (int(_num(total[0]["n"])) if total else 0) - sum(int(_num(f["n"])) for f in por_palabra)),
    }


def resumen(mes: str | None = None, refrescar: bool = False) -> dict:
    """Todo lo que muestran Marketing y Ads, del mes elegido."""
    hoy = datetime.now(AR_TZ).date()
    mes = mes or hoy.strftime("%Y-%m")
    with _lock:
        guardado = _cache.get(mes)
        if guardado and not refrescar and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]

    if not crm_db.disponible():
        return _vacio(mes, "No hay conexión al CRM de Marketing.")

    inicio, fin = _rango(mes)
    try:
        campanias = crm_db.consultar(
            "SELECT nombre, estado, objective, spend, impressions, clicks, conversions, "
            "cost_per_conversion, reach, period_start, period_end "
            "FROM ads_campaign WHERE period_start < %s AND period_end >= %s ORDER BY spend DESC",
            (fin, inicio),
        )
        reels = crm_db.consultar(
            "SELECT title, permalink, fecha_publicacion, plays, reach, likes, comentarios, shares, guardados, keyword, chats_manuales "
            "FROM reelcontent WHERE fecha_publicacion >= %s AND fecha_publicacion < %s ORDER BY plays DESC",
            (inicio, fin),
        )
        videos = crm_db.consultar(
            "SELECT title, url, published_at, views, likes, comments_count, impressions, ctr "
            "FROM youtubecontent WHERE published_at >= %s AND published_at < %s ORDER BY views DESC",
            (inicio, fin),
        )
        historias = crm_db.consultar(
            "SELECT sequence_date, title, dolor, angulo, cta, cash, chats, has_cta "
            "FROM storysequence WHERE sequence_date >= %s AND sequence_date < %s ORDER BY sequence_date DESC",
            (inicio, fin),
        )
        setting = crm_db.consultar(
            "SELECT m.nombre, sum(r.conversaciones) conversaciones, sum(r.links_enviados) links_enviados, "
            "sum(r.agendas) agendas, count(*) reportes "
            "FROM setter_report r JOIN teammember m ON m.id = r.member_id "
            "WHERE r.fecha >= %s AND r.fecha < %s GROUP BY m.nombre ORDER BY 2 DESC",
            (inicio, fin),
        )
        bot = _conversaciones_del_bot(inicio, fin)
    except Exception as e:  # noqa: BLE001
        logger.warning("Marketing: %s", str(e)[:200])
        return _vacio(mes, "No se pudo leer el CRM de Marketing.")

    gasto = sum(_num(c["spend"]) for c in campanias)
    impresiones = sum(_num(c["impressions"]) for c in campanias)
    clicks = sum(_num(c["clicks"]) for c in campanias)
    conversiones = sum(_num(c["conversions"]) for c in campanias)
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
            "alcance": int(sum(_num(c["reach"]) for c in campanias)),
            "ctr": round(clicks / impresiones * 100, 2) if impresiones else 0,
            "costoPorConversionUsd": round(gasto / conversiones, 2) if conversiones else 0,
            "campanias": [
                {
                    "nombre": c["nombre"], "estado": c["estado"], "objetivo": c["objective"],
                    "gastoUsd": round(_num(c["spend"]), 2), "impresiones": int(_num(c["impressions"])),
                    "clicks": int(_num(c["clicks"])), "conversiones": int(_num(c["conversions"])),
                    "costoPorConversionUsd": round(_num(c["cost_per_conversion"]), 2),
                    "alcance": int(_num(c["reach"])),
                    "ctr": round(_num(c["clicks"]) / _num(c["impressions"]) * 100, 2) if _num(c["impressions"]) else 0,
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
                "publicaciones": [
                    {
                        "titulo": v["title"], "url": v["url"],
                        "fecha": v["published_at"].isoformat() if v["published_at"] else None,
                        "vistas": int(_num(v["views"])), "likes": int(_num(v["likes"])),
                        "ctr": round(_num(v["ctr"]), 2),
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
    if not crm_db.disponible():
        return {"conectado": False, "detalle": "Falta MKT_DSN en el .env."}
    try:
        fila = crm_db.consultar("SELECT count(*) AS n, max(fecha_sync) AS ultimo FROM ads_campaign")[0]
        return {"conectado": True, "campanias": fila["n"],
                "ultimaSync": fila["ultimo"].isoformat() if fila["ultimo"] else None}
    except Exception as e:  # noqa: BLE001
        return {"conectado": False, "detalle": str(e)[:200]}
