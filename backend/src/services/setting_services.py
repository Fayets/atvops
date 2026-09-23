"""
El registro de pitches del setter y lo que sale de él.

Es lo que Cris llevaba en SetSystem, adentro de ATV Ops. Cada fila es un link de agenda
enviado; de ahí se desprende todo lo demás: si agendó, si vino, si cerró, cuánto entró.

Las cuentas viven en funciones puras sobre diccionarios (`_bloque`, `_semanas_de`)
para que se puedan probar sin base y para que las use cualquier vista.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta

from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.setting")

CANALES = ("dm", "phone", "hibrido")
ORIGENES = ("organico", "ads")
PITCH_ESTADOS = ("pendiente", "booked", "ghosted", "denied")
LLAMADA_ESTADOS = ("scheduled", "showed", "no_show", "cancelled", "deposit", "closed")
# Lo que cuenta como show: vino a la llamada, haya cerrado o no.
SHOW = {"showed", "deposit", "closed"}
# No vino: da igual si avisó antes o no apareció, la llamada no pasó.
NO_VINO = {"no_show", "cancelled"}
# Lo que ya se resolvió: se sabe si vino o no.
RESUELTOS = SHOW | NO_VINO

# Los rangos sanos de cada paso. Son los mismos que usa la vista de Setting de ops.
RANGOS = {
    "booking": {"verde": 30, "amarillo": 20},
    "show": {"verde": 80, "amarillo": 65},
    "close": {"verde": 25, "amarillo": 15},
}

# Quién puede ver los pitches de todos: el setter ve los suyos.
ROLES_VEN_TODO = {"admin", "operaciones", "founder", "ventas"}


def hoy_ar() -> date:
    return datetime.now(AR_TZ).date()


def _tasa(a: int, b: int) -> float | None:
    return round(a / b * 100, 1) if b else None


def _fecha(v) -> date | None:
    if not v:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _iso(v) -> str | None:
    d = _fecha(v)
    return d.isoformat() if d else None


# ------------------------------------------------------------------ serialización

def fecha_llamada(p: dict) -> date | None:
    """Para cuándo quedó la llamada: la reprogramación pisa a la fecha original."""
    return _fecha(p.get("reprogramadaAt")) or _fecha(p.get("llamadaAt"))


def _derivados(p: dict, hoy: date) -> dict:
    """Lo que la pantalla necesita saber de cada pitch sin volver a calcularlo."""
    cuando = fecha_llamada(p)
    estado = p.get("llamadaEstado")
    return {
        **p,
        "fechaLlamada": cuando.isoformat() if cuando else None,
        # Agendada y sin resultado: no falló nada todavía, esté la fecha adelante o atrás.
        "sinResolver": _sin_resolver(p),
        "vencida": bool(_sin_resolver(p) and cuando is not None and cuando < hoy),
        "show": estado in SHOW,
    }


def _a_dict(p) -> dict:
    return {
        "id": p.id,
        "externoId": p.externo_id,
        "prospecto": p.prospecto,
        "pitchAt": p.pitch_at.isoformat(),
        "setter": p.setter,
        "canal": p.canal,
        "origen": p.origen,
        "pitchEstado": p.pitch_estado,
        "agendoAt": _iso(p.agendo_at),
        "llamadaAt": _iso(p.llamada_at),
        "reprogramadaAt": _iso(p.reprogramada_at),
        "reprogramaciones": p.reprogramaciones,
        "llamadaEstado": p.llamada_estado,
        "cierreAt": _iso(p.cierre_at),
        "seguimientos": p.seguimientos,
        "llamadas": p.llamadas,
        "valorUsd": p.valor_usd,
        "cashUsd": p.cash_usd,
        "email": p.email,
        "telefono": p.telefono,
        "usuarioIg": p.usuario_ig,
        "nota": p.nota,
        "creadoAt": p.creado_at.isoformat(),
        "actualizadoAt": p.actualizado_at.isoformat(),
    }


# ------------------------------------------------------------------ cuentas puras

def _en(fecha, desde: date | None, hasta: date | None) -> bool:
    d = _fecha(fecha)
    if d is None:
        return False
    return (desde is None or d >= desde) and (hasta is None or d <= hasta)


def _sin_resolver(p: dict) -> bool:
    """Agendó y todavía no se sabe qué pasó con la llamada.

    No mira la fecha a propósito: una call de ayer sin resultado cargado tampoco resolvió
    nada, y meterla en el show rate como si hubiera fallado ensucia el número.
    """
    return p.get("pitchEstado") == "booked" and (p.get("llamadaEstado") or "") in ("", "scheduled")


def _bloque(leads: list[dict], calls: list[dict]) -> dict:
    """Las cuentas de un período.

    Dos conjuntos distintos y a propósito: `leads` son los pitches mandados en el período
    y `calls` las llamadas que caían en él. El booking se juzga sobre el día que se mandó
    el link; el show, sobre el día que era la llamada. Mezclarlos hace que una semana con
    muchas calls arrastradas de la anterior parezca mejor de lo que fue.
    """
    resueltos = [p for p in leads if p.get("pitchEstado") != "pendiente"]
    pendientes = [p for p in leads if p.get("pitchEstado") == "pendiente"]
    booked = [p for p in leads if p.get("pitchEstado") == "booked"]
    ghosted = [p for p in leads if p.get("pitchEstado") == "ghosted"]
    denied = [p for p in leads if p.get("pitchEstado") == "denied"]
    # Un ciclo completo es un pitch que ya llegó al final: o no agendó, o agendó y la
    # llamada se resolvió. Los que tienen la call por delante todavía no fallaron nada.
    recorridos = len(resueltos) - sum(1 for p in leads if _sin_resolver(p))
    cierres_del_pitch = [p for p in leads if p.get("llamadaEstado") == "closed"]

    llamadas_resueltas = [p for p in calls if p.get("llamadaEstado") in RESUELTOS]
    por_ocurrir = [p for p in calls if _sin_resolver(p)]
    shows = [p for p in calls if p.get("llamadaEstado") in SHOW]
    no_vinieron = [p for p in calls if p.get("llamadaEstado") in NO_VINO]
    cierres = [p for p in calls if p.get("llamadaEstado") == "closed"]
    depositos = [p for p in calls if p.get("llamadaEstado") == "deposit"]

    return {
        "pitches": len(leads), "pitchesResueltos": len(resueltos), "pitchesPendientes": len(pendientes),
        "agendas": len(booked), "ghosted": len(ghosted), "denied": len(denied),
        "recorridosCompletos": max(recorridos, 0), "cierresDelPitch": len(cierres_del_pitch),
        "llamadasResueltas": len(llamadas_resueltas), "porOcurrir": len(por_ocurrir),
        "shows": len(shows), "noShows": len(no_vinieron), "cierres": len(cierres),
        "depositos": len(depositos),
        "booking": _tasa(len(booked), len(resueltos)),
        "show": _tasa(len(shows), len(llamadas_resueltas)),
        "close": _tasa(len(cierres), len(shows)),
        # Setting rate: de los ciclos que terminaron, cuántos terminaron en cierre.
        "setting": _tasa(len(cierres_del_pitch), max(recorridos, 0)),
    }


def _recorte(pitches: list[dict], desde: date | None, hasta: date | None,
             canal: str | None = None) -> tuple[list[dict], list[dict]]:
    filas = [p for p in pitches if not canal or p.get("canal") == canal]
    leads = [p for p in filas if _en(p.get("pitchAt"), desde, hasta)]
    calls = [p for p in filas if _en(p.get("fechaLlamada"), desde, hasta)]
    return leads, calls


# ------------------------------------------------------------------ dónde conviene trabajar

MEJORA = 10  # los diez puntos que se simulan en cada etapa

CONSEJOS = {
    "booking": "El problema está en el pitch o en el follow-up: te contestan poco o no les interesa la call.",
    "show": "Agendan pero no aparecen: falta recordatorio previo o estás agendando muy lejos.",
    "close": "Llegan a la call pero no cierran: el problema está en la llamada misma o en la calificación del lead.",
}


def _donde_conviene(m: dict) -> dict | None:
    """Qué etapa mueve más cierres si sube diez puntos.

    No es la peor tasa: es la que más cierres agrega. Una etapa horrible sobre cuatro
    leads mueve menos que una mediocre sobre cuarenta, y arreglar la primera no cambia
    el mes.
    """
    show_f = (m["show"] or 0) / 100
    close_f = (m["close"] or 0) / 100
    r = MEJORA / 100
    etapas = [
        {"id": "booking", "etapa": "Pitch → Agenda", "tasa": m["booking"], "base": m["pitchesResueltos"],
         "perdidos": m["pitchesResueltos"] - m["agendas"], "ganancia": m["pitchesResueltos"] * r * show_f * close_f},
        {"id": "show", "etapa": "Agenda → Show", "tasa": m["show"], "base": m["llamadasResueltas"],
         "perdidos": m["llamadasResueltas"] - m["shows"], "ganancia": m["llamadasResueltas"] * r * close_f},
        {"id": "close", "etapa": "Show → Close", "tasa": m["close"], "base": m["shows"],
         "perdidos": m["shows"] - m["cierres"], "ganancia": m["shows"] * r},
    ]
    etapas = [e for e in etapas if e["base"] > 0]
    if not etapas:
        return None
    for e in etapas:
        e["ganancia"] = round(e["ganancia"], 1)
        e["consejo"] = CONSEJOS[e["id"]]
        rango = RANGOS[e["id"]]
        e["zona"] = (None if e["tasa"] is None else "ok" if e["tasa"] >= rango["verde"]
                     else "warn" if e["tasa"] >= rango["amarillo"] else "alert")
    ordenadas = sorted(etapas, key=lambda e: e["ganancia"], reverse=True)
    return {"mejor": ordenadas[0]["id"], "mejora": MEJORA,
            "etapas": sorted(etapas, key=lambda e: e["ganancia"], reverse=True)}


# ------------------------------------------------------------------ plata, velocidad y follow ups

def _dias(desde, hasta) -> int | None:
    a, b = _fecha(desde), _fecha(hasta)
    return (b - a).days if a and b else None


def _promedio(valores: list) -> float | None:
    limpios = [v for v in valores if v is not None]
    return round(sum(limpios) / len(limpios), 1) if limpios else None


def _cash(leads: list[dict]) -> dict:
    """Lo vendido, lo cobrado y lo que falta.

    Los cierres sin monto cargado se cuentan aparte en vez de entrar como cero: un cero
    inventado baja el ticket promedio y hace que el mes parezca peor de lo que fue.
    """
    cerrados = [p for p in leads if p.get("llamadaEstado") in ("closed", "deposit")]
    con_monto = [p for p in cerrados if (p.get("valorUsd") or 0) > 0 or (p.get("cashUsd") or 0) > 0]
    revenue = sum(float(p.get("valorUsd") or 0) for p in con_monto)
    cobrado = sum(float(p.get("cashUsd") or 0) for p in con_monto)
    cierres = [p for p in con_monto if p.get("llamadaEstado") == "closed"]
    return {
        "revenue": round(revenue, 2), "cobrado": round(cobrado, 2),
        "porCobrar": round(revenue - cobrado, 2),
        "ticket": round(revenue / len(cierres), 2) if cierres else None,
        "revenuePorPitch": round(revenue / len(leads), 2) if leads else None,
        "sinMonto": len([p for p in cerrados if p not in con_monto]),
        "cobros": sorted(
            [{"id": p["id"], "prospecto": p["prospecto"], "cuando": p.get("cierreAt") or p.get("fechaLlamada"),
              "estado": p.get("llamadaEstado"), "revenue": float(p.get("valorUsd") or 0),
              "cobrado": float(p.get("cashUsd") or 0),
              "falta": round(float(p.get("valorUsd") or 0) - float(p.get("cashUsd") or 0), 2)}
             for p in con_monto],
            key=lambda c: c["cuando"] or "", reverse=True),
    }


def _velocidad(leads: list[dict]) -> dict:
    agendados = [p for p in leads if p.get("pitchEstado") == "booked"]
    a_agenda = [_dias(p.get("pitchAt"), p.get("agendoAt")) for p in agendados]
    a_call = [_dias(p.get("agendoAt"), p.get("fechaLlamada")) for p in agendados]
    mismo_dia = sum(1 for d in a_agenda if d == 0)
    return {
        "mismoDia": _tasa(mismo_dia, len([d for d in a_agenda if d is not None])),
        "pitchAAgenda": _promedio(a_agenda), "agendaACall": _promedio(a_call),
    }


def _follow_ups(leads: list[dict]) -> dict:
    agendados = [p for p in leads if p.get("pitchEstado") == "booked"]
    ghosteados = [p for p in leads if p.get("pitchEstado") == "ghosted"]
    con_follow = sum(1 for p in agendados if (p.get("seguimientos") or 0) > 0)
    return {
        "desdeFollowUp": _tasa(con_follow, len(agendados)),
        "promedioHastaAgendar": _promedio([p.get("seguimientos") or 0 for p in agendados]),
        "intentosGhosteados": _promedio([p.get("seguimientos") or 0 for p in ghosteados]),
        "ghosteados": len(ghosteados),
    }


# ------------------------------------------------------------------ qué tan firmes son los números

def _intervalo(exitos: int, total: int, z: float = 1.96) -> list[float] | None:
    """Intervalo de Wilson: entre qué dos valores puede estar la tasa de verdad.

    Con pocos datos el intervalo se abre tanto que la tasa no dice nada, y eso es
    exactamente lo que hay que mostrar en vez de un porcentaje que parece firme.
    """
    if not total:
        return None
    p = exitos / total
    d = 1 + z * z / total
    centro = (p + z * z / (2 * total)) / d
    margen = z * ((p * (1 - p) / total + z * z / (4 * total * total)) ** 0.5) / d
    return [round(max(0.0, (centro - margen) * 100), 1), round(min(100.0, (centro + margen) * 100), 1)]


def _hacen_falta(p1: float, p2: float) -> int | None:
    """Cuántos resueltos por fuente harían falta para que esa diferencia sea afirmable."""
    dif = abs(p1 - p2)
    if dif < 0.01:
        return None
    return int(-(-(2.8 ** 2 * (p1 * (1 - p1) + p2 * (1 - p2)) / (dif * dif)) // 1))


TASAS = (("booking", "Booking Rate", "agendas", "pitchesResueltos"),
         ("show", "Show Rate", "shows", "llamadasResueltas"),
         ("close", "Close Rate", "cierres", "shows"))


def _confianza(org: dict, ads: dict) -> list[dict]:
    salida = []
    for clave, label, num, den in TASAS:
        a, b = _intervalo(org[num], org[den]), _intervalo(ads[num], ads[den])
        concluyente = bool(a and b) and (a[1] < b[0] or b[1] < a[0])
        necesarios = (_hacen_falta(org[num] / org[den], ads[num] / ads[den])
                      if org[den] and ads[den] else None)
        salida.append({"clave": clave, "label": label, "org": a, "ads": b,
                       "concluyente": concluyente, "necesarios": necesarios})
    return salida


def _calidad(leads: list[dict]) -> dict:
    """Las señales que distinguen un lead de una fuente del de la otra."""
    resueltos = [p for p in leads if p.get("pitchEstado") != "pendiente"]
    caidos = [p for p in resueltos if p.get("pitchEstado") in ("ghosted", "denied")]
    agendados = [p for p in leads if p.get("pitchEstado") == "booked"]
    cobrado = sum(float(p.get("cashUsd") or 0) for p in leads)
    return {
        "tasaCaida": _tasa(len(caidos), len(resueltos)),
        "followUps": _promedio([p.get("seguimientos") or 0 for p in agendados]),
        "cashPorPitch": round(cobrado / len(leads), 1) if leads else None,
        "diasAAgendar": _promedio([_dias(p.get("pitchAt"), p.get("agendoAt")) for p in agendados]),
    }


def _por_fuente(pitches: list[dict], desde, hasta, canal: str | None) -> dict:
    """La tabla de oportunidades: qué trajo cada fuente y qué hizo con eso el setter."""
    filas = {}
    for fuente in ORIGENES:
        leads, calls = _recorte([p for p in pitches if p.get("origen") == fuente], desde, hasta, canal)
        filas[fuente] = {**_bloque(leads, calls), **_calidad(leads)}
    leads, calls = _recorte(pitches, desde, hasta, canal)
    filas["total"] = _bloque(leads, calls)
    filas["confianza"] = _confianza(filas["organico"], filas["ads"])
    filas["sinFuente"] = sum(1 for p in leads if p.get("origen") not in ORIGENES)
    return filas


def _semanas_de(pitches: list[dict], hasta: date, cuantas: int = 6) -> list[dict]:
    """Las últimas semanas, cada una con sus pitches y lo que convirtieron."""
    lunes_final = _lunes(hasta)
    salida = []
    for i in range(cuantas - 1, -1, -1):
        lunes = lunes_final - timedelta(weeks=i)
        leads, calls = _recorte(pitches, lunes, lunes + timedelta(days=6))
        m = _bloque(leads, calls)
        salida.append({"semana": lunes.isoformat(), "etiqueta": f"{lunes.day:02d} {MESES[lunes.month - 1]}",
                       **{k: m[k] for k in ("pitches", "agendas", "shows", "cierres",
                                            "booking", "show", "close", "setting")}})
    return salida


def _lunes(d: date) -> date:
    return d - timedelta(days=d.weekday())


# `strftime("%b")` sale en inglés salvo que el server tenga el locale puesto, y no se
# puede depender de eso: la etiqueta de la semana se arma acá.
MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


# ------------------------------------------------------------------ lectura

def _alcance(usuario: dict) -> str | None:
    """De quién son los pitches que ve: el setter, los suyos; dirección, todos."""
    if usuario.get("rol") in ROLES_VEN_TODO:
        return None
    return usuario.get("username")


def listar(usuario: dict) -> list[dict]:
    from pony.orm import db_session

    from src.models import PitchSetting

    setter = _alcance(usuario)
    hoy = hoy_ar()
    with db_session:
        filas = [p for p in list(PitchSetting.select()) if p.borrado_at is None
                 and (setter is None or p.setter == setter)]
        return sorted((_derivados(_a_dict(p), hoy) for p in filas),
                      key=lambda p: (p["pitchAt"], p["id"]), reverse=True)


def metricas(usuario: dict, desde: str | None = None, hasta: str | None = None,
             canal: str | None = None) -> dict:
    """Todo lo que pinta la vista de un período, en una sola respuesta.

    Va junto y no en cinco endpoints porque son cinco lecturas de la misma tabla: partirlo
    haría cinco consultas para dibujar una pantalla.
    """
    pitches = listar(usuario)
    hoy = hoy_ar()
    canal = canal if canal in CANALES else None
    d, h = _fecha(desde), _fecha(hasta)
    leads, calls = _recorte(pitches, d, h, canal)
    m = _bloque(leads, calls)
    return {
        "hoy": hoy.isoformat(), "desde": desde, "hasta": hasta, "canal": canal,
        **m,
        "porCanal": {c: sum(1 for p in pitches if p.get("canal") == c and _en(p.get("pitchAt"), d, h))
                     for c in CANALES},
        "sinCanal": sum(1 for p in leads if p.get("canal") not in CANALES),
        "cash": _cash(leads),
        "velocidad": _velocidad(leads),
        "followUps": _follow_ups(leads),
        "dondeConviene": _donde_conviene(m),
        "fuentes": _por_fuente(pitches, d, h, canal),
        # La serie termina en la semana de hoy: las semanas que todavía no pasaron
        # solo agregan filas en cero que parecen una caída.
        "semanas": _semanas_de(pitches, min(h, hoy) if h else hoy),
        "total": len(pitches),
    }


# ------------------------------------------------------------------ escritura

def _limpiar(datos: dict, actual: dict | None = None) -> dict:
    """Valida lo que llega y lo deja listo para guardar. Lo que no viene, no se toca."""
    salida: dict = {}
    if "prospecto" in datos:
        nombre = str(datos.get("prospecto") or "").strip()
        if not nombre:
            raise ValueError("El pitch necesita a quién se le mandó el link.")
        salida["prospecto"] = nombre[:160]
    for campo, permitidos in (("canal", CANALES), ("origen", ORIGENES),
                              ("pitchEstado", PITCH_ESTADOS)):
        if campo in datos:
            v = str(datos.get(campo) or "").strip().lower()
            if v not in permitidos:
                raise ValueError(f"{campo} inválido: {v!r}.")
            salida[campo] = v
    if "llamadaEstado" in datos:
        v = str(datos.get("llamadaEstado") or "").strip().lower() or None
        if v is not None and v not in LLAMADA_ESTADOS:
            raise ValueError(f"llamadaEstado inválido: {v!r}.")
        salida["llamadaEstado"] = v
    for campo in ("pitchAt", "agendoAt", "llamadaAt", "reprogramadaAt", "cierreAt"):
        if campo in datos:
            v = datos.get(campo)
            if v in (None, ""):
                salida[campo] = None
            else:
                d = _fecha(v)
                if d is None:
                    raise ValueError(f"{campo} no es una fecha.")
                salida[campo] = d
    for campo in ("reprogramaciones", "seguimientos", "llamadas"):
        if campo in datos:
            salida[campo] = max(0, int(datos.get(campo) or 0))
    for campo in ("valorUsd", "cashUsd"):
        if campo in datos:
            salida[campo] = max(0.0, float(datos.get(campo) or 0))
    for campo in ("email", "telefono", "usuarioIg", "nota"):
        if campo in datos:
            salida[campo] = (str(datos.get(campo) or "").strip()[:2000] or None)

    # Coherencia entre estados: agendar sin fecha de agenda es hoy; cerrar sin fecha de
    # cierre es hoy; una llamada con resultado es un pitch que agendó.
    estado_pitch = salida.get("pitchEstado", (actual or {}).get("pitchEstado"))
    estado_llamada = salida.get("llamadaEstado", (actual or {}).get("llamadaEstado"))
    if estado_llamada and estado_pitch != "booked":
        salida["pitchEstado"] = "booked"
        estado_pitch = "booked"
    if estado_pitch == "booked" and not salida.get("agendoAt", (actual or {}).get("agendoAt")):
        salida["agendoAt"] = hoy_ar()
    if estado_pitch == "booked" and estado_llamada in (None, "") and "llamadaEstado" not in salida:
        salida["llamadaEstado"] = "scheduled"
    if estado_pitch != "booked" and "pitchEstado" in salida:
        # Volvió a ghosted/denied/pendiente: la llamada deja de existir.
        salida["llamadaEstado"] = None
    if estado_llamada == "closed" and not salida.get("cierreAt", (actual or {}).get("cierreAt")):
        salida["cierreAt"] = hoy_ar()
    return salida


_CAMPOS = {
    "prospecto": "prospecto", "canal": "canal", "origen": "origen", "pitchEstado": "pitch_estado",
    "llamadaEstado": "llamada_estado", "pitchAt": "pitch_at", "agendoAt": "agendo_at",
    "llamadaAt": "llamada_at", "reprogramadaAt": "reprogramada_at", "cierreAt": "cierre_at",
    "reprogramaciones": "reprogramaciones", "seguimientos": "seguimientos", "llamadas": "llamadas",
    "valorUsd": "valor_usd", "cashUsd": "cash_usd", "email": "email", "telefono": "telefono",
    "usuarioIg": "usuario_ig", "nota": "nota",
}


def crear(datos: dict, usuario: dict) -> dict:
    from pony.orm import db_session

    from src.models import PitchSetting

    limpio = _limpiar({"pitchAt": hoy_ar().isoformat(), "canal": "dm", "origen": "organico",
                       "pitchEstado": "pendiente", **datos})
    if limpio.get("pitchAt") is None:
        limpio["pitchAt"] = hoy_ar()
    with db_session:
        p = PitchSetting(
            setter=usuario.get("username"), actualizado_por=usuario.get("username"),
            externo_id=(str(datos.get("externoId") or "").strip() or None),
            **{_CAMPOS[k]: v for k, v in limpio.items()},
        )
        p.flush()
        return _derivados(_a_dict(p), hoy_ar())


def _propio(p, usuario: dict) -> bool:
    setter = _alcance(usuario)
    return setter is None or p.setter == setter


def actualizar(pitch_id: int, datos: dict, usuario: dict) -> dict:
    from pony.orm import db_session

    from src.models import PitchSetting

    with db_session:
        p = PitchSetting.get(id=pitch_id)
        if p is None or p.borrado_at is not None or not _propio(p, usuario):
            raise LookupError("Ese pitch no existe.")
        limpio = _limpiar(datos, _a_dict(p))
        for k, v in limpio.items():
            setattr(p, _CAMPOS[k], v)
        p.actualizado_at = datetime.utcnow()
        p.actualizado_por = usuario.get("username")
        p.flush()
        return _derivados(_a_dict(p), hoy_ar())


def borrar(pitch_id: int, usuario: dict) -> dict:
    from pony.orm import db_session

    from src.models import PitchSetting

    with db_session:
        p = PitchSetting.get(id=pitch_id)
        if p is None or p.borrado_at is not None or not _propio(p, usuario):
            raise LookupError("Ese pitch no existe.")
        p.borrado_at = datetime.utcnow()
        p.actualizado_por = usuario.get("username")
        return {"ok": True, "id": pitch_id}


def borrar_todo(usuario: dict) -> dict:
    """Esconde todos los pitches que ve el usuario. Se recuperan restaurando un respaldo."""
    from pony.orm import db_session

    from src.models import PitchSetting

    setter = _alcance(usuario)
    ahora = datetime.utcnow()
    with db_session:
        cuantos = 0
        for p in list(PitchSetting.select()):
            if p.borrado_at is None and (setter is None or p.setter == setter):
                p.borrado_at = ahora
                p.actualizado_por = usuario.get("username")
                cuantos += 1
    return {"ok": True, "borrados": cuantos}


# ------------------------------------------------------------------ respaldo

def exportar(usuario: dict) -> dict:
    """Todo lo del setter en un JSON: pitches y sesiones con transcripción y notas.

    El audio no viaja adentro —pesaría cientos de megas—: se baja aparte desde cada sesión.
    """
    from src.services import notas_services

    pitches = listar(usuario)
    return {
        "sistema": "atv-ops", "version": 1,
        "exportadoAt": datetime.utcnow().isoformat() + "Z",
        "por": usuario.get("username"),
        "pitches": pitches,
        # Con los nombres de SetSystem también, así el mismo archivo se abre allá.
        "leads": [a_setsystem(p) for p in pitches],
        "sesiones": notas_services.listar(usuario, completo=True),
    }


def importar(payload: dict, usuario: dict) -> dict:
    """Restaura un respaldo. Lo que ya existe se pisa; lo borrado vuelve.

    Acepta el respaldo de ATV Ops y también el de SetSystem (`cc-setsystem-*.json`), que
    es lo que Cris tiene guardado de antes.
    """
    from pony.orm import db_session

    from src.models import PitchSetting
    from src.services import notas_services

    if not isinstance(payload, dict):
        raise ValueError("El respaldo no tiene el formato esperado.")
    leads = payload.get("leads")
    if isinstance(leads, list) and "pitches" not in payload:
        pitches = [desde_setsystem(l) for l in leads if not l.get("deleted_at")]
    else:
        pitches = payload.get("pitches") or []
    if not isinstance(pitches, list):
        raise ValueError("El respaldo no trae pitches.")

    creados = actualizados = 0
    with db_session:
        existentes = {p.externo_id: p for p in list(PitchSetting.select()) if p.externo_id}
        por_id = {p.id: p for p in list(PitchSetting.select())}
        for fila in pitches:
            if not isinstance(fila, dict):
                continue
            externo = str(fila.get("externoId") or "").strip() or None
            limpio = _limpiar({k: v for k, v in fila.items() if k in _CAMPOS})
            if "pitchAt" not in limpio or limpio["pitchAt"] is None:
                continue
            p = existentes.get(externo) if externo else por_id.get(fila.get("id"))
            if p is not None and (_propio(p, usuario)):
                for k, v in limpio.items():
                    setattr(p, _CAMPOS[k], v)
                p.borrado_at = None
                p.actualizado_at = datetime.utcnow()
                p.actualizado_por = usuario.get("username")
                actualizados += 1
            else:
                nuevo = PitchSetting(setter=(fila.get("setter") if _alcance(usuario) is None and fila.get("setter")
                                             else usuario.get("username")),
                                     actualizado_por=usuario.get("username"), externo_id=externo,
                                     **{_CAMPOS[k]: v for k, v in limpio.items()})
                nuevo.flush()
                if externo:
                    existentes[externo] = nuevo
                creados += 1
    sesiones = notas_services.importar(payload.get("sesiones") or [], usuario)
    return {"ok": True, "pitches": {"creados": creados, "actualizados": actualizados}, "sesiones": sesiones}


def desde_setsystem(lead: dict) -> dict:
    """Un lead de SetSystem con los nombres de ATV Ops."""
    # SetSystem dice `pitched`; acá es `pendiente`. `rescheduled` es una llamada
    # todavía viva: queda `scheduled` y la fecha nueva va en reprogramadaAt.
    estado_pitch = lead.get("pitch_status") or "pendiente"
    if estado_pitch == "pitched":
        estado_pitch = "pendiente"
    estado_llamada = lead.get("call_status") or None
    if estado_llamada == "rescheduled":
        estado_llamada = "scheduled"
    return {
        "externoId": lead.get("id"), "prospecto": lead.get("name") or "Sin nombre",
        "pitchAt": lead.get("pitch_date"), "canal": lead.get("channel") or "dm",
        "origen": lead.get("source") or "organico",
        "pitchEstado": estado_pitch if estado_pitch in PITCH_ESTADOS else "pendiente",
        "agendoAt": lead.get("booked_on"), "llamadaAt": lead.get("booked_for"),
        "reprogramadaAt": lead.get("rescheduled_for"), "reprogramaciones": lead.get("reschedule_count") or 0,
        "llamadaEstado": estado_llamada, "cierreAt": lead.get("close_date"),
        "seguimientos": lead.get("follow_ups") or 0, "llamadas": lead.get("calls") or 0,
        "valorUsd": lead.get("deal_value") or 0, "cashUsd": lead.get("cash_collected") or 0,
        "email": lead.get("email"), "telefono": lead.get("number"),
        "usuarioIg": (lead.get("username") or "").lstrip("@") or None, "nota": lead.get("notes"),
    }


def a_setsystem(p: dict) -> dict:
    """Un pitch con los nombres de SetSystem, para que el respaldo se abra allá también."""
    return {
        "id": p.get("externoId") or f"atv-{p['id']}", "name": p["prospecto"], "pitch_date": p["pitchAt"],
        "booked_on": p.get("agendoAt"), "booked_for": p.get("llamadaAt"),
        "rescheduled_for": p.get("reprogramadaAt"), "reschedule_count": p.get("reprogramaciones") or 0,
        "pitch_status": p["pitchEstado"] if p["pitchEstado"] != "pendiente" else "ghosted",
        "call_status": p.get("llamadaEstado"), "close_date": p.get("cierreAt"),
        "follow_ups": p.get("seguimientos") or 0, "notes": p.get("nota") or "",
        "created_at": p.get("creadoAt"), "updated_at": p.get("actualizadoAt"), "deleted_at": None,
        "deal_value": p.get("valorUsd") or 0, "cash_collected": p.get("cashUsd") or 0,
        "calls": p.get("llamadas") or 0, "channel": p["canal"], "email": p.get("email"),
        "number": p.get("telefono"), "username": p.get("usuarioIg"), "source": p["origen"],
    }


def json_seguro(v) -> str:
    return json.dumps(v, ensure_ascii=False, default=str)
