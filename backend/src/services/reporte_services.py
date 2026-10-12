"""
Reporte de dirección: un período cualquiera, las áreas que se elijan, una hoja editable.

Reemplaza al reporte semanal como entrada: la semana es un caso más del período. Cada
área es una sección con sus números del período —contados con las mismas funciones que
ya usaban las otras vistas— y una lectura que propone la IA y que la persona corrige.
Los números no se editan; el texto sí. Lo que se guarda es la hoja entera, con los
números congelados: un reporte es del momento en que se escribió.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import date, datetime, timedelta

from fastapi import HTTPException

from src.services import clients_db
from src.services import onboarding_services as onboarding
from src.services import reporte_semanal_services as semanal
from src.services import ventas_services as ventas
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.reporte")
_lock = threading.Lock()

# Las áreas en el orden en que se leen. `que` es lo que dice el cuadrado al elegirla.
AREAS = [
    {"clave": "ventas", "label": "Ventas",
     "que": "Llamadas, shows, cierres, señas, cash y por closer."},
    {"clave": "marketing", "label": "Marketing",
     "que": "Reels, reproducciones, historias con CTA, chats y setting por persona."},
    {"clave": "ads", "label": "Ads",
     "que": "Gasto, conversiones y costo por conversión de las campañas."},
    {"clave": "fulfillment", "label": "Fulfillment",
     "que": "Clientes que entraron y se fueron, cuotas cobradas, canales en silencio."},
    {"clave": "cobranza", "label": "Cobranza",
     "que": "Lo que entró por caja, lo que venció sin pagarse y lo que se arrastra."},
    {"clave": "onboarding", "label": "Onboarding",
     "que": "Quién entró, cuántos completaron el formulario y la llamada 1:1, y en cuántos días."},
    {"clave": "webinars", "label": "Webinars",
     "que": "Registros, vivos, retención en el pitch y las llamadas que dejó."},
    {"clave": "sistemas", "label": "Sistemas",
     "que": "Fuentes conectadas y las que se cargan a mano."},
    {"clave": "equipo", "label": "Equipo",
     "que": "Reportes diarios cargados por persona y días sin reportar."},
]
CLAVES = {a["clave"] for a in AREAS}


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _pct(a, b) -> float | None:
    return round(a / b * 100, 1) if b else None


def _fecha(texto: str, nombre: str) -> date:
    try:
        return date.fromisoformat(str(texto)[:10])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"La fecha '{nombre}' va como YYYY-MM-DD.") from None


def _label_periodo(desde: date, hasta: date) -> str:
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
             "septiembre", "octubre", "noviembre", "diciembre"]
    if desde.day == 1 and (hasta + timedelta(days=1)).day == 1 and desde.month == hasta.month:
        return f"{meses[desde.month - 1].capitalize()} {desde.year}"
    if (hasta - desde).days == 6 and desde.weekday() == 0:
        return f"Semana {desde.isocalendar()[1]} · {desde:%d/%m} al {hasta:%d/%m/%Y}"
    return f"{desde:%d/%m/%Y} al {hasta:%d/%m/%Y}"


def _kpi(key, label, valor, formato="count", nota=None, tono=None, previo=None, bueno="arriba"):
    """Un número de la hoja. `previo` es el mismo número del período anterior: con eso se
    arma la flecha, y `bueno` dice hacia dónde conviene que vaya."""
    return {"key": key, "label": label, "valor": valor, "formato": formato, "nota": nota,
            "tono": tono, "previo": previo, "bueno": bueno}


# ------------------------------------------------------------------ secciones

def _seccion_ventas(desde: date, hasta_ex: date, p_desde: date, p_hasta_ex: date) -> dict:
    llamadas = ventas._sumar_reuniones_del_calendario(min(desde, p_desde), max(hasta_ex, p_hasta_ex))
    v = semanal._bloque_ventas(desde, hasta_ex, llamadas)
    p = semanal._bloque_ventas(p_desde, p_hasta_ex, llamadas)
    return {
        "kpis": [
            _kpi("agendadas", "Agendadas", v["agendadas"], previo=p["agendadas"]),
            _kpi("showRate", "Show rate", v["showRate"], "pct", nota=f"{v['shows']} shows", previo=p["showRate"]),
            _kpi("cierres", "Cierres", v["cierres"], nota=f"+ {v['senas']} señas" if v["senas"] else None, previo=p["cierres"]),
            _kpi("closeRate", "Close rate", v["closeRate"], "pct", previo=p["closeRate"]),
            _kpi("cashUsd", "Cash", v["cashUsd"], "usd", tono="ok" if v["cashUsd"] else None,
                 nota=f"de {ventas_fmt(v['facturacionUsd'])} facturados" if v["facturacionUsd"] else None,
                 previo=p["cashUsd"]),
        ],
        "detalle": {"porCloser": v["porCloser"], "ventas": v["ventas"], "noShows": v["noShows"],
                    "sinReportar": v["sinReportar"]},
    }


def ventas_fmt(n) -> str:
    return f"US$ {int(round(_num(n))):,}".replace(",", ".")


def _seccion_marketing(desde: date, hasta_ex: date, p_desde: date, p_hasta_ex: date, agendadas: int) -> dict:
    from src.services import conversaciones_services

    m = semanal._bloque_marketing(desde, hasta_ex)
    p = semanal._bloque_marketing(p_desde, p_hasta_ex)
    chats = chats_p = 0
    try:
        chats = int((conversaciones_services.chats(desde, hasta_ex - timedelta(days=1)) or {}).get("total") or 0)
        chats_p = int((conversaciones_services.chats(p_desde, p_hasta_ex - timedelta(days=1)) or {}).get("total") or 0)
    except Exception as e:  # noqa: BLE001
        logger.info("Chats del período: %s", str(e)[:120])
    return {
        "kpis": [
            _kpi("reels", "Reels", m["reels"], nota=f"{m['reproducciones']:,} reproducciones".replace(",", "."), previo=p["reels"]),
            _kpi("historias", "Historias con CTA", m["historias"], nota=f"{m['chatsHistorias']:,} chats".replace(",", "."), previo=p["historias"]),
            _kpi("chats", "Chats", chats, previo=chats_p),
            _kpi("videos", "YouTube", m["videos"], nota=f"{m['vistas']:,} vistas".replace(",", "."), previo=p["videos"]),
            _kpi("chatsAgenda", "Chats → agenda", _pct(agendadas, chats), "pct",
                 nota=f"{agendadas} de {chats:,}".replace(",", ".") if chats else "sin chats"),
        ],
        "detalle": {"porSetter": m["porSetter"], "publicaciones": m["publicaciones"]},
    }


def _seccion_ads(desde: date, hasta: date) -> dict:
    mes_inicio = desde.replace(day=1)
    mes_fin = date(hasta.year + (hasta.month == 12), (hasta.month % 12) + 1, 1)
    a = semanal._bloque_ads(mes_inicio, mes_fin)
    cpl = round(a["gastoUsd"] / a["conversiones"], 2) if a["conversiones"] else None
    meses = (hasta.year - desde.year) * 12 + hasta.month - desde.month + 1
    return {
        "kpis": [
            _kpi("gastoUsd", "Inversión", a["gastoUsd"], "usd", nota=f"{a['campanias']} campañas"),
            _kpi("conversiones", "Conversiones", a["conversiones"]),
            _kpi("cplUsd", "Costo por conversión", cpl, "usd"),
            _kpi("clicks", "Clicks", a["clicks"], nota=f"{a['impresiones']:,} impresiones".replace(",", ".") if a["impresiones"] else None),
        ],
        "detalle": {"nota": f"Meta reporta por mes: {'el mes completo' if meses == 1 else f'los {meses} meses'} que cubre el período."},
    }


def _seccion_fulfillment(desde: date, hasta_ex: date, p_desde: date, p_hasta_ex: date) -> dict:
    c = semanal._bloque_cartera(desde, hasta_ex)
    p = semanal._bloque_cartera(p_desde, p_hasta_ex)
    silencio = activos = None
    try:
        from src.services.transcripts_services import TranscriptsServices
        canales = [x for x in TranscriptsServices().listar()["canales"]
                   if x.get("en_discord") and x.get("categoria") != "updates"]
        activos = len(canales)
        silencio = sum(1 for x in canales if (x.get("dias_sin_actividad") or 0) >= 7)
    except Exception as e:  # noqa: BLE001
        logger.info("Canales para el reporte: %s", str(e)[:120])
    return {
        "kpis": [
            _kpi("altas", "Entraron", c["altas"], tono="ok" if c["altas"] else None, previo=p["altas"]),
            _kpi("bajas", "Bajas", c["bajas"], tono="alert" if c["bajas"] else None, previo=p["bajas"], bueno="abajo"),
            _kpi("cobradoUsd", "Cobrado", c["cobradoUsd"], "usd", nota=f"{c['cuotasPagadas']} cuotas", previo=p["cobradoUsd"]),
            _kpi("activos", "Canales activos", activos),
            _kpi("silencio", "En silencio", silencio, nota="≥ 7 días sin mensaje", tono="alert" if silencio else None, bueno="abajo"),
        ],
        "detalle": {"altas": c["altasDetalle"], "bajas": c["bajasDetalle"]},
    }


def _seccion_cobranza(desde: date, hasta_ex: date, p_desde: date, p_hasta_ex: date) -> dict:
    if not clients_db.disponible():
        return {"kpis": [], "detalle": {"nota": "Sin conexión con ATV Clients."}}
    TIPO = "split_part(coalesce(q.notas, ''), chr(10), 1)"

    def cajas(d0, d1):
        filas = clients_db.consultar(
            f"SELECT {TIPO} AS tipo, sum(pi.monto_usd) AS usd, count(*) AS n "
            "FROM {esquema}.pagos p JOIN {esquema}.pago_imputaciones pi ON pi.pago_id = p.id "
            "JOIN {esquema}.cuotas q ON q.id = pi.cuota_id "
            "WHERE p.fecha >= %s AND p.fecha < %s GROUP BY 1", (d0, d1))
        c1 = sum(_num(f["usd"]) for f in filas if f["tipo"] in ("cuota_venta", "sena"))
        c2 = sum(_num(f["usd"]) for f in filas if f["tipo"] in ("cuota_upsell", "cuota_recompra"))
        return c1, c2, sum(int(f["n"]) for f in filas)

    c1, c2, n = cajas(desde, hasta_ex)
    p1, p2, _ = cajas(p_desde, p_hasta_ex)
    vencidas = clients_db.consultar(
        "SELECT count(*) AS n, coalesce(sum(q.monto_usd - coalesce((SELECT sum(pi.monto_usd) "
        "FROM {esquema}.pago_imputaciones pi WHERE pi.cuota_id = q.id), 0)), 0) AS saldo "
        "FROM {esquema}.cuotas q WHERE q.fecha_pago IS NULL AND q.fecha_vence >= %s AND q.fecha_vence < %s",
        (desde, hasta_ex))
    atras = clients_db.consultar(
        "SELECT count(*) AS n, coalesce(sum(q.monto_usd - coalesce((SELECT sum(pi.monto_usd) "
        "FROM {esquema}.pago_imputaciones pi WHERE pi.cuota_id = q.id), 0)), 0) AS saldo "
        "FROM {esquema}.cuotas q WHERE q.fecha_pago IS NULL AND q.fecha_vence < %s", (desde,))
    v = vencidas[0] if vencidas else {"n": 0, "saldo": 0}
    a = atras[0] if atras else {"n": 0, "saldo": 0}
    return {
        "kpis": [
            _kpi("entroUsd", "Entró", round(c1 + c2, 2), "usd", nota=f"{n} pagos", tono="ok" if c1 + c2 else None, previo=round(p1 + p2, 2)),
            _kpi("caja1Usd", "Caja 1", round(c1, 2), "usd", nota="ventas nuevas y señas", previo=round(p1, 2)),
            _kpi("caja2Usd", "Caja 2", round(c2, 2), "usd", nota="upsell y recompra", previo=round(p2, 2)),
            _kpi("vencioUsd", "Venció sin pagarse", round(_num(v["saldo"]), 2), "usd", nota=f"{int(v['n'])} cuotas del período",
                 tono="warn" if _num(v["saldo"]) else None, bueno="abajo"),
            _kpi("atrasadoUsd", "Arrastrado", round(_num(a["saldo"]), 2), "usd", nota=f"{int(a['n'])} cuotas de antes",
                 tono="alert" if _num(a["saldo"]) else None, bueno="abajo"),
        ],
        "detalle": {},
    }


def _seccion_onboarding(desde: date, hasta_ex: date, p_desde: date, p_hasta_ex: date) -> dict:
    o = onboarding.semana(desde, hasta_ex)
    p = onboarding.semana(p_desde, p_hasta_ex)
    t = o.get("total") or 0
    return {
        "kpis": [
            _kpi("total", "Entraron", t, previo=p.get("total")),
            _kpi("conFormulario", "Formulario", o.get("conFormulario"), nota=f"de {t}" + (f" · {o['medianaFormularioDias']} días" if o.get("medianaFormularioDias") is not None else "")),
            _kpi("conLlamadaHecha", "Llamada 1:1", o.get("conLlamadaHecha"), nota=f"de {t} · {o.get('conLlamadaAgendada') or 0} agendadas",
                 tono="warn" if t and not o.get("conLlamadaHecha") else None),
            _kpi("conDiscord", "Discord", o.get("conDiscord"), nota=f"de {t}"),
            _kpi("enSkool", "Skool", o.get("enSkool"), nota=f"de {t}"),
        ],
        "detalle": {"sesiones": o.get("sesiones") or [], "porPlan": o.get("porPlan") or []},
    }


def _seccion_webinars(desde: date, hasta_ex: date) -> dict:
    from src.services.webinars_services import WebinarsServices

    svc = WebinarsServices()
    filas = []
    for w in svc.listar():
        fh = (w.get("fechaHora") or "")[:10]
        if not fh or not (desde.isoformat() <= fh < hasta_ex.isoformat()):
            continue
        try:
            m = svc.obtener(int(w["id"])).get("metricas") or {}
        except Exception:  # noqa: BLE001
            m = w.get("metricas") or {}
        filas.append({"id": w["id"], "nombre": w.get("nombre"), "fecha": fh,
                      **{k: m.get(k) for k in ("registros", "vivos", "retenidosPitch", "booked",
                                               "llamadasAgendadas", "cierres", "cashUsd", "gastoAdsUsd")}})
    suma = lambda k: sum(_num(f.get(k)) for f in filas)  # noqa: E731
    return {
        "kpis": [
            _kpi("webinars", "Webinars", len(filas)),
            _kpi("registros", "Registros", int(suma("registros"))),
            _kpi("vivos", "En vivo", int(suma("vivos")), nota=f"{_pct(suma('vivos'), suma('registros'))} % de los registrados" if suma("registros") else None),
            _kpi("llamadasAgendadas", "Llamadas", int(suma("llamadasAgendadas")), nota=f"{int(suma('cierres'))} cierres"),
            _kpi("cashUsd", "Cash", round(suma("cashUsd"), 2), "usd", tono="ok" if suma("cashUsd") else None),
        ],
        "detalle": {"webinars": filas},
    }


def _seccion_sistemas() -> dict:
    from src.services import cartera_services as cartera
    from src.services import marketing_services as marketing

    fuentes = {}
    for nombre, fn in (("CRM / llamadas", ventas.estado), ("Marketing", marketing.estado),
                       ("ATV Clients", cartera.estado), ("Onboarding", onboarding.estado)):
        try:
            fuentes[nombre] = fn()
        except Exception as e:  # noqa: BLE001
            fuentes[nombre] = {"conectado": False, "detalle": str(e)[:120]}
    conectadas = sum(1 for f in fuentes.values() if f.get("conectado"))
    return {
        "kpis": [
            _kpi("conectadas", "Fuentes conectadas", conectadas, nota=f"de {len(fuentes)}",
                 tono="ok" if conectadas == len(fuentes) else "warn"),
            _kpi("caidas", "Sin conectar", len(fuentes) - conectadas, tono="alert" if conectadas < len(fuentes) else None, bueno="abajo"),
        ],
        "detalle": {"fuentes": [{"nombre": k, **(v or {})} for k, v in fuentes.items()]},
    }


def _seccion_equipo(desde: date, hasta_ex: date) -> dict:
    from pony.orm import db_session

    from src.models import ReporteDia

    dias_habiles = sum(1 for i in range((hasta_ex - desde).days) if (desde + timedelta(days=i)).weekday() < 5)
    por_persona: dict[str, dict] = {}
    with db_session:
        for r in list(ReporteDia.select()):
            if not (desde <= r.fecha < hasta_ex):
                continue
            p = por_persona.setdefault(r.persona, {"persona": r.persona, "rol": r.rol, "dias": 0})
            p["dias"] += 1
    personas = sorted(por_persona.values(), key=lambda x: -x["dias"])
    for p in personas:
        p["sinReportar"] = max(0, dias_habiles - p["dias"])
    return {
        "kpis": [
            _kpi("personas", "Personas que reportaron", len(personas)),
            _kpi("dias", "Días reportados", sum(p["dias"] for p in personas), nota=f"{dias_habiles} hábiles × persona"),
            _kpi("sinReportar", "Días sin reportar", sum(p["sinReportar"] for p in personas),
                 tono="warn" if any(p["sinReportar"] for p in personas) else None, bueno="abajo"),
        ],
        "detalle": {"personas": personas},
    }


# ------------------------------------------------------------------ armar

def armar(desde_txt: str, hasta_txt: str, areas: list[str]) -> dict:
    """La hoja: el período, el anterior del mismo largo, y una sección por área."""
    desde, hasta = _fecha(desde_txt, "desde"), _fecha(hasta_txt, "hasta")
    if hasta < desde:
        raise HTTPException(status_code=400, detail="La fecha 'hasta' es anterior a 'desde'.")
    if (hasta - desde).days > 400:
        raise HTTPException(status_code=400, detail="El período no puede pasar de un año.")
    elegidas = [a for a in areas if a in CLAVES] or [a["clave"] for a in AREAS[:6]]
    hasta_ex = hasta + timedelta(days=1)
    largo = (hasta_ex - desde).days
    p_desde, p_hasta_ex = desde - timedelta(days=largo), desde

    secciones: dict[str, dict] = {}
    agendadas = 0
    for clave in elegidas:
        try:
            if clave == "ventas":
                s = _seccion_ventas(desde, hasta_ex, p_desde, p_hasta_ex)
                agendadas = next((k["valor"] for k in s["kpis"] if k["key"] == "agendadas"), 0) or 0
            elif clave == "marketing":
                if "ventas" not in secciones and not agendadas:
                    llamadas = ventas._sumar_reuniones_del_calendario(desde, hasta_ex)
                    agendadas = semanal._bloque_ventas(desde, hasta_ex, llamadas)["agendadas"]
                s = _seccion_marketing(desde, hasta_ex, p_desde, p_hasta_ex, agendadas)
            elif clave == "ads":
                s = _seccion_ads(desde, hasta)
            elif clave == "fulfillment":
                s = _seccion_fulfillment(desde, hasta_ex, p_desde, p_hasta_ex)
            elif clave == "cobranza":
                s = _seccion_cobranza(desde, hasta_ex, p_desde, p_hasta_ex)
            elif clave == "onboarding":
                s = _seccion_onboarding(desde, hasta_ex, p_desde, p_hasta_ex)
            elif clave == "webinars":
                s = _seccion_webinars(desde, hasta_ex)
            elif clave == "sistemas":
                s = _seccion_sistemas()
            else:
                s = _seccion_equipo(desde, hasta_ex)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("Sección %s del reporte", clave)
            s = {"kpis": [], "detalle": {"nota": f"No se pudo armar esta sección: {str(e)[:120]}"}}
        s["label"] = next(a["label"] for a in AREAS if a["clave"] == clave)
        s["lectura"] = ""
        secciones[clave] = s

    return {
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "periodo": {"desde": desde.isoformat(), "hasta": hasta.isoformat(), "dias": largo,
                    "label": _label_periodo(desde, hasta),
                    "previo": {"desde": p_desde.isoformat(), "hasta": (p_hasta_ex - timedelta(days=1)).isoformat(),
                               "label": _label_periodo(p_desde, p_hasta_ex - timedelta(days=1))}},
        "areas": elegidas,
        "secciones": secciones,
    }


# ------------------------------------------------------------------ lecturas

SYSTEM_LECTURAS = (
    "Sos el director de operaciones de ATV, una empresa de mentoría para negocios digitales. "
    "Te pasan los números de un período por área, con el período anterior al lado. Escribís la "
    "lectura de cada sección para el reporte de dirección: qué pasó y qué significa, en dos o "
    "tres frases, en español rioplatense, sin adjetivos vacíos ni consejos genéricos. Usá solo "
    "los números que te dan; si un número falta, no lo inventes ni lo menciones. "
    "Respondé SOLO un JSON: {\"<area>\": \"<lectura>\", ...} con exactamente las áreas que te pasan."
)


def proponer_lecturas(hoja: dict) -> dict[str, str]:
    """Una sola llamada a Claude para todas las secciones. Si falla, lecturas vacías: la
    persona escribe la suya, el reporte no se cae por esto."""
    from src.services.activacion_ia_services import invocar_claude_texto

    secciones = hoja.get("secciones") or {}
    if not secciones:
        return {}
    resumen = {}
    for clave, s in secciones.items():
        resumen[clave] = {
            "area": s.get("label"),
            "numeros": [{"que": k["label"], "valor": k["valor"], "anterior": k.get("previo"),
                         "nota": k.get("nota")} for k in s.get("kpis") or []],
        }
    user = (f"Período: {hoja['periodo']['label']} (comparado con {hoja['periodo']['previo']['label']}).\n"
            + json.dumps(resumen, ensure_ascii=False))
    try:
        texto, _meta = invocar_claude_texto(SYSTEM_LECTURAS, user)
        ini, fin = texto.find("{"), texto.rfind("}")
        datos = json.loads(texto[ini:fin + 1]) if ini != -1 and fin != -1 else {}
        return {k: str(v).strip() for k, v in datos.items() if k in secciones and isinstance(v, str)}
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron proponer las lecturas: %s", str(e)[:200])
        return {}


# ------------------------------------------------------------------ guardar

def _a_dict(r) -> dict:
    return {
        "id": r.id, "titulo": r.titulo, "desde": r.desde.isoformat(), "hasta": r.hasta.isoformat(),
        "areas": json.loads(r.areas or "[]"), "estado": r.estado,
        "hoja": json.loads(r.hoja or "{}"),
        "creadoPor": r.creado_por, "creadoAt": r.creado_at.isoformat() if r.creado_at else None,
        "actualizadoAt": r.actualizado_at.isoformat() if r.actualizado_at else None,
    }


def guardar(datos: dict, usuario: dict) -> dict:
    """Guarda la hoja entera, con números y lecturas. `id` para pisar una que ya existe."""
    from pony.orm import db_session

    from src.models import ReporteDireccion

    hoja = datos.get("hoja") or {}
    periodo = hoja.get("periodo") or {}
    if not periodo.get("desde") or not periodo.get("hasta"):
        raise HTTPException(status_code=400, detail="La hoja no tiene período.")
    quien = usuario.get("username") or usuario.get("nombre") or ""
    with db_session:
        r = ReporteDireccion.get(id=int(datos["id"])) if datos.get("id") else None
        if r is None:
            r = ReporteDireccion(desde=_fecha(periodo["desde"], "desde"), hasta=_fecha(periodo["hasta"], "hasta"),
                                 creado_por=quien)
        r.titulo = (datos.get("titulo") or periodo.get("label") or "Reporte").strip()[:160]
        r.areas = json.dumps(hoja.get("areas") or [])
        r.hoja = json.dumps(hoja, ensure_ascii=False)
        r.estado = "final" if datos.get("cerrar") else "borrador"
        r.actualizado_por = quien
        r.actualizado_at = datetime.utcnow()
        r.flush()
        return _a_dict(r)


def listar() -> list[dict]:
    from pony.orm import db_session

    from src.models import ReporteDireccion

    with db_session:
        filas = sorted(list(ReporteDireccion.select()), key=lambda r: (r.desde, r.id), reverse=True)
        return [{k: v for k, v in _a_dict(r).items() if k != "hoja"} for r in filas]


def obtener(reporte_id: int) -> dict:
    from pony.orm import db_session

    from src.models import ReporteDireccion

    with db_session:
        r = ReporteDireccion.get(id=reporte_id)
        if r is None:
            raise HTTPException(status_code=404, detail="Ese reporte no existe.")
        return _a_dict(r)
