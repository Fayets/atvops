"""
Reporte semanal de ATV: todo lo que pasó en una semana, en un solo lugar.

Junta las cuatro áreas con datos reales:
- Marketing: contenido publicado (reels, historias, YouTube) y lo que trajo el setting.
- Ventas: llamadas agendadas, shows, no shows, cierres, cash y facturación.
- Cartera: altas, bajas y lo que se cobró.
- Ads: inversión y conversiones (Meta reporta por mes, así que va el mes en curso).

Lo que no tenga fuente conectada va en cero. La comparación contra la meta se hace en la
vista, con el decreto que carga el equipo.
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime, timedelta

from decouple import config

from src.services import clients_db, crm_db
from src.services import onboarding_services as onboarding
from src.services import ventas_services as ventas
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.reporte")

CACHE_SEGUNDOS = int(config("REPORTE_CACHE_SEGUNDOS", default=300))
_cache: dict = {}
_lock = threading.Lock()


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _lunes(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _semana_de(texto: str | None) -> date:
    hoy = datetime.now(AR_TZ).date()
    if not texto:
        return _lunes(hoy)
    try:
        return _lunes(datetime.strptime(texto[:10], "%Y-%m-%d").date())
    except ValueError:
        return _lunes(hoy)


def _bloque_ventas(desde: date, hasta: date) -> dict:
    """Las llamadas con fecha en el rango, con la misma definición que usa Ventas."""
    if not crm_db.disponible():
        return {"agendadas": 0, "shows": 0, "noShows": 0, "sinReportar": 0, "sinCrm": 0, "cierres": 0,
                "cashUsd": 0, "facturacionUsd": 0, "showRate": None, "closeRate": None, "aovUsd": 0,
                "porCloser": [], "ventas": []}
    ahora = datetime.now(AR_TZ).replace(tzinfo=None)
    # _leads ya convierte las fechas a hora de Argentina; el calendario completa las
    # reuniones que el CRM no guarda (una segunda le pisa la fecha a la primera, o no entra).
    filas = ventas._sumar_reuniones_del_calendario(ventas._leads(desde, hasta), desde, hasta)
    precios = {ventas._norm(p["nombre"]): p["precioUsd"] for p in ventas.programas()}
    clases = [ventas._clasificar(f["resultado"], f["calificacion"], f["call"], ahora,
                                 f.get("soloCalendario", False)) for f in filas]
    utiles = [(f, c) for f, c in zip(filas, clases) if c != "descartada"]
    ventas_cerradas = [f for f, c in utiles if c == "cierre"]
    # La seña no suma al close rate: la venta todavía no está hecha.
    cierres = [f for f in ventas_cerradas if ventas._norm(f["resultado"]) == ventas._norm("Cerrado")]
    senas = [f for f in ventas_cerradas if f not in cierres]
    shows = sum(1 for _, c in utiles if c in ("show", "cierre"))
    no_shows = sum(1 for _, c in utiles if c == "no_show")
    sin_crm = sum(1 for _, c in utiles if c == "sin_crm")
    cash = sum(_num(f["pago"]) for f in ventas_cerradas)
    facturacion = sum(precios.get(ventas._norm((f["programa_ofrecido"] or "")), 0.0) for f in ventas_cerradas)

    por_closer: dict[str, dict] = {}
    for f, c in utiles:
        nombre = (f["closer"] or "").strip() or "Sin asignar"
        b = por_closer.setdefault(nombre, {"nombre": nombre, "agendadas": 0, "shows": 0,
                                           "cierres": 0, "senas": 0, "cashUsd": 0.0})
        b["agendadas"] += 1
        b["shows"] += 1 if c in ("show", "cierre") else 0
        if c == "cierre":
            b["cierres" if f in cierres else "senas"] += 1
            b["cashUsd"] += _num(f["pago"])

    evaluables = shows + no_shows
    return {
        "agendadas": len(utiles),
        "shows": shows,
        "noShows": no_shows,
        "sinReportar": sum(1 for _, c in utiles if c == "sin_reportar"),
        "sinCrm": sin_crm,
        "senas": len(senas),
        "cierres": len(cierres),
        "cashUsd": round(cash, 2),
        "facturacionUsd": round(facturacion, 2),
        "showRate": round(shows / evaluables * 100, 1) if evaluables else None,
        "closeRate": round(len(cierres) / shows * 100, 1) if shows else None,
        "aovUsd": round(facturacion / len(ventas_cerradas), 2) if ventas_cerradas else 0,
        "porCloser": sorted(
            [{**b, "cashUsd": round(b["cashUsd"], 2)} for b in por_closer.values()],
            key=lambda x: -x["cashUsd"],
        ),
        "ventas": [
            {
                "cliente": (f["nombre"] or "").strip() or "Sin nombre",
                "closer": (f["closer"] or "").strip() or "Sin asignar",
                "programa": (f["programa_ofrecido"] or "").strip(),
                "cashUsd": round(_num(f["pago"]), 2),
                "saldoUsd": round(_num(f["debe"]), 2),
                "facturacionUsd": precios.get(ventas._norm((f["programa_ofrecido"] or "")), 0.0),
                "fechaAt": f["call"].isoformat() if f["call"] else None,
            }
            for f in ventas_cerradas
        ],
    }


def _bloque_marketing(desde: date, hasta: date) -> dict:
    if not crm_db.disponible():
        return {"conversaciones": 0, "linksEnviados": 0, "agendas": 0, "seguimientos": 0,
                "reels": 0, "reproducciones": 0, "historias": 0, "chatsHistorias": 0,
                "videos": 0, "vistas": 0, "porSetter": [], "publicaciones": []}
    setting = crm_db.consultar(
        "SELECT m.nombre, coalesce(sum(r.conversaciones),0) c, coalesce(sum(r.links_enviados),0) l, "
        "coalesce(sum(r.agendas),0) a, coalesce(sum(r.seguimientos),0) s, count(*) dias "
        "FROM setter_report r JOIN teammember m ON m.id = r.member_id "
        "WHERE r.fecha >= %s AND r.fecha < %s GROUP BY m.nombre ORDER BY 2 DESC",
        (desde, hasta),
    )
    reels = crm_db.consultar(
        "SELECT title, permalink, fecha_publicacion, plays, reach, likes, comentarios, guardados "
        "FROM reelcontent WHERE fecha_publicacion >= %s AND fecha_publicacion < %s ORDER BY plays DESC",
        (desde, hasta),
    )
    historias = crm_db.consultar(
        "SELECT sequence_date, title, angulo, cta, chats FROM storysequence "
        "WHERE sequence_date >= %s AND sequence_date < %s ORDER BY sequence_date",
        (desde, hasta),
    )
    videos = crm_db.consultar(
        "SELECT title, url, published_at, views FROM youtubecontent "
        "WHERE published_at >= %s AND published_at < %s ORDER BY views DESC",
        (desde, hasta),
    )
    return {
        "conversaciones": int(sum(_num(s["c"]) for s in setting)),
        "linksEnviados": int(sum(_num(s["l"]) for s in setting)),
        "agendas": int(sum(_num(s["a"]) for s in setting)),
        "seguimientos": int(sum(_num(s["s"]) for s in setting)),
        "porSetter": [
            {"nombre": s["nombre"], "conversaciones": int(_num(s["c"])), "linksEnviados": int(_num(s["l"])),
             "agendas": int(_num(s["a"])), "diasReportados": int(_num(s["dias"]))}
            for s in setting
        ],
        "reels": len(reels),
        "reproducciones": int(sum(_num(r["plays"]) for r in reels)),
        "historias": len(historias),
        "chatsHistorias": int(sum(_num(h["chats"]) for h in historias)),
        "videos": len(videos),
        "vistas": int(sum(_num(v["views"]) for v in videos)),
        "publicaciones": (
            [{"tipo": "reel", "titulo": (r["title"] or "").strip() or "(sin título)", "url": r["permalink"],
              "fecha": r["fecha_publicacion"].isoformat() if r["fecha_publicacion"] else None,
              "metrica": int(_num(r["plays"])), "metricaLabel": "reproducciones"} for r in reels[:10]]
            + [{"tipo": "historia", "titulo": (h["title"] or "").strip() or (h["angulo"] or "Secuencia"),
                "url": None, "fecha": h["sequence_date"].isoformat() if h["sequence_date"] else None,
                "metrica": int(_num(h["chats"])), "metricaLabel": "chats"} for h in historias[:10]]
            + [{"tipo": "youtube", "titulo": v["title"], "url": v["url"],
                "fecha": v["published_at"].isoformat() if v["published_at"] else None,
                "metrica": int(_num(v["views"])), "metricaLabel": "vistas"} for v in videos[:5]]
        ),
    }


def _bloque_cartera(desde: date, hasta: date) -> dict:
    if not clients_db.disponible():
        return {"altas": 0, "bajas": 0, "cobradoUsd": 0, "cuotasPagadas": 0, "altasDetalle": [], "bajasDetalle": []}

    def _fecha(v):
        return v.date() if isinstance(v, datetime) else v

    clientes = clients_db.consultar(
        "SELECT nombre, plan_actual, fecha_inicio, fecha_baja, total_pagado_usd FROM {esquema}.clientes"
    )
    altas = [c for c in clientes if _fecha(c["fecha_inicio"]) and desde <= _fecha(c["fecha_inicio"]) < hasta]
    bajas = [c for c in clientes if _fecha(c["fecha_baja"]) and desde <= _fecha(c["fecha_baja"]) < hasta]
    pagos = clients_db.consultar(
        "SELECT q.monto_usd, q.fecha_pago, c.nombre FROM {esquema}.cuotas q "
        "JOIN {esquema}.clientes c ON c.id = q.cliente_id "
        "WHERE q.fecha_pago >= %s AND q.fecha_pago < %s",
        (desde, hasta),
    )
    return {
        "altas": len(altas),
        "bajas": len(bajas),
        "cuotasPagadas": len(pagos),
        "cobradoUsd": round(sum(_num(p["monto_usd"]) for p in pagos), 2),
        "altasDetalle": [{"cliente": (c["nombre"] or "").strip(), "plan": (c["plan_actual"] or "").strip()} for c in altas],
        "bajasDetalle": [{"cliente": (c["nombre"] or "").strip(), "plan": (c["plan_actual"] or "").strip()} for c in bajas],
    }


def _bloque_ads(mes_inicio: date, mes_fin: date) -> dict:
    """Meta reporta por período mensual, así que esto es del mes, no de la semana."""
    if not crm_db.disponible():
        return {"gastoUsd": 0, "conversiones": 0, "clicks": 0, "impresiones": 0, "campanias": 0, "periodo": "mes"}
    filas = crm_db.consultar(
        "SELECT spend, conversions, clicks, impressions FROM ads_campaign "
        "WHERE period_start < %s AND period_end >= %s",
        (mes_fin, mes_inicio),
    )
    return {
        "gastoUsd": round(sum(_num(f["spend"]) for f in filas), 2),
        "conversiones": int(sum(_num(f["conversions"]) for f in filas)),
        "clicks": int(sum(_num(f["clicks"]) for f in filas)),
        "impresiones": int(sum(_num(f["impressions"]) for f in filas)),
        "campanias": len(filas),
        "periodo": "mes",
    }


def reporte(semana: str | None = None, refrescar: bool = False) -> dict:
    """Una semana completa, con el acumulado del mes para medir contra la meta."""
    inicio = _semana_de(semana)
    clave = inicio.isoformat()
    with _lock:
        guardado = _cache.get(clave)
        if guardado and not refrescar and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]

    hoy = datetime.now(AR_TZ).date()
    fin = inicio + timedelta(days=7)
    previa_inicio = inicio - timedelta(days=7)
    mes_inicio = inicio.replace(day=1)
    mes_fin = date(mes_inicio.year + (mes_inicio.month == 12), (mes_inicio.month % 12) + 1, 1)
    corte_mes = min(mes_fin, max(fin, hoy + timedelta(days=1)))

    semanas_mes = []
    cursor = _lunes(mes_inicio)
    while cursor < mes_fin:
        semanas_mes.append(cursor)
        cursor += timedelta(days=7)
    restantes = [s for s in semanas_mes if s > inicio and s <= _lunes(mes_fin - timedelta(days=1))]

    data = {
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "semana": {
            "inicio": inicio.isoformat(),
            "fin": (fin - timedelta(days=1)).isoformat(),
            "numero": inicio.isocalendar()[1],
            "esActual": inicio == _lunes(hoy),
            "diasTranscurridos": max(0, min(7, (hoy - inicio).days + 1)),
        },
        "mes": {
            "mes": mes_inicio.strftime("%Y-%m"),
            "semanasTotales": len(semanas_mes),
            "semanasRestantes": len(restantes),
            "diaHoy": (hoy - mes_inicio).days + 1 if mes_inicio <= hoy < mes_fin else (mes_fin - mes_inicio).days,
            "diasMes": (mes_fin - mes_inicio).days,
        },
        "ventas": _bloque_ventas(inicio, fin),
        "ventasPrevia": _bloque_ventas(previa_inicio, inicio),
        "ventasMes": _bloque_ventas(mes_inicio, corte_mes),
        "marketing": _bloque_marketing(inicio, fin),
        "marketingPrevia": _bloque_marketing(previa_inicio, inicio),
        "marketingMes": _bloque_marketing(mes_inicio, corte_mes),
        "cartera": _bloque_cartera(inicio, fin),
        "onboarding": onboarding.semana(inicio, fin),
        "onboardingPrevia": onboarding.semana(previa_inicio, inicio),
        "carteraMes": _bloque_cartera(mes_inicio, corte_mes),
        "ads": _bloque_ads(mes_inicio, mes_fin),
        "fuentes": {
            "crm": crm_db.disponible(),
            "clients": clients_db.disponible(),
            "onboarding": clients_db.disponible(),
        },
    }
    with _lock:
        _cache[clave] = {"at": datetime.utcnow(), "data": data}
    return data
