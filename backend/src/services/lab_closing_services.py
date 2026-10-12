"""
Laboratorio Closing: las llamadas grabadas por Fathom, con lo que la IA sacó de cada una.

No calcula nada nuevo: junta lo que ya quedó en `ReunionCrm` cuando pasó el webhook de
Fathom (`fathom_url`, `reporte_ia`) con lo que cargó el closer (`resultado`, `programa`,
`cash_usd`), para poder mirar una llamada entera —quién era, qué pasó, qué se acordó— y
ver si lo cargado coincide con la grabación.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta, timezone

from src.services import ventas_services as ventas

logger = logging.getLogger("atv_ops.lab_closing")
AR_TZ = timezone(timedelta(hours=-3))

# El título del evento arrastra prefijos del calendario ("Canceled: …", "Ingreso …") que
# no son parte del nombre. Se limpian para mostrar; el registro queda como está.
_PREFIJOS = re.compile(r"^\s*(canceled|cancelled|cancelado|cancelada|ingreso|reunion atv|reunión atv)\s*[:\-–]?\s*",
                       re.IGNORECASE)


def _nombre_limpio(nombre: str) -> str:
    return _PREFIJOS.sub("", nombre or "").strip() or (nombre or "").strip()


# Qué estados se agrupan bajo cada filtro de la galería.
_CERRADAS = {"cerrado", "sena", "seña"}
_SEGUIMIENTO = {"seguimiento", "lo voy a pensar", "lo va a pensar"}

# Lo que se muestra del análisis, en el orden en que se lee. Las claves son las de
# `fathom_services._validar`, que es quien escribe `reporte_ia`.
_CAMPOS_IA = ("estado", "plan", "cashUsd", "facturacionUsd", "encajePuntaje", "encaje",
              "encajeMotivo", "desvioOferta", "resumen", "nota", "objecion", "proximoPaso",
              "pagosAcordados", "restoUsd", "lead")


def _rango(mes: str | None) -> tuple[date, date]:
    hoy = datetime.now(AR_TZ).date()
    try:
        anio, m = (int(mes[:4]), int(mes[5:7])) if mes else (hoy.year, hoy.month)
    except (ValueError, TypeError):
        anio, m = hoy.year, hoy.month
    desde = date(anio, m, 1)
    hasta = date(anio + (m == 12), (m % 12) + 1, 1)
    return desde, hasta


def _ia_de(crudo: str | None) -> dict:
    if not crudo:
        return {}
    try:
        datos = json.loads(crudo)
    except (ValueError, TypeError):
        return {}
    if not isinstance(datos, dict):
        return {}
    salida = {k: datos.get(k) for k in _CAMPOS_IA}
    # Las frases vienen como lista o como texto, según la versión que las guardó.
    for k in ("resumen", "nota"):
        v = salida.get(k)
        if isinstance(v, list):
            salida[k] = " ".join(str(x).strip() for x in v if str(x).strip())
    return salida


def _grupo(estado: str) -> str:
    n = ventas._norm(estado)
    if n in _CERRADAS:
        return "cerradas"
    if n in _SEGUIMIENTO:
        return "seguimiento"
    return "otras" if n else "sin_resultado"


def _num(v) -> float | None:
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def _fila(r, ia: dict) -> dict:
    resultado = (r.resultado or "").strip()
    estado_ia = (ia.get("estado") or "").strip()
    # Manda lo que cargó el closer; si todavía no cargó, lo que leyó la IA.
    estado = resultado or estado_ia
    cash_closer = _num(r.cash_usd)
    cash_ia = _num(ia.get("cashUsd"))
    coincide = None
    if resultado and estado_ia:
        coincide = {
            "estado": ventas._norm(resultado) == ventas._norm(estado_ia),
            "plan": (not r.programa or not ia.get("plan")
                     or ventas._norm(r.programa) == ventas._norm(ia.get("plan"))),
            "cash": (cash_closer is None or cash_ia is None
                     or abs(cash_closer - cash_ia) < 1),
        }
        coincide["todo"] = all(coincide.values())
    url = (r.fathom_url or "").strip()
    return {
        "id": r.id,
        "eventoId": r.evento_id,
        "prospecto": _nombre_limpio(r.prospecto) or (ia.get("lead") or "Sin nombre").strip(),
        "fechaAt": r.inicio_at.isoformat() if r.inicio_at else None,
        "closer": (r.closer or "").strip(),
        "setter": (r.setter or "").strip(),
        "resultado": resultado,
        "programa": (r.programa or "").strip(),
        "cashUsd": cash_closer,
        "cargada": bool(resultado),
        "estado": estado or "Sin cargar",
        "grupo": _grupo(estado),
        "fathomUrl": url,
        # Solo un link compartido se puede embeber; el de /calls/ pide login.
        "fathomEmbed": url if "/share/" in url else "",
        "reporteAt": r.reporte_at.isoformat() if r.reporte_at else None,
        "ia": ia,
        "coincide": coincide,
    }


def listar(usuario: dict, mes: str | None = None) -> dict:
    """Las llamadas con grabación del mes. El closer ve las suyas; el resto, todas."""
    from pony.orm import db_session

    from src.models import ReunionCrm

    desde, hasta = _rango(mes)
    d0 = datetime.combine(desde, datetime.min.time())
    d1 = datetime.combine(hasta, datetime.min.time())
    es_closer = (usuario.get("rol") or "") == "closer"
    propios = {ventas._norm(n).split()[0] for n in ventas._nombres_crm(usuario) if ventas._norm(n)}

    filas: list[dict] = []
    with db_session:
        for r in list(ReunionCrm.select()):
            if r.descartada or not (r.fathom_url or r.reporte_ia):
                continue
            if not r.inicio_at or not (d0 <= r.inicio_at < d1):
                continue
            if es_closer:
                primero = ventas._norm(r.closer or "").split()[:1]
                if not primero or primero[0] not in propios:
                    continue
            filas.append(_fila(r, _ia_de(r.reporte_ia)))

    filas.sort(key=lambda f: f["fechaAt"] or "", reverse=True)
    conteo = {"todas": len(filas)}
    for f in filas:
        conteo[f["grupo"]] = conteo.get(f["grupo"], 0) + 1
    closers = sorted({f["closer"] for f in filas if f["closer"]})
    return {
        "mes": f"{desde.year:04d}-{desde.month:02d}",
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "llamadas": filas,
        "conteo": conteo,
        "closers": closers,
    }
