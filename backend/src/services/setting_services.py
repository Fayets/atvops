"""
El registro de pitches del setter y lo que sale de él.

Es lo que Cris llevaba en SetSystem, adentro de ATV Ops. Cada fila es un link de agenda
enviado; de ahí se desprende todo lo demás: si agendó, si vino, si cerró, cuánto entró.

Las cuentas viven en funciones puras sobre diccionarios (`_metricas_de`, `_semanas_de`)
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
# Lo que ya se resolvió: la llamada pasó y se sabe qué fue.
RESUELTOS = SHOW | {"no_show", "cancelled"}

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
    agendado = p.get("pitchEstado") == "booked"
    ocurrida = agendado and cuando is not None and cuando <= hoy
    por_ocurrir = agendado and (estado in (None, "", "scheduled")) and cuando is not None and cuando > hoy
    return {
        **p,
        "fechaLlamada": cuando.isoformat() if cuando else None,
        "porOcurrir": bool(por_ocurrir),
        # Pasó la fecha y nadie dijo qué fue: eso es lo que hay que resolver.
        "sinResolver": bool(ocurrida and estado not in RESUELTOS),
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

def _en_periodo(p: dict, desde: date | None, hasta: date | None) -> bool:
    d = _fecha(p.get("pitchAt"))
    if d is None:
        return False
    if desde and d < desde:
        return False
    if hasta and d > hasta:
        return False
    return True


def _metricas_de(pitches: list[dict], hoy: date, desde: date | None = None,
                 hasta: date | None = None, canal: str | None = None) -> dict:
    """Las cuatro tasas y el embudo, sobre los pitches del período.

    El período recorta por la fecha del pitch: el embudo sigue a esos leads a donde
    hayan llegado, aunque la llamada caiga en otro mes. Es como lo mide SetSystem y es lo
    que hace comparable un mes con otro.

    El show rate se calcula sobre las llamadas que ya pasaron. Dividir por las que están
    por ocurrir da un rojo falso al principio de cada semana.
    """
    filas = [p for p in pitches if _en_periodo(p, desde, hasta) and (not canal or p.get("canal") == canal)]
    filas = [_derivados(p, hoy) for p in filas]

    agendas = [p for p in filas if p["pitchEstado"] == "booked"]
    por_ocurrir = [p for p in agendas if p["porOcurrir"]]
    ocurridas = [p for p in agendas if not p["porOcurrir"]]
    shows = [p for p in filas if p["show"]]
    cierres = [p for p in filas if p["llamadaEstado"] == "closed"]
    depositos = [p for p in filas if p["llamadaEstado"] == "deposit"]

    n_p, n_a, n_o, n_s, n_c = len(filas), len(agendas), len(ocurridas), len(shows), len(cierres)
    booking, show, close, setting = _tasa(n_a, n_p), _tasa(n_s, n_o), _tasa(n_c, n_s), _tasa(n_c, n_p)

    # Dónde conviene trabajar: cuántos se pierden en cada paso y cuántos cierres más
    # saldrían si esa tasa subiera diez puntos, dejando las otras como están.
    show_f = (n_s / n_o) if n_o else 0.0
    close_f = (n_c / n_s) if n_s else 0.0
    etapas = [
        {"id": "booking", "etapa": "Pitch → Agenda", "tasa": booking, "perdidos": n_p - n_a,
         "masDiez": round(n_p * 0.10 * show_f * close_f, 1) if n_p else 0},
        {"id": "show", "etapa": "Agenda → Show", "tasa": show, "perdidos": n_o - n_s,
         "masDiez": round(n_o * 0.10 * close_f, 1) if n_o else 0},
        {"id": "close", "etapa": "Show → Cierre", "tasa": close, "perdidos": n_s - n_c,
         "masDiez": round(n_s * 0.10, 1) if n_s else 0},
    ]
    for e in etapas:
        r = RANGOS[e["id"]]
        e["brecha"] = round(r["verde"] - e["tasa"], 1) if e["tasa"] is not None else None
        e["zona"] = (None if e["tasa"] is None else "ok" if e["tasa"] >= r["verde"]
                     else "warn" if e["tasa"] >= r["amarillo"] else "alert")
    con_brecha = [e for e in etapas if e["brecha"] is not None and e["brecha"] > 0]
    peor = max(con_brecha, key=lambda e: e["brecha"])["id"] if con_brecha else None

    return {
        "pitches": n_p, "agendas": n_a, "shows": n_s, "cierres": n_c,
        "depositos": len(depositos), "porOcurrir": len(por_ocurrir), "ocurridas": n_o,
        "sinResolver": sum(1 for p in filas if p["sinResolver"]),
        "booking": booking, "show": show, "close": close, "setting": setting,
        "cashUsd": round(sum(float(p.get("cashUsd") or 0) for p in filas), 2),
        "valorUsd": round(sum(float(p.get("valorUsd") or 0) for p in filas), 2),
        "porCanal": {c: sum(1 for p in filas if p["canal"] == c) for c in CANALES},
        "porOrigen": {o: sum(1 for p in filas if p["origen"] == o) for o in ORIGENES},
        "dondeConviene": etapas, "peorEtapa": peor,
    }


def _lunes(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _semanas_de(pitches: list[dict], hoy: date, cuantas: int = 6, canal: str | None = None) -> list[dict]:
    """Las últimas semanas, cada una con sus pitches y lo que convirtieron."""
    lunes_final = _lunes(hoy)
    salida = []
    for i in range(cuantas - 1, -1, -1):
        lunes = lunes_final - timedelta(weeks=i)
        m = _metricas_de(pitches, hoy, lunes, lunes + timedelta(days=6), canal)
        salida.append({
            "semana": lunes.isoformat(), "etiqueta": lunes.strftime("%d %b").lower(),
            "pitches": m["pitches"], "agendas": m["agendas"], "shows": m["shows"], "cierres": m["cierres"],
            "booking": m["booking"], "show": m["show"], "close": m["close"], "setting": m["setting"],
        })
    return salida


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
    pitches = listar(usuario)
    hoy = hoy_ar()
    canal = canal if canal in CANALES else None
    return {
        "hoy": hoy.isoformat(),
        "desde": desde, "hasta": hasta, "canal": canal,
        **_metricas_de(pitches, hoy, _fecha(desde), _fecha(hasta), canal),
        "semanas": _semanas_de(pitches, hoy, canal=canal),
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
    estado_pitch = lead.get("pitch_status") or "pendiente"
    return {
        "externoId": lead.get("id"), "prospecto": lead.get("name") or "Sin nombre",
        "pitchAt": lead.get("pitch_date"), "canal": lead.get("channel") or "dm",
        "origen": lead.get("source") or "organico",
        "pitchEstado": estado_pitch if estado_pitch in PITCH_ESTADOS else "pendiente",
        "agendoAt": lead.get("booked_on"), "llamadaAt": lead.get("booked_for"),
        "reprogramadaAt": lead.get("rescheduled_for"), "reprogramaciones": lead.get("reschedule_count") or 0,
        "llamadaEstado": lead.get("call_status"), "cierreAt": lead.get("close_date"),
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
