"""
Métricas reales del área de Ventas, calculadas sobre el CRM de ATV Marketing.

Definiciones (las mismas que usa el equipo):
- Agendado: el lead tiene una llamada (`call`) en el período.
- Show: la llamada ya pasó y quedó registrado un resultado (cerrado, seña, seguimiento,
  descalificado) o una calificación.
- No show: el resultado dice "No show" o "Cancelada".
- Sin reportar: la llamada ya pasó y nadie cargó el resultado. Es deuda del closer.
- Cierre: resultado "Cerrado" o "Seña". El cash es la suma de lo pagado.

Todo sale de la tabla `lead` (agenda y resultado) y de `closer_report` / `setter_report`
(los reportes diarios que cargan los closers y setters). Solo lectura, con caché de 5 minutos.
"""

from __future__ import annotations

import logging
import threading
import unicodedata
from datetime import date, datetime, timedelta

from decouple import config

from src.services import crm_db
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.ventas")

CACHE_SEGUNDOS = int(config("VENTAS_CACHE_SEGUNDOS", default=300))
SEMANAS_SERIE = 8
_cache: dict = {}
_lock = threading.Lock()

RESULTADO_SQL = "lower(trim(coalesce(nullif(l.estado, ''), nullif(l.status, ''), '')))"
CIERRE = ("cerrado", "seña", "sena")
NO_SHOW = ("no show", "cancelada", "cancelado")
CON_RESULTADO = CIERRE + ("seguimiento", "descalificado", "re-agenda", "reagenda")


def _norm(t: str | None) -> str:
    t = unicodedata.normalize("NFKD", (t or "").strip()).encode("ascii", "ignore").decode().lower()
    return " ".join(t.split())


def _clasificar(resultado: str, calificacion: str, call: datetime | None, ahora: datetime) -> str:
    r = _norm(resultado)
    if r in [_norm(x) for x in NO_SHOW]:
        return "no_show"
    if r in [_norm(x) for x in CIERRE]:
        return "cierre"
    if r in [_norm(x) for x in CON_RESULTADO] or _norm(calificacion):
        return "show"
    if call is not None and call <= ahora:
        return "sin_reportar"
    return "agendado"


def _semana(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _leads(desde: date, hasta: date) -> list[dict]:
    return crm_db.consultar(
        f"""
        SELECT l.id, l.nombre, l.email, l.telefono, l.ig, l.origen, l.closer, l.setter,
               l.call, l.agendo, l.agendo_en, l.pago, l.debe, l.ingresos_rango,
               l.programa_ofrecido, l.vino_de_ads, l.notas, l.created_at,
               {RESULTADO_SQL} AS resultado,
               lower(trim(coalesce(l.calificacion_llamada, ''))) AS calificacion
        FROM lead l
        WHERE l.call IS NOT NULL AND l.call >= %s AND l.call < %s
        ORDER BY l.call
        """,
        (desde, hasta),
    )


def _equipo() -> list[dict]:
    return crm_db.consultar("SELECT id, nombre, rol, activo FROM teammember WHERE activo ORDER BY rol, nombre")


def _reportes(tabla: str, desde: date, limite: int = 400) -> list[dict]:
    campos = {
        "closer_report": "r.llamadas_agendadas, r.shows, r.cierres, r.calificados, r.descalificados, r.ingreso, r.seguimiento, r.notas",
        "setter_report": "r.conversaciones, r.agendas, r.links_enviados, r.leads_nuevos, r.seguimientos, r.outbounds, r.notas",
    }[tabla]
    return crm_db.consultar(
        f"SELECT r.id, r.fecha, r.created_at, m.nombre, m.rol, {campos} "
        f"FROM {tabla} r JOIN teammember m ON m.id = r.member_id "
        f"WHERE r.fecha >= %s ORDER BY r.fecha DESC LIMIT {limite}",
        (desde,),
    )


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _bloque(leads: list[dict], ahora: datetime) -> dict:
    clases = [_clasificar(l["resultado"], l["calificacion"], l["call"], ahora) for l in leads]
    cierres = [l for l, c in zip(leads, clases) if c == "cierre"]
    shows = sum(1 for c in clases if c in ("show", "cierre"))
    no_shows = sum(1 for c in clases if c == "no_show")
    sin_reportar = sum(1 for c in clases if c == "sin_reportar")
    agendados = len(leads)
    cash = sum(_num(l["pago"]) for l in cierres)
    evaluables = shows + no_shows
    return {
        "agendados": agendados,
        "shows": shows,
        "noShows": no_shows,
        "sinReportar": sin_reportar,
        "cierres": len(cierres),
        "cashUsd": round(cash, 2),
        "deudaUsd": round(sum(_num(l["debe"]) for l in cierres), 2),
        "showRate": round(shows / evaluables * 100, 1) if evaluables else None,
        "closeRate": round(len(cierres) / shows * 100, 1) if shows else None,
        "averageSaleUsd": round(cash / len(cierres), 2) if cierres else 0,
    }


def _persona(nombre: str | None) -> str:
    n = (nombre or "").strip()
    return n or "Sin asignar"


def resumen(mes: str | None = None, refrescar: bool = False) -> dict:
    """Todo lo que necesita la vista de Ventas, con datos reales del CRM."""
    ahora = datetime.now(AR_TZ).replace(tzinfo=None)
    hoy = ahora.date()
    mes = mes or hoy.strftime("%Y-%m")
    clave = mes
    with _lock:
        guardado = _cache.get(clave)
        if guardado and not refrescar and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]

    anio, m = int(mes[:4]), int(mes[5:7])
    inicio_mes = date(anio, m, 1)
    fin_mes = date(anio + (m == 12), (m % 12) + 1, 1)
    inicio_serie = _semana(hoy) - timedelta(weeks=SEMANAS_SERIE - 1)
    desde = min(inicio_mes, inicio_serie)
    hasta = max(fin_mes, hoy + timedelta(days=30))

    leads = _leads(desde, hasta)
    del_mes = [l for l in leads if inicio_mes <= l["call"].date() < fin_mes]
    mes_previo_inicio = date(anio - (m == 1), 12 if m == 1 else m - 1, 1)
    previos = _leads(mes_previo_inicio, inicio_mes)

    # Serie semanal
    semanas = []
    for i in range(SEMANAS_SERIE):
        ini = inicio_serie + timedelta(weeks=i)
        fin = ini + timedelta(days=7)
        de_la_semana = [l for l in leads if ini <= l["call"].date() < fin]
        semanas.append({"semana": ini.isoformat(), "label": ini.strftime("%d/%m"), **_bloque(de_la_semana, ahora)})

    # Por closer y por setter (sobre el mes elegido)
    def _agrupar(campo: str) -> list[dict]:
        grupos: dict[str, list[dict]] = {}
        for l in del_mes:
            grupos.setdefault(_persona(l[campo]), []).append(l)
        salida = [{"nombre": k, **_bloque(v, ahora)} for k, v in grupos.items()]
        return sorted(salida, key=lambda x: (-x["cashUsd"], -x["cierres"]))

    # Reportes diarios cargados por el equipo
    equipo = _equipo()
    # Ventana amplia: si nadie reporta hace semanas, hay que verlo igual.
    reportes_closer = _reportes("closer_report", hoy - timedelta(days=120))
    reportes_setter = _reportes("setter_report", hoy - timedelta(days=120))

    def _estado_reporte(fecha: date | None) -> str:
        if fecha is None:
            return "vencido"
        dias = (hoy - fecha).days
        return "completado" if dias <= 1 else ("pendiente" if dias <= 3 else "vencido")

    def _ultimo_por_persona(reportes: list[dict], rol: str) -> list[dict]:
        vistos: dict[str, dict] = {}
        for r in reportes:
            if r["nombre"] not in vistos:
                vistos[r["nombre"]] = r
        salida = []
        for miembro in [m for m in equipo if m["rol"] == rol]:
            r = vistos.get(miembro["nombre"])
            salida.append({
                "id": f"{rol}_{miembro['id']}",
                "nombre": miembro["nombre"],
                "estado": _estado_reporte(r["fecha"] if r else None),
                "fecha": r["fecha"].isoformat() if r else None,
                "diasSinReportar": (hoy - r["fecha"]).days if r else None,
                "actualizadoAt": (r["created_at"].isoformat() if r and r["created_at"] else None),
                "metricas": {k: _num(v) for k, v in (r or {}).items()
                             if k not in ("id", "fecha", "created_at", "nombre", "rol", "notas")},
                "notas": (r or {}).get("notas") or "",
            })
        return sorted(salida, key=lambda x: ("completado", "pendiente", "vencido").index(x["estado"]))

    # Listas operativas
    proximas = sorted(
        [l for l in leads if l["call"] and l["call"] >= ahora and l["call"] <= ahora + timedelta(days=7)],
        key=lambda l: l["call"],
    )
    sin_reportar = sorted(
        [l for l in leads if _clasificar(l["resultado"], l["calificacion"], l["call"], ahora) == "sin_reportar"],
        key=lambda l: l["call"], reverse=True,
    )
    seguimientos = sorted(
        [l for l in leads if _norm(l["resultado"]) in ("seguimiento", "re-agenda", "reagenda")],
        key=lambda l: l["call"], reverse=True,
    )

    def _lead_dict(l: dict) -> dict:
        return {
            "id": l["id"], "prospecto": (l["nombre"] or "").strip() or "Sin nombre",
            "email": l["email"] or "", "telefono": l["telefono"] or "", "instagram": (l["ig"] or "").lstrip("@"),
            "fechaAt": l["call"].isoformat() if l["call"] else None,
            "closer": _persona(l["closer"]), "setter": _persona(l["setter"]),
            "origen": (l["origen"] or "").strip() or ("Ads" if l["vino_de_ads"] else "Sin origen"),
            "agendoEn": l["agendo_en"] or "", "oferta": (l["programa_ofrecido"] or "").strip(),
            "facturacion": (l["ingresos_rango"] or "").strip(),
            "montoUsd": _num(l["pago"]) or None, "debeUsd": _num(l["debe"]) or None,
            "resultado": l["resultado"], "estado": _clasificar(l["resultado"], l["calificacion"], l["call"], ahora),
            "notas": (l["notas"] or "").strip()[:400],
            "diasDesde": (hoy - l["call"].date()).days if l["call"] else None,
        }

    # Techo del funnel: lo que cargan los setters en su reporte diario del mes.
    def _suma_reportes(reportes: list[dict], campos: tuple[str, ...]) -> dict:
        del_mes_r = [r for r in reportes if inicio_mes <= r["fecha"] < fin_mes]
        return {c: round(sum(_num(r.get(c)) for r in del_mes_r)) for c in campos}

    def _por_persona(reportes: list[dict], campos: tuple[str, ...]) -> list[dict]:
        grupos: dict[str, list[dict]] = {}
        for r in reportes:
            if inicio_mes <= r["fecha"] < fin_mes:
                grupos.setdefault(r["nombre"], []).append(r)
        salida = [
            {"nombre": nombre, "reportes": len(rs), **{c: round(sum(_num(x.get(c)) for x in rs), 2) for c in campos}}
            for nombre, rs in grupos.items()
        ]
        return sorted(salida, key=lambda x: -x[campos[0]])

    top_funnel = _suma_reportes(reportes_setter, ("conversaciones", "agendas", "links_enviados", "leads_nuevos", "outbounds", "seguimientos"))
    reporte_closers_mes = _suma_reportes(reportes_closer, ("llamadas_agendadas", "shows", "cierres", "calificados", "descalificados", "ingreso"))

    dias_mes = (fin_mes - inicio_mes).days
    dia_hoy = min(max((hoy - inicio_mes).days + 1, 1), dias_mes)

    actual = _bloque(del_mes, ahora)
    previo = _bloque(previos, ahora)
    data = {
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "mes": mes,
        "contexto": {"mes": mes, "diaHoy": dia_hoy, "diasMes": dias_mes, "syncAt": datetime.now(AR_TZ).isoformat()},
        "topFunnel": top_funnel,
        "reporteClosersMes": reporte_closers_mes,
        "actual": actual,
        "previo": previo,
        "semanas": semanas,
        "porCloser": _agrupar("closer"),
        "porSetter": _agrupar("setter"),
        "porOrigen": sorted(
            [{"nombre": k, **_bloque(v, ahora)} for k, v in _por_origen(del_mes).items()],
            key=lambda x: -x["agendados"],
        ),
        "porPrograma": sorted(
            [{"nombre": k, **_bloque(v, ahora)} for k, v in _por_programa(del_mes).items()],
            key=lambda x: -x["cierres"],
        ),
        "closersMes": _por_persona(reportes_closer, ("llamadas_agendadas", "shows", "cierres", "ingreso", "calificados", "descalificados")),
        "settersMes": _por_persona(reportes_setter, ("conversaciones", "agendas", "links_enviados", "seguimientos", "outbounds")),
        "reportesClosers": _ultimo_por_persona(reportes_closer, "closer"),
        "reportesSetters": _ultimo_por_persona(reportes_setter, "setter"),
        "proximas": [_lead_dict(l) for l in proximas][:40],
        "sinReportar": [_lead_dict(l) for l in sin_reportar][:40],
        "seguimientos": [_lead_dict(l) for l in seguimientos][:40],
        "cierresRecientes": [_lead_dict(l) for l in sorted(
            [x for x in leads if _clasificar(x["resultado"], x["calificacion"], x["call"], ahora) == "cierre"],
            key=lambda x: x["call"], reverse=True)][:20],
        "equipo": [{"nombre": m["nombre"], "rol": m["rol"]} for m in equipo],
    }
    with _lock:
        _cache[clave] = {"at": datetime.utcnow(), "data": data}
    return data


def _por_origen(leads: list[dict]) -> dict[str, list[dict]]:
    grupos: dict[str, list[dict]] = {}
    for l in leads:
        clave = (l["origen"] or "").strip() or ("Ads" if l["vino_de_ads"] else "Sin origen")
        grupos.setdefault(clave, []).append(l)
    return grupos


def _por_programa(leads: list[dict]) -> dict[str, list[dict]]:
    grupos: dict[str, list[dict]] = {}
    for l in leads:
        clave = (l["programa_ofrecido"] or "").strip() or "Sin definir"
        grupos.setdefault(clave, []).append(l)
    return grupos


def estado() -> dict:
    if not crm_db.disponible():
        return {"conectado": False, "detalle": "Falta MKT_DSN (o GCAL_CONEXION_DSN) en el .env."}
    try:
        fila = crm_db.consultar("SELECT count(*) AS n, max(created_at) AS ultimo FROM lead")[0]
        return {"conectado": True, "leads": fila["n"], "ultimoLeadAt": fila["ultimo"].isoformat() if fila["ultimo"] else None}
    except Exception as e:  # noqa: BLE001
        return {"conectado": False, "detalle": str(e)[:200]}
