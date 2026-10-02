"""
El reporte mensual de setting: cómo le fue a Cris en el mes.

Tres bloques fijos, mismo molde que el de closing: las métricas del mes, el laboratorio
—de dónde salieron los pitches y cuáles convirtieron— y las conclusiones para el mes
que viene.

El embudo arranca en el chat. Los chats del mes salen de marketing —los reels y los
videos que alguien marcó como que suman chats— y de ahí en adelante son los pitches del
setter, que salen de `setting_services.listar()`, el mismo origen que su pantalla. Las cuentas del reporte se hacen acá sobre esa lista, con las mismas definiciones
de estado: lo que el reporte agrega es la lectura de embudo sobre un solo denominador —de
cien links mandados, cuántos agendaron y cuántos terminaron en venta—, que encadenando
tasas de bases distintas no se responde.

Qué pidió dirección y todavía no se puede sostener con la base, para que no se busque:

- **Tiempo de respuesta en WhatsApp.** No se guarda la hora de ningún mensaje.
- **Horarios de mayor engagement.** `pitch_at` es una fecha sin hora.
- **Avatares y objeciones del chat.** El pitch no tiene campo de avatar, y `nota` está
  vacía en todos los pitches de septiembre. El día que se carguen, este bloque los agrupa
  igual que el de closing agrupa los de Fathom.
- **La plata.** El pitch tiene un `cash_usd` que Cris carga en SetSystem, pero es la misma
  plata que Nick ya anota en cada llamada, y no coincide: en septiembre daba 19.851 contra
  28.500, porque Cris no registra las señas y los importes difieren venta por venta.
  Mostrar los dos convierte un cierre en dos cobros para quien junte los reportes, así que
  acá no va ninguno: el cash del mes sale del registro de llamadas y de ningún otro lado.
  Lo que este reporte sí responde es cuántos de los links mandados terminaron en venta.
"""

from __future__ import annotations

import json
import logging
from calendar import monthrange
from datetime import date, datetime, timedelta

from fastapi import HTTPException

from src.services import setting_services

logger = logging.getLogger("atv_ops.reportes_setting")

# Cómo salió el pitch, en el orden en que se lee: del mejor desenlace al peor.
ORDEN_PITCH = ("booked", "pendiente", "denied", "ghosted")
PITCH_TEXTO = {"booked": "Agendó", "pendiente": "Sin respuesta todavía",
               "denied": "Dijo que no", "ghosted": "Ghosteó"}

# Qué pasó con la llamada que salió del pitch.
ORDEN_LLAMADA = ("closed", "deposit", "showed", "scheduled", "no_show", "cancelled")
LLAMADA_TEXTO = {"closed": "Cerró", "deposit": "Dejó seña", "showed": "Se presentó",
                 "scheduled": "Todavía no pasó", "no_show": "No se presentó",
                 "cancelled": "Cancelada"}

CANAL_TEXTO = {"dm": "DM", "phone": "Teléfono", "hibrido": "Híbrido"}
ORIGEN_TEXTO = {"organico": "Orgánico", "ads": "Ads", "referido": "Referido",
                "outbound": "Outbound"}


def _periodo_valido(periodo: str) -> str:
    p = (periodo or "").strip()
    try:
        date.fromisoformat(f"{p}-01")
    except ValueError:
        raise HTTPException(status_code=400, detail="El período va como YYYY-MM.") from None
    return p


def _rango(periodo: str) -> tuple[str, str]:
    """El primero y el último día del mes, como los pide `setting_services`."""
    anio, mes = (int(x) for x in periodo.split("-"))
    return f"{periodo}-01", f"{periodo}-{monthrange(anio, mes)[1]:02d}"


def chats_del_mes(periodo: str) -> dict:
    """Los chats del mes, pedidos a quien ya sabe contarlos.

    No se recalculan acá. `conversaciones_services.chats()` es el único lugar que suma las
    tres puertas —respuestas a historias con CTA, reels y YouTube marcados a mano, y lo
    que entra por otro canal— y es el mismo número que muestran Marketing y el embudo de
    Ventas. Escribir una segunda cuenta era exactamente lo que pasó la primera vez: miré
    solo los reels y los videos, dejé afuera las historias, y el mes daba 507 en vez de
    2.715.
    """
    from calendar import monthrange

    from src.services import conversaciones_services

    anio, mes = (int(x) for x in periodo.split("-"))
    desde = date(anio, mes, 1)
    hasta = date(anio, mes, monthrange(anio, mes)[1]) + timedelta(days=1)
    try:
        d = conversaciones_services.chats(desde, hasta)
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron leer los chats del mes: %s", str(e)[:160])
        return {"total": 0, "partes": [], "hay": False}
    total = int(d.get("total") or 0)
    return {"total": total, "partes": d.get("partes") or [], "hay": total > 0}


def _tasa(parte: int, sobre: int) -> float | None:
    return round(parte * 100 / sobre, 1) if sobre else None


def _del_mes(pitches: list[dict], desde: str, hasta: str) -> list[dict]:
    """Los pitches que se mandaron en el mes.

    El corte es el día que se mandó el link, no el día de la llamada: la agenda es mérito
    del pitch que la trajo, aunque la call haya caído en el mes siguiente.
    """
    return [p for p in pitches if p.get("pitchAt") and desde <= p["pitchAt"] <= hasta]


def metricas(pitches: list[dict], chats: dict | None = None) -> dict:
    """El bloque 1: el mes en números.

    Se calcula todo acá sobre los pitches del mes, en vez de arrastrar el bloque entero
    que arma la pantalla del setter. Ese bloque trae, anidada, la plata que Cris carga en
    cada pitch —`cash`, `cashPorPitch`, el ticket por fuente— y el reporte no la muestra
    por lo que dice el encabezado del archivo. Esparcirlo era servirla igual, un nivel más
    abajo, donde nadie la ve hasta que alguien la lee de la respuesta.
    """
    total = len(pitches)
    agendas = sum(1 for p in pitches if p.get("pitchEstado") == "booked")
    cerraron = sum(1 for p in pitches if p.get("llamadaEstado") == "closed")
    senas = sum(1 for p in pitches if p.get("llamadaEstado") == "deposit")

    por_pitch: dict[str, int] = {}
    for p in pitches:
        e = p.get("pitchEstado") or "pendiente"
        por_pitch[e] = por_pitch.get(e, 0) + 1

    por_llamada: dict[str, int] = {}
    for p in pitches:
        e = p.get("llamadaEstado")
        if e:
            por_llamada[e] = por_llamada.get(e, 0) + 1

    def reparto(cuenta: dict[str, int], orden: tuple, textos: dict, sobre: int) -> list[dict]:
        return [{"clave": k, "estado": textos.get(k, k), "n": n,
                 "pct": round(n * 100 / sobre, 1) if sobre else 0}
                for k, n in sorted(cuenta.items(),
                                   key=lambda x: (orden.index(x[0]) if x[0] in orden else len(orden),
                                                  -x[1]))]

    chats = chats or {"total": 0, "hay": False}
    return {
        # El escalón que viene antes del setter: lo que el contenido trajo. Sin él el
        # embudo arranca en el pitch y la primera pregunta —de cada cien que escriben,
        # cuántos reciben el link— no se puede responder.
        "chatsDelMes": chats.get("total") or 0,
        # El reparto por puerta: un mes puede ser bueno por historias y malo por reels, y
        # eso es justamente la decisión que hay que tomar.
        "chatsPartes": chats.get("partes") or [],
        "hayChats": bool(chats.get("hay")),
        "chatAPitch": _tasa(total, chats.get("total") or 0) if chats.get("hay") else None,
        "pitchesDelMes": total,
        "agendasDelMes": agendas,
        "cerraronDelMes": cerraron,
        "senasDelMes": senas,
        # El embudo de punta a punta, contado sobre el mismo denominador: los links que
        # se mandaron. Es la pregunta de dirección —de cien pitches, cuántos terminan en
        # plata— y no se puede responder encadenando tasas de bases distintas.
        "pitchAAgenda": _tasa(agendas, total),
        "pitchACierre": _tasa(cerraron, total),
        "agendaACierre": _tasa(cerraron, agendas),
        "porPitch": reparto(por_pitch, ORDEN_PITCH, PITCH_TEXTO, total),
        "porLlamada": reparto(por_llamada, ORDEN_LLAMADA, LLAMADA_TEXTO,
                              sum(por_llamada.values())),
    }


def laboratorio(pitches: list[dict]) -> dict:
    """El bloque 2: de dónde salieron los pitches y cuáles convirtieron.

    Es el equivalente del laboratorio de closing, pero sale de los datos que el setter ya
    carga en cada pitch, no de una transcripción: no hace falta analizar nada a mano para
    que el bloque exista.
    """
    def agrupar(clave: str, textos: dict) -> list[dict]:
        grupos: dict[str, dict] = {}
        for p in pitches:
            v = (p.get(clave) or "").strip()
            if not v:
                continue
            g = grupos.setdefault(v, {"clave": v, "valor": textos.get(v, v), "n": 0,
                                      "agendas": 0, "cierres": 0})
            g["n"] += 1
            if p.get("pitchEstado") == "booked":
                g["agendas"] += 1
            if p.get("llamadaEstado") in ("closed", "deposit"):
                g["cierres"] += 1
        for g in grupos.values():
            g["tasaAgenda"] = _tasa(g["agendas"], g["n"])
            g["tasaCierre"] = _tasa(g["cierres"], g["n"])
            g["pct"] = _tasa(g["n"], len(pitches))
        return sorted(grupos.values(), key=lambda g: -g["n"])

    agendados = [p for p in pitches if p.get("pitchEstado") == "booked"]

    def dias(desde_c: str, hasta_c: str) -> float | None:
        vals = []
        for p in agendados:
            a, b = p.get(desde_c), p.get(hasta_c)
            if a and b:
                vals.append((date.fromisoformat(b) - date.fromisoformat(a)).days)
        return round(sum(vals) / len(vals), 1) if vals else None

    mismo_dia = sum(1 for p in agendados
                    if p.get("agendoAt") and p.get("pitchAt") == p["agendoAt"])

    return {
        "pitches": len(pitches),
        "porCanal": agrupar("canal", CANAL_TEXTO),
        "porOrigen": agrupar("origen", ORIGEN_TEXTO),
        "velocidad": {
            "pitchAAgenda": dias("pitchAt", "agendoAt"),
            "agendaALlamada": dias("agendoAt", "fechaLlamada"),
            "mismoDia": _tasa(mismo_dia, len(agendados)),
            "reprogramaciones": sum(int(p.get("reprogramaciones") or 0) for p in pitches),
            "seguimientos": sum(int(p.get("seguimientos") or 0) for p in pitches),
        },
        # Lo que todavía no se puede medir, dicho en la respuesta y no solo en el código:
        # la pantalla lo muestra para que nadie espere esos números de este reporte.
        "faltan": [
            "El total de chats abiertos del mes no vive en un solo lado, así que el embudo "
            "arranca en el pitch y no en el chat.",
            "No se guarda la hora de los mensajes: no hay tiempo de respuesta ni horarios "
            "de mayor movimiento.",
            "El pitch no tiene avatar ni objeción cargada, así que no hay con qué agrupar.",
        ],
    }


def armar(periodo: str, setter: str | None, usuario: dict) -> dict:
    """Todo lo que la pantalla necesita para el mes."""
    periodo = _periodo_valido(periodo)
    desde, hasta = _rango(periodo)
    todos = setting_services.listar(usuario)
    if setter:
        todos = [p for p in todos if (p.get("setter") or "").strip().lower() == setter.lower()]
    pitches = _del_mes(todos, desde, hasta)

    quienes = sorted({(p.get("setter") or "").strip() for p in todos if (p.get("setter") or "").strip()})
    return {
        "periodo": periodo,
        "setter": setter or (quienes[0] if len(quienes) == 1 else None),
        "settersDisponibles": quienes,
        "metricas": metricas(pitches, chats_del_mes(periodo)),
        "laboratorio": laboratorio(pitches),
        "pitches": sorted(pitches, key=lambda p: p.get("pitchAt") or "", reverse=True),
        "guardado": obtener(periodo),
    }


# ------------------------------------------------------------------ lo que se guarda

def obtener(periodo: str) -> dict | None:
    """El reporte ya cerrado de ese mes, si existe."""
    from pony.orm import db_session

    from src.models import ReporteSetting

    periodo = _periodo_valido(periodo)
    try:
        with db_session:
            r = ReporteSetting.get(periodo=periodo)
            if r is None:
                return None
            return {
                "periodo": r.periodo, "estado": r.estado,
                "datos": json.loads(r.datos or "{}"),
                "creadoPor": r.creado_por,
                "creadoAt": r.creado_at.isoformat() if r.creado_at else None,
                "actualizadoAt": r.actualizado_at.isoformat() if r.actualizado_at else None,
            }
    except Exception as e:  # noqa: BLE001
        logger.info("No se pudo leer el reporte de setting %s: %s", periodo, str(e)[:160])
        return None


def listar() -> list[dict]:
    """Los reportes armados, del más nuevo al más viejo."""
    from pony.orm import db_session

    from src.models import ReporteSetting

    def resumen(crudo: str | None) -> dict:
        try:
            d = json.loads(crudo or "{}")
        except (TypeError, ValueError):
            return {}
        m = d.get("metricas") or {}
        return {"pitches": m.get("pitchesDelMes"), "agendas": m.get("agendasDelMes"),
                "cierres": m.get("cerraronDelMes"), "pitchAAgenda": m.get("pitchAAgenda")}

    with db_session:
        return [{
            "periodo": r.periodo, "estado": r.estado, "setter": r.setter,
            "creadoPor": r.creado_por,
            "creadoAt": r.creado_at.isoformat() if r.creado_at else None,
            "actualizadoAt": r.actualizado_at.isoformat() if r.actualizado_at else None,
            **resumen(r.datos),
        } for r in sorted(ReporteSetting.select(), key=lambda r: r.periodo, reverse=True)]


def guardar(periodo: str, datos: dict, usuario: dict, setter: str | None = None,
            cerrar: bool = False) -> dict:
    """Guarda el reporte del mes, con sus conclusiones escritas a mano."""
    from pony.orm import db_session

    from src.models import ReporteSetting

    periodo = _periodo_valido(periodo)
    quien = (usuario or {}).get("username") or ""
    ahora = datetime.utcnow()
    crudo = json.dumps(datos or {}, ensure_ascii=False)

    with db_session:
        r = ReporteSetting.get(periodo=periodo)
        if r is None:
            r = ReporteSetting(periodo=periodo, datos=crudo, setter=(setter or "")[:80] or None,
                               creado_por=quien[:80], creado_at=ahora)
        else:
            r.datos = crudo
            if setter:
                r.setter = setter[:80]
        if cerrar:
            r.estado = "cerrado"
        r.actualizado_por = quien[:80]
        r.actualizado_at = ahora
    logger.info("Reporte de setting %s guardado por %s%s", periodo, quien,
                " (cerrado)" if cerrar else "")
    return obtener(periodo) or {}
