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
from datetime import date, datetime, time, timedelta, timezone

from decouple import config
from fastapi import HTTPException

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


def _clasificar(resultado: str, calificacion: str, call: datetime | None, ahora: datetime,
                solo_calendario: bool = False, duplicada: bool = False) -> str:
    # La reunión que está en el calendario pero no en el CRM cuenta como agendada del mes,
    # pero no como show ni como deuda del closer: nadie puede cargarle un resultado.
    if solo_calendario:
        return "sin_crm"
    # Duplicado del CRM: la misma reunión cargada dos veces. No cuenta para nada.
    if duplicada:
        return "duplicada"
    r = _norm(resultado)
    if r in [_norm(x) for x in DESCARTE]:
        return "descartada"
    # Una reunión que todavía no pasó no tiene resultado, aunque el lead traiga uno de
    # una reunión anterior: el sync de atv-mkt le mueve la fecha a la llamada vieja.
    if call is not None and call > ahora:
        return "agendado"
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


def _a_argentina(dt: datetime | None) -> datetime | None:
    """El CRM guarda las fechas en UTC sin marcar la zona. Acá todo se muestra en hora
    de Argentina, así que se convierte al leer y nunca después."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(AR_TZ).replace(tzinfo=None)


def _horas_locales(filas: list[dict]) -> list[dict]:
    for f in filas:
        for campo in ("call", "agendo", "created_at"):
            if campo in f:
                f[campo] = _a_argentina(f[campo])
    return filas


def _leads(desde: date, hasta: date) -> list[dict]:
    # Se pide un día de más de cada lado porque la base está en UTC y el corte es local.
    filas = crm_db.consultar(
        f"""
        SELECT l.id, l.nombre, l.email, l.telefono, l.ig, l.origen, l.closer, l.setter,
               l.call, l.agendo, l.agendo_en, l.pago, l.debe, l.ingresos_rango,
               l.programa_ofrecido, l.vino_de_ads, l.notas, l.created_at,
               l.closer_report, l.link_llamada,
               {RESULTADO_SQL} AS resultado,
               lower(trim(coalesce(l.calificacion_llamada, ''))) AS calificacion
        FROM lead l
        WHERE l.call IS NOT NULL AND l.call >= %s AND l.call < %s
        ORDER BY l.call
        """,
        (desde - timedelta(days=1), hasta + timedelta(days=1)),
    )
    return [f for f in _horas_locales(filas) if desde <= f["call"].date() < hasta]


def _clave_persona(nombre: str | None) -> str:
    """El nombre del prospecto sin la marca, para cruzar CRM y calendario.
    En el CRM el lead suele llamarse "Fulano and Aumenta Tu Valor"; en el calendario,
    "2da reu Fulano and Aumenta Tu Valor". Los dos tienen que dar "fulano"."""
    from src.services import gcal_services

    limpio, _ = gcal_services._prospecto(nombre or "")
    return _norm(limpio)


def _duenio_de_cada_lead() -> dict[str, dict]:
    """Quién atiende a cada prospecto, mirando TODO el CRM y no solo el período pedido.

    Hace falta porque una segunda reunión puede caer meses después de la llamada que dejó
    registrada el CRM: el lead de Pablo Ingratta tiene su llamada en agosto y su segunda
    reunión en septiembre. Se indexa por email y por nombre limpio.
    """
    with _lock:
        guardado = _cache.get("duenios")
        if guardado and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]
    filas = crm_db.consultar(
        "SELECT nombre, email, closer, setter, origen, call FROM lead "
        "WHERE coalesce(closer, '') <> '' ORDER BY call NULLS FIRST"
    )
    indice: dict[str, dict] = {}
    for f in filas:  # el más reciente pisa al viejo: gana el closer que lo atiende hoy
        datos = {"closer": f["closer"], "setter": f["setter"] or "", "origen": (f["origen"] or "").strip()}
        email = _norm(f.get("email"))
        nombre = _clave_persona(f.get("nombre"))
        if email:
            indice[f"email:{email}"] = datos
        if nombre:
            indice[f"nombre:{nombre}"] = datos
    with _lock:
        _cache["duenios"] = {"at": datetime.utcnow(), "data": indice}
    return indice


def _referencias(evento_ids: list[str]) -> dict[str, int]:
    """Qué llamada del CRM quedó atada a cada reunión del calendario."""
    if not evento_ids:
        return {}
    from pony.orm import db_session, select

    from src.models import ReunionCrm

    with db_session:
        return {r.evento_id: r.lead_id
                for r in select(r for r in ReunionCrm if r.evento_id in evento_ids)}


def _guardar_propio(lead_id: int, evento_id: str, prospecto: str, quien: str, **campos) -> None:
    """Guarda el resultado en la base de ATV Ops, que es la que manda."""
    from pony.orm import db_session

    from src.models import ReunionCrm

    try:
        with db_session:
            fila = (ReunionCrm.get(evento_id=evento_id) if evento_id else None) or ReunionCrm.get(lead_id=lead_id)
            if fila is None:
                fila = ReunionCrm(evento_id=evento_id or f"lead:{lead_id}", lead_id=lead_id,
                                  prospecto=prospecto[:200], creado_por=quien[:80])
            if evento_id and fila.evento_id != evento_id:
                fila.evento_id = evento_id
            fila.lead_id = lead_id
            if prospecto:
                fila.prospecto = prospecto[:200]
            for k, v in campos.items():
                setattr(fila, k, v)
            fila.actualizado_por = quien[:80]
            fila.actualizado_at = datetime.utcnow()
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo guardar la llamada %s en ATV Ops: %s", lead_id, str(e)[:160])
        raise HTTPException(status_code=500, detail=f"No se pudo guardar en la base de ATV Ops: {str(e)[:140]}") from e


def _atar_reunion(evento_id: str, lead_id: int, prospecto: str, inicio: datetime, quien: str) -> None:
    """Deja anotado que esa reunión del calendario es esa llamada del CRM.

    Sin esto, cuando el sync de atv-mkt le cambia la fecha a la llamada, la reunión
    vuelve a verse como no cargada y se crea una llamada duplicada.
    """
    from pony.orm import db_session

    from src.models import ReunionCrm

    try:
        with db_session:
            ya = ReunionCrm.get(evento_id=evento_id)
            if ya:
                ya.lead_id = lead_id
                ya.inicio_at = inicio
                return
            ReunionCrm(evento_id=evento_id, lead_id=lead_id, prospecto=prospecto[:200],
                       inicio_at=inicio, creado_por=quien[:80])
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo atar la reunión %s al lead %s: %s", evento_id, lead_id, str(e)[:160])


def _propias(evento_ids: list[str], lead_ids: list[int]) -> dict:
    """Lo que ATV Ops tiene cargado de esas reuniones. Manda sobre el CRM."""
    from pony.orm import db_session, select

    from src.models import ReunionCrm

    salida = {"por_evento": {}, "por_lead": {}}
    if not evento_ids and not lead_ids:
        return salida
    try:
        with db_session:
            filas = list(select(r for r in ReunionCrm
                                if r.evento_id in evento_ids or r.lead_id in lead_ids))
            for r in filas:
                dato = {
                    "resultado": (r.resultado or "").strip(),
                    "programa": (r.programa or "").strip(),
                    "cashUsd": r.cash_usd or 0.0,
                    "saldoUsd": r.saldo_usd or 0.0,
                    "nota": (r.nota or "").strip(),
                    "descartada": bool(r.descartada),
                    "leadId": r.lead_id,
                    "eventoId": r.evento_id,
                }
                if not (dato["resultado"] or dato["descartada"]):
                    continue  # todavía no se cargó acá: manda lo que diga el CRM
                salida["por_evento"][r.evento_id] = dato
                salida["por_lead"][r.lead_id] = dato
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo leer lo cargado en ATV Ops: %s", str(e)[:160])
    return salida


def _aplicar_lo_propio(filas: list[dict]) -> list[dict]:
    """Pisa lo que dice el CRM con lo que se cargó en ATV Ops.

    El sync de atv-mkt cambia estados y fechas por su cuenta; lo que el equipo carga acá
    no se puede perder por eso. Si acá no hay nada cargado, se respeta el CRM.
    """
    propias = _propias([f.get("eventoId") for f in filas if f.get("eventoId")],
                       [f["id"] for f in filas if isinstance(f.get("id"), int)])
    if not propias["por_evento"] and not propias["por_lead"]:
        return filas
    for f in filas:
        dato = propias["por_evento"].get(f.get("eventoId")) or propias["por_lead"].get(f.get("id"))
        if not dato:
            continue
        if dato["descartada"]:
            f["resultado"] = "descartada"
            continue
        f["resultado"] = _norm(dato["resultado"])
        f["programa_ofrecido"] = dato["programa"]
        f["pago"] = dato["cashUsd"]
        f["debe"] = dato["saldoUsd"]
        if dato["nota"]:
            f["closer_report"] = dato["nota"]
    return filas


def _leads_por_id(ids: list[int]) -> list[dict]:
    """Las llamadas del CRM por id, sin importar en qué fecha las haya dejado el sync."""
    if not ids:
        return []
    filas = crm_db.consultar(
        f"""
        SELECT l.id, l.nombre, l.email, l.telefono, l.ig, l.origen, l.closer, l.setter,
               l.call, l.agendo, l.agendo_en, l.pago, l.debe, l.ingresos_rango,
               l.programa_ofrecido, l.vino_de_ads, l.notas, l.created_at,
               l.closer_report, l.link_llamada,
               {RESULTADO_SQL} AS resultado,
               lower(trim(coalesce(l.calificacion_llamada, ''))) AS calificacion
        FROM lead l WHERE l.id = ANY(%s)
        """,
        (list(ids),),
    )
    return _horas_locales(filas)


def _sumar_reuniones_del_calendario(filas: list[dict], desde: date, hasta: date) -> list[dict]:
    """Deja en la lista TODAS las reuniones que hubo, no solo las que el CRM guardó.

    El CRM tiene una sola fecha por lead, así que cuando un prospecto tiene varias
    reuniones hasta cerrar, la última le pisa a las anteriores. El calendario sí las
    tiene todas, y una vez que alguien carga un resultado queda anotado en ATV Ops qué
    llamada del CRM es esa reunión: esa referencia manda, aunque después el sync de
    atv-mkt le cambie la fecha a la llamada.

    Lo que no tiene referencia se aparea con la reunión más cercana en el tiempo de esa
    misma persona, por email y si no, por nombre. Toda reunión que quede sin aparear se
    agrega: existió aunque el CRM no la registre. Si el calendario no responde, quedan
    solo las del CRM.
    """
    from src.services import gcal_services

    if not gcal_services.configurado():
        return filas
    inicio = datetime.combine(desde, time.min).replace(tzinfo=AR_TZ)
    fin_rango = datetime.combine(hasta, time.min).replace(tzinfo=AR_TZ)
    reuniones = gcal_services.reuniones_venta(inicio, fin_rango)
    if not reuniones:
        return filas

    for r in reuniones:
        r["_cuando"] = datetime.fromisoformat(r["inicioAt"]).astimezone(AR_TZ).replace(tzinfo=None)
        r["_emails"] = {_norm(e) for e in (r.get("invitados") or []) if _norm(e)}
        r["_nombre"] = _clave_persona(r["prospecto"])

    # Las que ya tienen su llamada anotada: se traen por id, estén donde estén.
    referencias = _referencias([r["eventoId"] for r in reuniones])
    conocidas = {f["id"]: f for f in filas}
    for extra in _leads_por_id([i for i in referencias.values() if i not in conocidas]):
        filas.append(extra)
        conocidas[extra["id"]] = extra

    fila_usada: set = set()
    reunion_usada: set = set()
    por_id = {f["id"]: i for i, f in enumerate(filas)}
    for j, r in enumerate(reuniones):
        lead = referencias.get(r["eventoId"])
        i = por_id.get(lead)
        if i is None or i in fila_usada:
            continue
        fila_usada.add(i)
        reunion_usada.add(j)
        filas[i]["call"] = r["_cuando"]
        filas[i]["segunda"] = r["segunda"]
        filas[i]["eventoId"] = r["eventoId"]

    # El resto: todos los cruces posibles, del que mejor coincide en el tiempo al que peor.
    posibles = []
    for i, f in enumerate(filas):
        if i in fila_usada:
            continue
        email = _norm(f.get("email"))
        nombre = _clave_persona(f.get("nombre"))
        for j, r in enumerate(reuniones):
            if j in reunion_usada:
                continue
            if not ((email and email in r["_emails"]) or (nombre and nombre == r["_nombre"])):
                continue
            posibles.append((abs((f["call"] - r["_cuando"]).total_seconds()), i, j))
    posibles.sort()
    for _, i, j in posibles:
        if i in fila_usada or j in reunion_usada:
            continue
        fila_usada.add(i)
        reunion_usada.add(j)
        # La fecha buena es la del calendario: ahí se ven las reprogramaciones.
        filas[i]["call"] = reuniones[j]["_cuando"]
        filas[i]["segunda"] = reuniones[j]["segunda"]
        filas[i]["eventoId"] = reuniones[j]["eventoId"]

    conocidos: dict[str, dict] = {}
    for f in filas:
        conocidos.setdefault(_clave_persona(f.get("nombre")), f)

    extras = []
    for j, r in enumerate(reuniones):
        if j in reunion_usada:
            continue
        base = conocidos.get(r["_nombre"]) or {}
        if not (base.get("closer") or "").strip():
            # El lead puede estar fuera del período: se busca en todo el CRM.
            duenios = _duenio_de_cada_lead()
            base = next((duenios[f"email:{e}"] for e in r["_emails"] if f"email:{e}" in duenios),
                        duenios.get(f"nombre:{r['_nombre']}")) or base
        extras.append({
            "id": f"cal:{r['eventoId']}",
            "nombre": r["prospecto"], "email": next(iter(r["_emails"]), ""),
            "telefono": "", "ig": "",
            "origen": (base.get("origen") or "").strip() or "Orgánico",
            "closer": base.get("closer") or "", "setter": base.get("setter") or "",
            "call": r["_cuando"], "agendo": None, "agendo_en": "Google Calendar",
            "pago": 0, "debe": 0, "ingresos_rango": "", "programa_ofrecido": "",
            "vino_de_ads": False, "notas": r["titulo"], "created_at": None,
            "resultado": "", "calificacion": "", "closer_report": "", "link_llamada": "",
            "soloCalendario": True, "segunda": r["segunda"], "url": r.get("url"),
            "eventoId": r["eventoId"],
        })
    if extras:
        logger.info("Calendario: %s reuniones que el CRM no registró", len(extras))
    return sorted(_marcar_duplicados(_aplicar_lo_propio(filas + extras)), key=lambda f: f["call"])


def estado_de_las_reuniones(desde: date, hasta: date) -> dict:
    """Para cada reunión del calendario, si ya tiene el resultado cargado y con qué id.

    Lo usa el calendario del equipo para pintar lo que ya está cargado y para poder
    actualizarlo ahí mismo, sin pasar por la lista de un closer en particular.
    """
    ahora = datetime.now(AR_TZ).replace(tzinfo=None)
    precios = {_norm(p["nombre"]): p["precioUsd"] for p in programas()}
    filas = _sumar_reuniones_del_calendario(_leads(desde, hasta), desde, hasta)
    por_evento = {}
    for f in filas:
        evento = f.get("eventoId")
        if not evento or f.get("duplicada"):
            continue
        programa = (f.get("programa_ofrecido") or "").strip()
        por_evento[evento] = {
            "id": f["id"],
            "eventoId": evento,
            "prospecto": (f.get("nombre") or "").strip(),
            "fechaAt": f["call"].isoformat(),
            "resultado": "" if f["call"] > ahora else (f.get("resultado") or "").strip(),
            "estado": _clasificar(f.get("resultado", ""), f.get("calificacion", ""), f["call"], ahora,
                                  f.get("soloCalendario", False), f.get("duplicada", False)),
            "closer": f.get("closer") or "", "setter": f.get("setter") or "",
            "programa": programa,
            "facturacionUsd": precios.get(_norm(programa), 0.0) if programa else 0.0,
            "cashUsd": _num(f.get("pago")), "saldoUsd": _num(f.get("debe")),
            "reporte": (f.get("closer_report") or "").strip(),
            "segunda": bool(f.get("segunda")),
        }
    return {
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "desde": desde.isoformat(), "hasta": hasta.isoformat(),
        "programas": programas(), "estados": list(ESTADOS_LLAMADA),
        "porEvento": por_evento,
    }


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


def _marcar_duplicados(filas: list[dict]) -> list[dict]:
    """El CRM tiene la misma reunión dos veces: "Fulano" y "Fulano and Aumenta Tu Valor",
    a la misma hora. Una tiene el resultado y la otra queda vacía pidiendo que la carguen.
    Se deja una sola: la que está atada a la reunión del calendario, o la que tiene
    resultado. Las demás quedan marcadas y no cuentan para ninguna métrica."""
    grupos: dict[str, list[dict]] = {}
    for f in filas:
        clave = _clave_persona(f.get("nombre"))
        if not clave or not f.get("call"):
            continue
        grupos.setdefault(f"{clave}|{f['call'].strftime('%Y-%m-%d %H')}", []).append(f)
    for iguales in grupos.values():
        if len(iguales) < 2:
            continue
        # Manda la que tiene el resultado cargado: es la que alguien completó. La otra es
        # la copia que dejó el sync, aunque le haya tocado quedar atada a la reunión.
        mejor = sorted(iguales, key=lambda f: (
            0 if _norm(f.get("resultado")) not in ("", "agendado", "pendiente") else 1,
            0 if f.get("eventoId") else 1,
            str(f.get("id")),
        ))[0]
        for f in iguales:
            if f is mejor:
                continue
            f["duplicada"] = True
            # La que se queda hereda la reunión del calendario, para no perderla.
            if f.get("eventoId") and not mejor.get("eventoId"):
                mejor["eventoId"] = f["eventoId"]
                mejor["segunda"] = f.get("segunda", False)
                mejor["call"] = f["call"]
    return filas


def _bloque(leads: list[dict], ahora: datetime) -> dict:
    # Las descartadas quedan afuera de toda métrica.
    def _clase(l: dict) -> str:
        return _clasificar(l["resultado"], l["calificacion"], l["call"], ahora,
                           l.get("soloCalendario", False), l.get("duplicada", False))

    leads = [l for l in leads if _clase(l) not in ("descartada", "duplicada")]
    clases = [_clase(l) for l in leads]
    cierres = [l for l, c in zip(leads, clases) if c == "cierre"]
    shows = sum(1 for c in clases if c in ("show", "cierre"))
    no_shows = sum(1 for c in clases if c == "no_show")
    sin_reportar = sum(1 for c in clases if c == "sin_reportar")
    sin_crm = sum(1 for c in clases if c == "sin_crm")
    agendados = len(leads)
    cash = sum(_num(l["pago"]) for l in cierres)
    evaluables = shows + no_shows
    return {
        "agendados": agendados,
        "shows": shows,
        "noShows": no_shows,
        "sinReportar": sin_reportar,
        "sinCrm": sin_crm,
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

    leads = _sumar_reuniones_del_calendario(_leads(desde, hasta), desde, hasta)
    del_mes = [l for l in leads if inicio_mes <= l["call"].date() < fin_mes]
    mes_previo_inicio = date(anio - (m == 1), 12 if m == 1 else m - 1, 1)
    previos = _sumar_reuniones_del_calendario(_leads(mes_previo_inicio, inicio_mes), mes_previo_inicio, inicio_mes)

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
                "actualizadoAt": (_a_argentina(r["created_at"]).isoformat() if r and r["created_at"] else None),
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
            "origen": (l["origen"] or "").strip() or ("Ads" if l["vino_de_ads"] else "Orgánico"),
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
        clave = (l["origen"] or "").strip() or ("Ads" if l["vino_de_ads"] else "Orgánico")
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
        fila["ultimo"] = _a_argentina(fila["ultimo"])
        return {"conectado": True, "leads": fila["n"], "ultimoLeadAt": fila["ultimo"].isoformat() if fila["ultimo"] else None}
    except Exception as e:  # noqa: BLE001
        return {"conectado": False, "detalle": str(e)[:200]}


# ------------------------------------------------- programas y cierres

ESTADOS_LLAMADA = ("Cerrado", "Seña", "Seguimiento", "No show", "Descalificado", "Cancelada", "Re-agenda", "Agendado", "Descartada")
ESTADOS_VENTA = ("Cerrado", "Seña")
ROLES_PRECIOS = frozenset({"admin", "operaciones", "founder"})
# Quién puede cargar el resultado de una reunión. El calendario es del equipo: si la
# reunión se ve ahí, se tiene que poder cargar, aunque el lead figure a nombre de otro
# closer. Queda registrado quién la cargó en el reporte de la llamada.
ROLES_CARGAN_LLAMADAS = ROLES_PRECIOS | {"ventas", "closer", "setter"}


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


def mis_llamadas(usuario: dict, dias_atras: int = 30, dias_adelante: int = 14, closer: str | None = None,
                 mes: str | None = None) -> dict:
    """Las llamadas del closer: las que vienen, las de hoy y las que le falta reportar.

    Con `mes` ("2026-09") trae exactamente ese mes. Sin él, una ventana alrededor de hoy,
    que es lo que necesita el bloqueo por llamadas sin cargar.
    """
    ahora = datetime.now(AR_TZ).replace(tzinfo=None)
    hoy = ahora.date()
    nombres = [closer] if (closer and usuario.get("rol") in ROLES_PRECIOS | {"ventas"}) else _nombres_crm(usuario)
    if not nombres or not nombres[0]:
        return {"generadoAt": datetime.now(AR_TZ).isoformat(), "closer": None, "llamadas": [],
                "mes": {}, "programas": programas(), "estados": list(ESTADOS_LLAMADA)}

    # Se lee todo el período y recién después se filtra por closer: el cruce con el
    # calendario tiene que ver todas las llamadas para no duplicar las de otro.
    if mes:
        anio, m = int(mes[:4]), int(mes[5:7])
        desde = date(anio, m, 1)
        hasta = date(anio + (m == 12), (m % 12) + 1, 1)
    else:
        desde = hoy - timedelta(days=dias_atras)
        hasta = hoy + timedelta(days=dias_adelante + 1)
    mios = [_norm(n) for n in nombres]
    filas = sorted(
        [f for f in _sumar_reuniones_del_calendario(_leads(desde, hasta), desde, hasta)
         if _norm(f.get("closer")) in mios],
        key=lambda f: f["call"], reverse=True,
    )
    precios = {_norm(p["nombre"]): p["precioUsd"] for p in programas()}

    def _fila(l: dict) -> dict:
        programa = (l["programa_ofrecido"] or "").strip()
        return {
            "id": l["id"],
            "prospecto": (l["nombre"] or "").strip() or "Sin nombre",
            "email": l["email"] or "", "telefono": l["telefono"] or "", "instagram": (l["ig"] or "").lstrip("@"),
            "fechaAt": l["call"].isoformat(), "closer": l["closer"], "setter": l["setter"] or "",
            "origen": (l["origen"] or "").strip() or ("Ads" if l["vino_de_ads"] else "Orgánico"),
            "facturaHoy": (l["ingresos_rango"] or "").strip(),
            "resultado": "" if l["call"] > ahora else (l["resultado"] or "").strip(),
            "estado": _clasificar(l["resultado"], l["calificacion"], l["call"], ahora,
                                  l.get("soloCalendario", False), l.get("duplicada", False)),
            "soloCalendario": bool(l.get("soloCalendario")),
            "segunda": bool(l.get("segunda")),
            "eventoId": l.get("eventoId") or "",
            "programa": programa,
            "facturacionUsd": precios.get(_norm(programa), 0.0) if programa else 0.0,
            "cashUsd": _num(l["pago"]), "saldoUsd": _num(l["debe"]),
            "notas": (l["notas"] or "").strip(), "reporte": (l["closer_report"] or "").strip(),
            "grabacion": (l["link_llamada"] or "").strip(),
            "pasada": l["call"] <= ahora,
            "diasDesde": (hoy - l["call"].date()).days,
        }

    # Las duplicadas del CRM no se muestran: sería pedirle al closer que cargue dos veces.
    llamadas = [f for f in (_fila(l) for l in filas) if f["estado"] != "duplicada"]
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


def _a_utc(dt: datetime) -> datetime:
    """El CRM guarda en UTC sin marcar la zona: al escribir se hace el camino inverso."""
    return dt.replace(tzinfo=AR_TZ).astimezone(timezone.utc).replace(tzinfo=None)


# Columnas del CRM que no aceptan nulo y no tienen valor por defecto.
_VACIOS_LEAD = ("ig", "telefono", "avatar", "keyword", "content_url", "manychat_contact_id",
                "via", "punto_agenda", "link_llamada", "dolores_setting", "dolores_llamada",
                "razon_compra", "programada_ofrecido_llamada")


def crear_lead_desde_calendario(evento_id: str, usuario: dict) -> int:
    """Crea en el CRM la reunión que hasta ahora solo existía en el calendario.

    Se hace cuando el closer va a cargarle el resultado: el CRM sigue siendo la fuente
    única, así que la reunión tiene que existir ahí para poder guardar cash y programa.
    Si ya la creó otro, devuelve la que está y no duplica.
    """
    from src.services import gcal_services

    # Casi siempre la reunión ya se leyó al mostrar el calendario: se toma de ahí en vez
    # de pedirle a Google un año entero, que es lo que hacía tardar el guardado.
    reunion = gcal_services.reunion_por_id(evento_id)
    if reunion is None:
        hoy = datetime.now(AR_TZ).date()
        desde = datetime.combine(hoy - timedelta(days=120), time.min).replace(tzinfo=AR_TZ)
        hasta = datetime.combine(hoy + timedelta(days=120), time.min).replace(tzinfo=AR_TZ)
        reunion = next((r for r in gcal_services.reuniones_venta(desde, hasta) if r["eventoId"] == evento_id), None)
    if reunion is None:
        raise HTTPException(status_code=404, detail="Esa reunión ya no está en el calendario.")

    cuando = datetime.fromisoformat(reunion["inicioAt"]).astimezone(AR_TZ).replace(tzinfo=None)
    cuando_utc = _a_utc(cuando)
    nombre = reunion["prospecto"][:200]
    email = next(iter({_norm(e) for e in (reunion.get("invitados") or []) if _norm(e)}), "")

    # Si esta reunión ya tiene su llamada anotada, se usa esa y no se crea otra.
    atada = _referencias([evento_id]).get(evento_id)
    if atada and crm_db.consultar("SELECT id FROM lead WHERE id = %s", (atada,)):
        return int(atada)

    # Si ya existe esa misma reunión (la creó otro, o la sincronizó atv-mkt), se usa esa.
    ya = crm_db.consultar(
        "SELECT id FROM lead WHERE call >= %s AND call <= %s AND "
        "(lower(trim(coalesce(email, ''))) = %s AND %s <> '' OR lower(trim(nombre)) LIKE %s) LIMIT 1",
        (cuando_utc - timedelta(minutes=90), cuando_utc + timedelta(minutes=90),
         email, email, f"%{nombre.lower()}%"),
    )
    if ya:
        _atar_reunion(evento_id, int(ya[0]["id"]), nombre, cuando,
                      usuario.get("username") or "")
        return int(ya[0]["id"])

    duenio = _duenio_de_cada_lead()
    base = (duenio.get(f"email:{email}") if email else None) or duenio.get(f"nombre:{_clave_persona(nombre)}") or {}
    quien = (usuario.get("nombre") or usuario.get("username") or "")
    columnas = ", ".join(_VACIOS_LEAD)
    valores = ", ".join(["''"] * len(_VACIOS_LEAD))
    filas = crm_db.insertar(
        f"INSERT INTO lead (user_id, nombre, email, origen, closer, setter, call, agendo, agendo_en, "
        f"status, estado, programa_ofrecido, notas, closer_report, created_at, {columnas}) "
        f"VALUES ((SELECT coalesce(min(user_id), 1) FROM lead), %s, %s, %s, %s, %s, %s, now(), "
        f"'Google Calendar', 'Agendado', '', '', %s, '', now(), {valores}) RETURNING id",
        (nombre, email, (base.get("origen") or "").strip() or "Orgánico",
         # Solo se pone de closer a quien realmente toma llamadas: si un admin carga la
         # reunión de otro, la llamada queda sin asignar en vez de contarle a él.
         base.get("closer") or (quien if usuario.get("rol") in {"closer", "ventas"} else ""),
         base.get("setter") or "", cuando_utc, reunion["titulo"][:500]),
    )
    if not filas:
        raise HTTPException(status_code=502, detail="No se pudo crear la llamada en el CRM.")
    nuevo_id = int(filas[0]["id"])
    _atar_reunion(evento_id, nuevo_id, nombre, cuando, usuario.get("username") or "")
    logger.info("Reunión del calendario %s creada en el CRM como lead %s por %s",
                evento_id, nuevo_id, usuario.get("username"))
    _olvidar_meses()
    return nuevo_id


def _olvidar_meses() -> None:
    """Tira los resúmenes por mes, que son los que cambian al guardar. Se conservan el
    índice de dueños y el caché del calendario: rehacerlos en cada guardado es lo que
    hacía que la respuesta tardara y el proxy cortara con un 502."""
    with _lock:
        for k in [k for k in _cache if k != "duenios"]:
            _cache.pop(k, None)


def _lista_despues_de_guardar(usuario: dict, mes: str | None) -> dict:
    """La lista que se devuelve después de guardar.

    Si rearmarla falla (el calendario no contesta, el CRM tarda), el resultado ya quedó
    guardado: se avisa que hay que recargar en vez de tirar un error que haga pensar que
    no se guardó nada.
    """
    try:
        return mis_llamadas(usuario, mes=mes)
    except Exception as e:  # noqa: BLE001
        logger.warning("Guardado ok pero no se pudo rearmar la lista: %s", str(e)[:200])
        return {"generadoAt": datetime.now(AR_TZ).isoformat(), "guardado": True,
                "detalle": "Se guardó, pero la lista no se pudo actualizar sola. Tocá Actualizar.",
                "llamadas": [], "mes": {}, "programas": programas(), "estados": list(ESTADOS_LLAMADA)}


def _puede_cargar(lead_id: int, usuario: dict) -> None:
    """Que la llamada exista y que el rol trabaje en ventas. No se pide que sea suya:
    el calendario es del equipo y a veces el lead figura a nombre de otro closer."""
    if not crm_db.consultar("SELECT id FROM lead WHERE id = %s", (int(lead_id),)):
        raise HTTPException(status_code=404, detail="Esa llamada no existe en el CRM.")
    if usuario.get("rol") not in ROLES_CARGAN_LLAMADAS:
        raise HTTPException(status_code=403, detail="Tu rol no puede cargar resultados de llamadas.")


def descartar_llamada(lead_id: int | str, usuario: dict, recuperar: bool = False, mes: str | None = None,
                      con_lista: bool = True) -> dict:
    """Saca una llamada de la lista y de todas las métricas, o la devuelve.

    No borra la fila ni pisa el programa, el cash o la nota: solo cambia el estado, así
    una llamada descartada por error se recupera con todo lo que tenía. Las internas y
    las cargadas de más quedan en el filtro "Descartadas".
    """
    if isinstance(lead_id, str) and lead_id.startswith("cal:"):
        if recuperar:
            raise HTTPException(status_code=400, detail="Esa reunión todavía no está en el CRM.")
        lead_id = crear_lead_desde_calendario(lead_id[4:], usuario)
    _puede_cargar(lead_id, usuario)
    nuevo = "Agendado" if recuperar else "Descartada"
    _guardar_propio(int(lead_id), "", "", usuario.get("username") or "",
                    descartada=not recuperar, resultado="" if recuperar else "Descartada")
    crm_db.ejecutar("UPDATE lead SET status = %s, estado = %s WHERE id = %s", (nuevo, nuevo, int(lead_id)))
    logger.info("Llamada %s marcada %s por %s", lead_id, nuevo, usuario.get("username"))
    _olvidar_meses()
    return _lista_despues_de_guardar(usuario, mes) if con_lista else {"guardado": True, "id": int(lead_id)}


def registrar_resultado(lead_id: int | str, datos: dict, usuario: dict, mes: str | None = None,
                        con_lista: bool = True) -> dict:
    """Guarda lo que cargó el closer en el CRM, que es la fuente única: así ATV Marketing
    y ATV Ops muestran lo mismo y no hay dos verdades."""
    # La reunión que venía solo del calendario se crea en el CRM antes de guardarle nada.
    if isinstance(lead_id, str) and lead_id.startswith("cal:"):
        lead_id = crear_lead_desde_calendario(lead_id[4:], usuario)
    _puede_cargar(lead_id, usuario)

    resultado = str(datos.get("resultado") or "").strip()
    if resultado not in ESTADOS_LLAMADA:
        raise HTTPException(status_code=400, detail=f"Resultado inválido. Usá uno de: {', '.join(ESTADOS_LLAMADA)}.")
    es_venta = resultado in ESTADOS_VENTA
    programa = str(datos.get("programa") or "").strip()[:120]
    if es_venta and not programa:
        raise HTTPException(status_code=400, detail="Para marcar una venta hay que elegir el programa.")
    # El saldo ya no se pide en el formulario: si no viene, se deja el que tenga el CRM.
    toca_saldo = "saldoUsd" in datos
    try:
        cash = round(float(datos.get("cashUsd") or 0), 2)
        saldo = round(float(datos.get("saldoUsd") or 0), 2)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="El cash y el saldo tienen que ser números.")
    if cash < 0 or saldo < 0:
        raise HTTPException(status_code=400, detail="El cash y el saldo no pueden ser negativos.")
    if not es_venta:
        cash, saldo, programa = 0.0, 0.0, ""
        toca_saldo = True  # una llamada que no es venta no deja deuda
    nota = str(datos.get("nota") or "").strip()[:2000]
    quien = (usuario.get("nombre") or usuario.get("username") or "")
    # Qué reunión del calendario es esta llamada, para que el sync de atv-mkt no la
    # despegue cuando le cambie la fecha.
    evento = str(datos.get("evento") or "").strip()

    # Primero la base de ATV Ops, que es la fuente. El CRM se actualiza después para que
    # atv-mkt muestre lo mismo mientras dure la mudanza: si falla, el dato no se pierde.
    propio = {"resultado": resultado, "programa": programa, "cash_usd": cash,
              "nota": nota, "descartada": False}
    if toca_saldo:
        propio["saldo_usd"] = saldo
    _guardar_propio(int(lead_id), evento, str(datos.get("prospecto") or ""),
                    usuario.get("username") or "", **propio)
    crm_db.ejecutar(
        f"UPDATE lead SET status = %s, estado = %s, programa_ofrecido = %s, pago = %s, "
        f"{'debe = %s, ' if toca_saldo else ''}"
        "closer_report = COALESCE(NULLIF(%s, ''), closer_report), closer = COALESCE(NULLIF(closer, ''), %s) "
        "WHERE id = %s",
        (resultado, resultado, programa, cash, *( (saldo,) if toca_saldo else () ), nota, quien, int(lead_id)),
    )
    logger.info("Llamada %s marcada %s por %s (cash %s)", lead_id, resultado, usuario.get("username"), cash)
    _olvidar_meses()
    return _lista_despues_de_guardar(usuario, mes) if con_lista else {"guardado": True, "id": int(lead_id)}


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
