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

from fastapi import HTTPException

from src.services import ventas_services as ventas

logger = logging.getLogger("atv_ops.lab_closing")
AR_TZ = timezone(timedelta(hours=-3))

# El título del evento arrastra prefijos del calendario ("Canceled: …", "Ingreso …") que
# no son parte del nombre. Se limpian para mostrar; el registro queda como está.
_PREFIJOS = re.compile(r"^\s*(canceled|cancelled|cancelado|cancelada|ingreso|reunion atv|reunión atv)\s*[:\-–]?\s*",
                       re.IGNORECASE)


def _canonico(closer) -> str:
    """"Nick" y "Nick Xanderz" son la misma persona: se muestra como figura en el equipo."""
    nombre = (closer or "").strip()
    if not nombre:
        return ""
    try:
        return ventas._persona(nombre, "closer") or nombre
    except Exception:  # noqa: BLE001
        return nombre


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
        "closer": _canonico(r.closer),
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


# Las llamadas que de verdad pasaron: con resultado, cerradas, o ya pasadas y sin cargar.
# Las que no pasaron (no show, cancelada, descartada) no tienen grabación que mirar.
_PASARON = {"cierre", "show", "sin_reportar", "sin_crm"}


def _es_del_closer(nombre: str, propios: set[str]) -> bool:
    primero = ventas._norm(nombre or "").split()[:1]
    return bool(primero) and primero[0] in propios


def _fila_calendario(f: dict, ahora: datetime) -> dict:
    """Una llamada del calendario que todavía no tiene grabación analizada."""
    evento = f.get("eventoId") or ""
    return {
        "id": f.get("id"),
        "eventoId": evento,
        "prospecto": _nombre_limpio(f.get("nombre") or "") or "Sin nombre",
        "fechaAt": f["call"].isoformat() if f.get("call") else None,
        "closer": _canonico(f.get("closer")),
        "setter": (f.get("setter") or "").strip(),
        "resultado": (f.get("resultado") or "").strip(),
        "programa": (f.get("programa_ofrecido") or "").strip(),
        "cashUsd": _num(f.get("pago")) or None,
        "cargada": bool((f.get("resultado") or "").strip()),
        "estado": (f.get("resultado") or "").strip() or "Sin cargar",
        "grupo": _grupo((f.get("resultado") or "").strip()),
        "fathomUrl": "",
        "fathomEmbed": "",
        "reporteAt": None,
        "ia": {},
        "coincide": None,
        "analizada": False,
    }


def listar(usuario: dict, mes: str | None = None) -> dict:
    """Las llamadas del mes que pasaron, con la grabación analizada si la hay.

    La base es el calendario, no Fathom: una llamada sin grabación tiene que estar igual,
    para poder pegarle el link y analizarla. El closer ve las suyas; el resto, todas.
    """
    from pony.orm import db_session

    from src.models import ReunionCrm

    desde, hasta = _rango(mes)
    ahora = datetime.now(AR_TZ).replace(tzinfo=None)
    # Cris es setter y también cierra: con closer entre sus roles de ventas ve solo las suyas.
    es_closer = (usuario.get("rol") or "") == "closer" or (
        "closer" in (usuario.get("rolesVentas") or []) and usuario.get("rol") in {"setter", "closer"})
    propios = {ventas._norm(n).split()[0] for n in ventas._nombres_crm(usuario) if ventas._norm(n)}

    # Lo que quedó en ATV Ops por evento: la grabación y el análisis viven ahí.
    with db_session:
        registro = {r.evento_id: r for r in list(ReunionCrm.select())
                    if r.evento_id and r.inicio_at and desde <= r.inicio_at.date() < hasta
                    and not r.descartada}
        filas: list[dict] = []
        vistos: set[str] = set()
        for f in ventas._sumar_reuniones_del_calendario(desde, hasta):
            if f.get("duplicada") or not f.get("call") or f["call"] > ahora:
                continue
            clase = ventas._clasificar(f.get("resultado", ""), f.get("calificacion", ""), f["call"], ahora,
                                       f.get("soloCalendario", False), f.get("duplicada", False),
                                       f.get("reprogramada", False))
            if clase not in _PASARON:
                continue
            if es_closer and not _es_del_closer(f.get("closer"), propios):
                continue
            evento = f.get("eventoId") or ""
            r = registro.get(evento)
            if r is not None and (r.fathom_url or r.reporte_ia):
                fila = _fila(r, _ia_de(r.reporte_ia))
                fila["analizada"] = True
                fila["id"] = f.get("id")
            else:
                fila = _fila_calendario(f, ahora)
            vistos.add(evento)
            filas.append(fila)
        # Una llamada analizada que el calendario ya no muestra (se movió, se borró el
        # evento) se conserva igual: la grabación sigue valiendo.
        for evento, r in registro.items():
            if evento in vistos or not (r.fathom_url or r.reporte_ia):
                continue
            if es_closer and not _es_del_closer(r.closer, propios):
                continue
            fila = _fila(r, _ia_de(r.reporte_ia))
            fila["analizada"] = True
            filas.append(fila)

    filas.sort(key=lambda f: f["fechaAt"] or "", reverse=True)
    conteo = {"todas": len(filas), "analizadas": sum(1 for f in filas if f["analizada"])}
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


def analizar(llamada_id, url: str, usuario: dict) -> dict:
    """Pega el link de Fathom a una llamada y la analiza. Si la llamada es solo del
    calendario, primero se le crea la ficha en ATV Ops, como al cargar un resultado."""
    from src.services import fathom_services

    # Primero lo barato y lo que puede fallar: el link y la clave. Recién después se
    # crea la ficha, así una llamada del calendario no queda con ficha a medias por un
    # link mal pegado.
    if not fathom_services._id_del_link(url):
        raise HTTPException(status_code=400,
                            detail="Ese link no es de Fathom. Tiene que ser fathom.video/calls/… o /share/…")
    if not fathom_services._api_key():
        raise HTTPException(status_code=503,
                            detail="Falta la API key de Fathom. Va en Sistema → Claves API → Fathom.")
    _lead, evento = ventas._ficha_para(llamada_id, usuario)
    if not evento:
        raise HTTPException(status_code=400, detail="Esa llamada no tiene evento de calendario.")
    return fathom_services.analizar_por_link(evento, url, usuario)
