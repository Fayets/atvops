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
# Llamadas que no son de ventas (internas, duplicadas, cargadas por error): no cuentan para nada.
DESCARTE = ("descartada", "no corresponde")
CON_RESULTADO = CIERRE + ("seguimiento", "descalificado", "re-agenda", "reagenda")


def _norm(t: str | None) -> str:
    t = unicodedata.normalize("NFKD", (t or "").strip()).encode("ascii", "ignore").decode().lower()
    return " ".join(t.split())


def _clasificar(resultado: str, calificacion: str, call: datetime | None, ahora: datetime) -> str:
    r = _norm(resultado)
    if r in [_norm(x) for x in DESCARTE]:
        return "descartada"
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
    # Las descartadas quedan afuera de toda métrica.
    leads = [l for l in leads if _clasificar(l["resultado"], l["calificacion"], l["call"], ahora) != "descartada"]
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


# ------------------------------------------------- programas y cierres

ESTADOS_LLAMADA = ("Cerrado", "Seña", "Seguimiento", "No show", "Descalificado", "Cancelada", "Re-agenda", "Agendado", "Descartada")
ESTADOS_VENTA = ("Cerrado", "Seña")
ROLES_PRECIOS = frozenset({"admin", "operaciones", "founder"})


def programas() -> list[dict]:
    """Catálogo de programas con su precio: el precio es la facturación de cada venta."""
    filas = crm_db.consultar("SELECT id, name, price_usd, sort_order FROM offered_program ORDER BY sort_order, name")
    return [{"id": f["id"], "nombre": f["name"], "precioUsd": _num(f["price_usd"]), "orden": f["sort_order"]} for f in filas]


def guardar_programa(datos: dict, usuario: dict) -> list[dict]:
    """Alta o edición de un programa y su precio. Solo ops, admin o founder."""
    if usuario.get("rol") not in ROLES_PRECIOS:
        raise HTTPException(status_code=403, detail="Tu rol no puede cambiar los precios de los programas.")
    nombre = str(datos.get("nombre") or "").strip()[:120]
    if not nombre:
        raise HTTPException(status_code=400, detail="El programa necesita un nombre.")
    try:
        precio = round(float(datos.get("precioUsd") or 0), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="El precio tiene que ser un número.")
    if precio < 0:
        raise HTTPException(status_code=400, detail="El precio no puede ser negativo.")
    orden = int(datos.get("orden") or 0)
    pid = datos.get("id")
    if pid:
        crm_db.ejecutar(
            "UPDATE offered_program SET name = %s, price_usd = %s, sort_order = %s WHERE id = %s",
            (nombre, precio, orden, int(pid)),
        )
    else:
        crm_db.ejecutar(
            "INSERT INTO offered_program (user_id, name, price_usd, sort_order, created_at) "
            "VALUES ((SELECT coalesce(min(user_id), 1) FROM offered_program), %s, %s, %s, now())",
            (nombre, precio, orden),
        )
    logger.info("Programa '%s' guardado por %s a %s USD", nombre, usuario.get("username"), precio)
    _cache.clear()
    return programas()


def borrar_programa(pid: int, usuario: dict) -> list[dict]:
    if usuario.get("rol") not in ROLES_PRECIOS:
        raise HTTPException(status_code=403, detail="Tu rol no puede borrar programas.")
    crm_db.ejecutar("DELETE FROM offered_program WHERE id = %s", (int(pid),))
    _cache.clear()
    return programas()


def _nombres_crm(usuario: dict) -> list[str]:
    """Cómo figura este usuario en el CRM: 'Nick' encuentra 'Nick Xanderz' y su variante mal escrita."""
    base = _norm(usuario.get("nombre") or usuario.get("username") or "")
    if not base:
        return []
    primero = base.split()[0]
    nombres = [f["closer"] for f in crm_db.consultar("SELECT DISTINCT closer FROM lead WHERE closer <> ''")
               if _norm(f["closer"]).split()[:1] == [primero]]
    nombres += [m["nombre"] for m in crm_db.consultar("SELECT nombre FROM teammember WHERE activo")
                if _norm(m["nombre"]).split()[:1] == [primero]]
    return sorted(set(nombres)) or [usuario.get("nombre") or usuario.get("username") or ""]


def mis_llamadas(usuario: dict, dias_atras: int = 30, dias_adelante: int = 14, closer: str | None = None) -> dict:
    """Las llamadas del closer: las que vienen, las de hoy y las que le falta reportar."""
    ahora = datetime.now(AR_TZ).replace(tzinfo=None)
    hoy = ahora.date()
    nombres = [closer] if (closer and usuario.get("rol") in ROLES_PRECIOS | {"ventas"}) else _nombres_crm(usuario)
    if not nombres or not nombres[0]:
        return {"generadoAt": datetime.now(AR_TZ).isoformat(), "closer": None, "llamadas": [],
                "mes": {}, "programas": programas(), "estados": list(ESTADOS_LLAMADA)}

    filas = crm_db.consultar(
        f"""
        SELECT l.id, l.nombre, l.email, l.telefono, l.ig, l.call, l.closer, l.setter, l.origen,
               l.pago, l.debe, l.programa_ofrecido, l.ingresos_rango, l.notas, l.closer_report,
               l.link_llamada, l.vino_de_ads,
               {RESULTADO_SQL} AS resultado,
               lower(trim(coalesce(l.calificacion_llamada, ''))) AS calificacion
        FROM lead l
        WHERE l.call IS NOT NULL AND l.call >= %s AND l.call < %s AND l.closer = ANY(%s)
        ORDER BY l.call DESC
        """,
        (hoy - timedelta(days=dias_atras), hoy + timedelta(days=dias_adelante + 1), nombres),
    )
    precios = {_norm(p["nombre"]): p["precioUsd"] for p in programas()}

    def _fila(l: dict) -> dict:
        programa = (l["programa_ofrecido"] or "").strip()
        return {
            "id": l["id"],
            "prospecto": (l["nombre"] or "").strip() or "Sin nombre",
            "email": l["email"] or "", "telefono": l["telefono"] or "", "instagram": (l["ig"] or "").lstrip("@"),
            "fechaAt": l["call"].isoformat(), "closer": l["closer"], "setter": l["setter"] or "",
            "origen": (l["origen"] or "").strip() or ("Ads" if l["vino_de_ads"] else ""),
            "facturaHoy": (l["ingresos_rango"] or "").strip(),
            "resultado": (l["resultado"] or "").strip(),
            "estado": _clasificar(l["resultado"], l["calificacion"], l["call"], ahora),
            "programa": programa,
            "facturacionUsd": precios.get(_norm(programa), 0.0) if programa else 0.0,
            "cashUsd": _num(l["pago"]), "saldoUsd": _num(l["debe"]),
            "notas": (l["notas"] or "").strip(), "reporte": (l["closer_report"] or "").strip(),
            "grabacion": (l["link_llamada"] or "").strip(),
            "pasada": l["call"] <= ahora,
            "diasDesde": (hoy - l["call"].date()).days,
        }

    llamadas = [_fila(l) for l in filas]
    inicio_mes = hoy.replace(day=1)
    del_mes = [x for x in llamadas
               if datetime.fromisoformat(x["fechaAt"]).date() >= inicio_mes and x["estado"] != "descartada"]
    ventas = [x for x in del_mes if _norm(x["resultado"]) in [_norm(e) for e in ESTADOS_VENTA]]
    return {
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "closer": closer or (usuario.get("nombre") or nombres[0]),
        "nombresCrm": nombres,
        "programas": programas(),
        "estados": list(ESTADOS_LLAMADA),
        "llamadas": llamadas,
        "mes": _metricas_closer(del_mes, ventas),
    }


def _metricas_closer(del_mes: list[dict], ventas: list[dict]) -> dict:
    """Los números del mes del closer: agenda, show rate, close rate y ticket promedio."""
    shows = sum(1 for x in del_mes if x["estado"] in ("show", "cierre"))
    no_shows = sum(1 for x in del_mes if x["estado"] == "no_show")
    evaluables = shows + no_shows
    cash = round(sum(x["cashUsd"] for x in ventas), 2)
    facturacion = round(sum(x["facturacionUsd"] for x in ventas), 2)
    return {
        "agendadas": len(del_mes),
        "porVenir": sum(1 for x in del_mes if x["estado"] == "agendado" and not x["pasada"]),
        "sinReportar": sum(1 for x in del_mes if x["estado"] == "sin_reportar"),
        "shows": shows,
        "noShows": no_shows,
        "cierres": len(ventas),
        "cashUsd": cash,
        "facturacionUsd": facturacion,
        "saldoUsd": round(sum(x["saldoUsd"] for x in ventas), 2),
        "showRate": round(shows / evaluables * 100, 1) if evaluables else None,
        "noShowRate": round(no_shows / evaluables * 100, 1) if evaluables else None,
        "closeRate": round(len(ventas) / shows * 100, 1) if shows else None,
        "aovUsd": round(facturacion / len(ventas), 2) if ventas else 0,
        "cashPromedioUsd": round(cash / len(ventas), 2) if ventas else 0,
    }


def registrar_resultado(lead_id: int, datos: dict, usuario: dict) -> dict:
    """Guarda lo que cargó el closer en el CRM, que es la fuente única: así ATV Marketing
    y ATV Ops muestran lo mismo y no hay dos verdades."""
    filas = crm_db.consultar("SELECT id, closer FROM lead WHERE id = %s", (int(lead_id),))
    if not filas:
        raise HTTPException(status_code=404, detail="Esa llamada no existe en el CRM.")
    mio = _norm(filas[0]["closer"]) in [_norm(n) for n in _nombres_crm(usuario)]
    if not mio and usuario.get("rol") not in ROLES_PRECIOS | {"ventas"}:
        raise HTTPException(status_code=403, detail="Esa llamada no es tuya.")

    resultado = str(datos.get("resultado") or "").strip()
    if resultado not in ESTADOS_LLAMADA:
        raise HTTPException(status_code=400, detail=f"Resultado inválido. Usá uno de: {', '.join(ESTADOS_LLAMADA)}.")
    es_venta = resultado in ESTADOS_VENTA
    programa = str(datos.get("programa") or "").strip()[:120]
    if es_venta and not programa:
        raise HTTPException(status_code=400, detail="Para marcar una venta hay que elegir el programa.")
    try:
        cash = round(float(datos.get("cashUsd") or 0), 2)
        saldo = round(float(datos.get("saldoUsd") or 0), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="El cash y el saldo tienen que ser números.")
    if cash < 0 or saldo < 0:
        raise HTTPException(status_code=400, detail="El cash y el saldo no pueden ser negativos.")
    if not es_venta:
        cash, saldo, programa = 0.0, 0.0, ""
    nota = str(datos.get("nota") or "").strip()[:2000]
    quien = (usuario.get("nombre") or usuario.get("username") or "")

    crm_db.ejecutar(
        "UPDATE lead SET status = %s, estado = %s, programa_ofrecido = %s, pago = %s, debe = %s, "
        "closer_report = COALESCE(NULLIF(%s, ''), closer_report), closer = COALESCE(NULLIF(closer, ''), %s) "
        "WHERE id = %s",
        (resultado, resultado, programa, cash, saldo, nota, quien, int(lead_id)),
    )
    logger.info("Llamada %s marcada %s por %s (cash %s)", lead_id, resultado, usuario.get("username"), cash)
    _cache.clear()
    return mis_llamadas(usuario)


# ------------------------------------------------- reportes diarios del setter

CAMPOS_REPORTE = {
    "setter": ("conversaciones", "links_enviados", "agendas", "seguimientos", "outbounds", "leads_nuevos"),
    "closer": ("llamadas_agendadas", "shows", "cierres", "calificados", "descalificados", "ingreso"),
}
ETIQUETAS_REPORTE = {
    "conversaciones": "Conversaciones", "links_enviados": "Links enviados", "agendas": "Agendas",
    "seguimientos": "Seguimientos", "outbounds": "Outbounds", "leads_nuevos": "Leads nuevos",
    "llamadas_agendadas": "Llamadas agendadas", "shows": "Shows", "cierres": "Cierres",
    "calificados": "Calificados", "descalificados": "Descalificados", "ingreso": "Ingreso USD",
}


def _miembro(usuario: dict, rol: str, crear: bool = True) -> dict | None:
    """El teammember del CRM que corresponde a este usuario, por su nombre de pila.

    Si el usuario es de ATV Ops y todavía no existe en el CRM, se crea: el equipo se
    administra desde acá y el CRM viejo se va quedando como espejo mientras dure.
    """
    base = _norm(usuario.get("nombre") or usuario.get("username") or "")
    if not base:
        return None
    primero = base.split()[0]
    miembros = crm_db.consultar("SELECT id, user_id, nombre, rol FROM teammember WHERE activo ORDER BY id")
    for m in miembros:
        if m["rol"] == rol and _norm(m["nombre"]).split()[:1] == [primero]:
            return m
    # Solo se da de alta a la persona real, no a un admin mirando la vista de otro rol.
    if not crear or (usuario.get("rol") or "") != rol:
        return None
    nombre = (usuario.get("nombre") or usuario.get("username") or "").strip()[:120]
    if not nombre:
        return None
    user_id = min((m["user_id"] for m in miembros), default=1)
    crm_db.ejecutar(
        "INSERT INTO teammember (user_id, nombre, rol, activo, created_at) VALUES (%s, %s, %s, true, now())",
        (user_id, nombre, rol),
    )
    logger.info("Alta de %s como %s en el equipo (venía de ATV Ops)", nombre, rol)
    creado = crm_db.consultar(
        "SELECT id, user_id, nombre, rol FROM teammember WHERE nombre = %s AND rol = %s ORDER BY id DESC LIMIT 1",
        (nombre, rol),
    )
    return creado[0] if creado else None


def mis_reportes(usuario: dict, mes: str | None = None, rol: str = "setter") -> dict:
    """Un día por casillero: rojo si falta el reporte, verde si ya está cargado."""
    hoy = datetime.now(AR_TZ).date()
    mes = mes or hoy.strftime("%Y-%m")
    anio, m = int(mes[:4]), int(mes[5:7])
    inicio = date(anio, m, 1)
    fin = date(anio + (m == 12), (m % 12) + 1, 1)
    campos = CAMPOS_REPORTE[rol]
    miembro = _miembro(usuario, rol)
    if miembro is None:
        return {"mes": mes, "miembro": None, "campos": [], "dias": [],
                "detalle": "Todavía no estás dado de alta como parte del equipo. Avisale a Franco."}

    tabla = f"{rol}_report"
    filas = crm_db.consultar(
        f"SELECT id, fecha, notas, {', '.join(campos)} FROM {tabla} "
        f"WHERE member_id = %s AND fecha >= %s AND fecha < %s ORDER BY fecha",
        (miembro["id"], inicio, fin),
    )
    por_fecha = {f["fecha"]: f for f in filas}

    dias = []
    d = inicio
    while d < fin:
        r = por_fecha.get(d)
        dias.append({
            "fecha": d.isoformat(),
            "diaSemana": d.weekday(),
            "futuro": d > hoy,
            "hoy": d == hoy,
            "cargado": r is not None,
            "valores": {c: _num(r[c]) for c in campos} if r else {c: 0 for c in campos},
            "nota": (r["notas"] or "") if r else "",
            "total": round(sum(_num(r[c]) for c in campos), 2) if r else 0,
        })
        d += timedelta(days=1)

    pasados = [x for x in dias if not x["futuro"]]
    return {
        "mes": mes,
        "miembro": {"id": miembro["id"], "nombre": miembro["nombre"], "rol": miembro["rol"]},
        "campos": [{"id": c, "label": ETIQUETAS_REPORTE.get(c, c)} for c in campos],
        "dias": dias,
        "resumen": {
            "cargados": sum(1 for x in pasados if x["cargado"]),
            "faltan": sum(1 for x in pasados if not x["cargado"]),
            "totales": {c: round(sum(x["valores"][c] for x in dias), 2) for c in campos},
        },
    }


def guardar_reporte(fecha: str, datos: dict, usuario: dict, rol: str = "setter") -> dict:
    """Crea o corrige el reporte de un día. Se guarda en el CRM, igual que si lo cargara
    desde ATV Marketing."""
    try:
        dia = datetime.strptime(str(fecha)[:10], "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha inválida.")
    if dia > datetime.now(AR_TZ).date():
        raise HTTPException(status_code=400, detail="No se puede cargar un día que todavía no pasó.")
    miembro = _miembro(usuario, rol)
    if miembro is None:
        raise HTTPException(status_code=400, detail="Todavía no estás dado de alta como parte del equipo.")

    campos = CAMPOS_REPORTE[rol]
    valores = {}
    for c in campos:
        try:
            valores[c] = max(0, float(datos.get(c) or 0))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{ETIQUETAS_REPORTE.get(c, c)} tiene que ser un número.")
    nota = str(datos.get("nota") or datos.get("notas") or "").strip()[:2000]

    tabla = f"{rol}_report"
    existe = crm_db.consultar(f"SELECT id FROM {tabla} WHERE member_id = %s AND fecha = %s", (miembro["id"], dia))
    asignaciones = ", ".join(f"{c} = %s" for c in campos)
    if existe:
        crm_db.ejecutar(
            f"UPDATE {tabla} SET {asignaciones}, notas = %s WHERE id = %s",
            (*[valores[c] for c in campos], nota, existe[0]["id"]),
        )
    else:
        columnas = ", ".join(campos)
        marcas = ", ".join(["%s"] * len(campos))
        crm_db.ejecutar(
            f"INSERT INTO {tabla} (user_id, member_id, fecha, {columnas}, notas, created_at) "
            f"VALUES (%s, %s, %s, {marcas}, %s, now())",
            (miembro["user_id"], miembro["id"], dia, *[valores[c] for c in campos], nota),
        )
    logger.info("Reporte %s de %s (%s) guardado por %s", dia, miembro["nombre"], rol, usuario.get("username"))
    _cache.clear()
    return mis_reportes(usuario, dia.strftime("%Y-%m"), rol)


def mi_setting(usuario: dict, mes: str | None = None) -> dict:
    """Lo que hizo el setter: sus números de hoy y del mes, y las llamadas que agendó."""
    hoy = datetime.now(AR_TZ).date()
    mes = mes or hoy.strftime("%Y-%m")
    inicio, fin = date(int(mes[:4]), int(mes[5:7]), 1), None
    anio, m = int(mes[:4]), int(mes[5:7])
    fin = date(anio + (m == 12), (m % 12) + 1, 1)

    reportes = mis_reportes(usuario, mes, "setter")
    miembro = reportes.get("miembro")
    dias = reportes.get("dias", [])
    de_hoy = next((d for d in dias if d["fecha"] == hoy.isoformat()), None)
    totales = reportes.get("resumen", {}).get("totales", {})

    agendadas: list[dict] = []
    equipo = {"conversaciones": 0, "linksEnviados": 0, "agendas": 0}
    if miembro:
        filas = crm_db.consultar(
            f"""
            SELECT l.id, l.nombre, l.call, l.agendo, l.closer, l.origen, l.ingresos_rango,
                   {RESULTADO_SQL} AS resultado,
                   lower(trim(coalesce(l.calificacion_llamada, ''))) AS calificacion
            FROM lead l WHERE l.setter = %s AND l.call >= %s AND l.call < %s ORDER BY l.call DESC
            """,
            (miembro["nombre"], inicio, fin),
        )
        ahora = datetime.now(AR_TZ).replace(tzinfo=None)
        agendadas = [
            {
                "id": f["id"], "prospecto": (f["nombre"] or "").strip() or "Sin nombre",
                "fechaAt": f["call"].isoformat() if f["call"] else None,
                "closer": (f["closer"] or "").strip() or "Sin asignar",
                "origen": (f["origen"] or "").strip(), "facturaHoy": (f["ingresos_rango"] or "").strip(),
                "estado": _clasificar(f["resultado"], f["calificacion"], f["call"], ahora),
            }
            for f in filas
        ]
        suma = crm_db.consultar(
            "SELECT coalesce(sum(conversaciones),0) c, coalesce(sum(links_enviados),0) l, coalesce(sum(agendas),0) a "
            "FROM setter_report WHERE fecha >= %s AND fecha < %s",
            (inicio, fin),
        )
        if suma:
            equipo = {"conversaciones": int(_num(suma[0]["c"])), "linksEnviados": int(_num(suma[0]["l"])),
                      "agendas": int(_num(suma[0]["a"]))}

    return {
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "mes": mes,
        "miembro": miembro,
        "detalle": reportes.get("detalle"),
        "dia": {
            "fecha": hoy.isoformat(),
            "cargado": bool(de_hoy and de_hoy["cargado"]),
            "conversaciones": int((de_hoy or {}).get("valores", {}).get("conversaciones", 0)),
            "linksEnviados": int((de_hoy or {}).get("valores", {}).get("links_enviados", 0)),
            "agendas": int((de_hoy or {}).get("valores", {}).get("agendas", 0)),
        },
        "mesTotales": {
            "conversaciones": int(totales.get("conversaciones", 0)),
            "linksEnviados": int(totales.get("links_enviados", 0)),
            "agendas": int(totales.get("agendas", 0)),
            "seguimientos": int(totales.get("seguimientos", 0)),
            "diasCargados": reportes.get("resumen", {}).get("cargados", 0),
            "diasSinCargar": reportes.get("resumen", {}).get("faltan", 0),
        },
        "equipo": equipo,
        "agendadas": agendadas,
    }
