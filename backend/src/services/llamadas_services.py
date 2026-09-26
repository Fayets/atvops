"""
Las llamadas de ventas, como registro propio de ATV Ops.

Antes la llamada no existía: la vista la re-armaba en cada carga cruzando la tabla `lead`
del CRM de atv-mkt con los eventos de Google Calendar, apareándolos por nombre y por
cercanía en el tiempo. Ese cruce adivinaba, y adivinaba distinto según el día: por eso el
calendario duplicaba reuniones, salteaba números de agenda y hacía desaparecer resultados
cuando el sync de atv-mkt le cambiaba la fecha a un lead.

Ahora el cruce se resuelve UNA vez, al sincronizar, y lo que queda escrito es lo que se
muestra. La identidad de la llamada es el id del evento de Google Calendar; si no tiene,
`lead:<id del CRM>`; si se cargó a mano, el id con el que nació.

Lo que carga el equipo —resultado, programa, cash, nota— no se pisa nunca: el sync solo
completa lo que todavía está vacío.
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime, time, timedelta

from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.llamadas")

# Cada cuánto se sincroniza solo. El calendario cambia poco y cada corrida le pega a
# Google y al CRM: diez minutos alcanza para que una reunión nueva aparezca enseguida.
CADA_SEGUNDOS = 600
# Cuánto mira cada corrida: lo que ya pasó no se toca solo, pero una reprogramación
# puede mover una reunión de la semana pasada.
DIAS_ATRAS = 45
DIAS_ADELANTE = 90

_lock = threading.Lock()
_sincronizando = False


def _hora_local(v):
    if isinstance(v, datetime):
        return v.replace(tzinfo=None)
    return v


def _clave(fila: dict) -> str:
    """La identidad de la llamada, estable entre corridas."""
    evento = str(fila.get("eventoId") or "").strip()
    if evento:
        return evento
    ident = fila.get("id")
    if isinstance(ident, int):
        return f"lead:{ident}"
    return str(ident)


# Lo que el calendario sabe mejor que nadie y por eso manda siempre, incluso vacío: la
# reunión se movió, se le sacó el link, dejó de ser una segunda. El resto de la ficha solo
# se completa —ver el bucle de actualización—, porque su fuente ya no existe.
SIEMPRE_DEL_CALENDARIO = frozenset({"inicio_at", "segunda", "titulo", "url", "sincronizado_at"})


# ------------------------------------------------------------------ escritura

def sincronizar(desde: date | None = None, hasta: date | None = None) -> dict:
    """Trae las llamadas de las fuentes y las deja escritas en la base de ATV Ops.

    Se puede correr las veces que haga falta: cada llamada entra una sola vez, y lo que
    el equipo cargó acá queda como está.
    """
    from pony.orm import db_session

    from src.models import ReunionCrm
    from src.services import ventas_services as ventas

    hoy = datetime.now(AR_TZ).date()
    desde = desde or hoy - timedelta(days=DIAS_ATRAS)
    hasta = hasta or hoy + timedelta(days=DIAS_ADELANTE)

    filas = ventas._armar_desde_las_fuentes(desde, hasta)
    ahora = datetime.utcnow()
    nuevas = actualizadas = 0

    with db_session:
        todas = list(ReunionCrm.select())
        guardadas = {r.evento_id: r for r in todas}
        # La misma llamada puede haber entrado antes con otra clave: cargada a mano
        # ("ops:"/"manual:") o sin evento del calendario ("lead:"). Si después aparece su
        # evento de Google hay que reusar esa fila, no crear una segunda.
        sin_evento = {r.lead_id: r for r in todas
                      if r.lead_id and r.evento_id.startswith(("lead:", "ops:", "manual:"))}
        for f in filas:
            if f.get("duplicada"):
                continue
            clave = _clave(f)
            if not clave:
                continue
            lead = f["id"] if isinstance(f.get("id"), int) else 0
            fila = guardadas.get(clave) or (sin_evento.get(lead) if lead else None)
            ficha = {
                "prospecto": str(f.get("nombre") or "")[:200],
                "inicio_at": _hora_local(f.get("call")),
                "email": (f.get("email") or "")[:200] or None,
                "telefono": (f.get("telefono") or "")[:80] or None,
                "ig": (f.get("ig") or "")[:120] or None,
                "setter": (f.get("setter") or "")[:120] or None,
                "origen": (f.get("origen") or "")[:120] or None,
                "calificacion": (f.get("calificacion") or "")[:120] or None,
                "segunda": bool(f.get("segunda")),
                "titulo": (f.get("notas") or "")[:300] or None,
                "url": (f.get("url") or "")[:400] or None,
                "link_llamada": (f.get("link_llamada") or "")[:400] or None,
                "agendo_at": _hora_local(f.get("agendo")),
                "agendo_en": (f.get("agendo_en") or "")[:120] or None,
                "ingresos_rango": (f.get("ingresos_rango") or "")[:120] or None,
                "vino_de_ads": bool(f.get("vino_de_ads")),
                "lead_creado_at": _hora_local(f.get("created_at")),
                "sincronizado_at": ahora,
            }
            if fila is None:
                lead_id = lead
                fuente = ("crm" if lead_id and not f.get("eventoId")
                          else "manual" if str(f.get("id") or "").startswith("ops:") else "calendario")
                fila = ReunionCrm(
                    evento_id=clave, lead_id=lead_id, fuente=fuente,
                    # El resultado del CRM entra solo al crearla: después manda lo de acá.
                    resultado=(f.get("resultado") or "").strip(),
                    closer=(f.get("closer") or "").strip(),
                    programa=(f.get("programa_ofrecido") or "").strip(),
                    cash_usd=float(f.get("pago") or 0), saldo_usd=float(f.get("debe") or 0),
                    nota=(f.get("closer_report") or "").strip(),
                    **ficha,
                )
                guardadas[clave] = fila
                nuevas += 1
                continue

            # Ya existe: se actualiza la ficha, nunca lo que cargó el equipo.
            if fila.evento_id != clave and not clave.startswith(("lead:", "ops:", "manual:")):
                # Recién ahora se supo cuál es su evento en Google.
                fila.evento_id = clave
                guardadas[clave] = fila
                sin_evento.pop(lead, None)
            # Un dato que ya está no se reemplaza por uno vacío. Mientras la ficha venía
            # del CRM esto daba igual —cada corrida traía todo de nuevo—, pero el
            # calendario no sabe el origen ni la facturación: pisar con vacío borraba lo
            # que el CRM había dejado y las agendas de Ads aparecían como orgánicas.
            for campo, valor in ficha.items():
                if campo in SIEMPRE_DEL_CALENDARIO or valor not in (None, "", 0, False):
                    setattr(fila, campo, valor)
            if not fila.lead_id and lead:
                # Recién ahora se supo a qué llamada del CRM corresponde.
                fila.lead_id = lead
            if not (fila.resultado or "").strip() and (f.get("resultado") or "").strip():
                fila.resultado = f["resultado"].strip()
            if not (fila.closer or "").strip() and (f.get("closer") or "").strip():
                fila.closer = f["closer"].strip()
            actualizadas += 1

    logger.info("Llamadas sincronizadas del %s al %s: %s nuevas, %s actualizadas",
                desde, hasta, nuevas, actualizadas)
    return {"desde": desde.isoformat(), "hasta": hasta.isoformat(),
            "nuevas": nuevas, "actualizadas": actualizadas, "total": len(filas)}


# ------------------------------------------------------------------ lectura

def cuando(r):
    """Cuándo cuenta la llamada: la fecha a la que se movió, o la del calendario.

    Es el único lugar que lo decide. Todo lo que muestra o cuenta llamadas pasa por acá
    —el calendario, el embudo, la tabla semanal, las métricas del mes—, así que mover una
    llamada la mueve en todos lados a la vez y no hay forma de que dos vistas discrepen.
    """
    return r.movida_at or r.inicio_at


def _a_dict(r) -> dict:
    """La llamada con el mismo shape que antes armaba el cruce en vivo."""
    if r.lead_id:
        ident = r.lead_id
    elif r.fuente == "manual" or r.evento_id.startswith("ops:"):
        ident = f"ops:{r.id}"
    else:
        ident = f"cal:{r.evento_id}"
    resultado = (r.resultado or "").strip().lower()
    return {
        "id": ident,
        "nombre": r.prospecto or "Sin nombre",
        "email": r.email or "", "telefono": r.telefono or "", "ig": r.ig or "",
        "origen": r.origen or "", "closer": (r.closer or "").strip(), "setter": r.setter or "",
        "call": cuando(r), "agendo": r.agendo_at, "agendo_en": r.agendo_en or "",
        # Para que la tarjeta pueda decir que no está donde la puso el calendario.
        "movida": bool(r.movida_at),
        "fechaOriginal": r.inicio_at,
        "pago": r.cash_usd or 0.0, "debe": r.saldo_usd or 0.0,
        "ingresos_rango": r.ingresos_rango or "", "programa_ofrecido": (r.programa or "").strip(),
        "vino_de_ads": bool(r.vino_de_ads), "notas": r.titulo or "",
        "created_at": r.lead_creado_at, "closer_report": (r.nota or "").strip(),
        "link_llamada": r.link_llamada or "",
        "resultado": "descartada" if r.descartada else resultado,
        "calificacion": (r.calificacion or "").strip().lower(),
        "eventoId": r.evento_id if not r.evento_id.startswith(("lead:", "ops:")) else "",
        "segunda": bool(r.segunda), "url": r.url,
        # Sigue significando lo mismo: la reunión está en el calendario y nadie cargó
        # todavía qué pasó con ella.
        "soloCalendario": bool(r.fuente == "calendario" and not r.lead_id and not resultado),
    }


def listar(desde: date, hasta: date) -> list[dict]:
    """Las llamadas del período, de la base de ATV Ops."""
    from pony.orm import db_session

    from src.models import ReunionCrm

    inicio, fin = datetime.combine(desde, time.min), datetime.combine(hasta, time.min)
    with db_session:
        # Se filtra por la fecha efectiva: si no, una llamada movida a este mes se
        # seguiría buscando en el anterior y no aparecería en ninguno de los dos.
        return [_a_dict(r) for r in list(ReunionCrm.select())
                if r.es_venta and cuando(r) is not None and inicio <= cuando(r) < fin]


def hay_datos() -> bool:
    """Si todavía no se sincronizó nunca, la vista sigue armando en vivo."""
    from pony.orm import db_session

    from src.models import ReunionCrm

    try:
        with db_session:
            return any(r.sincronizado_at is not None for r in list(ReunionCrm.select()))
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo leer el estado de las llamadas: %s", str(e)[:160])
        return False


# ------------------------------------------------------------------ el reloj

def iniciar_scheduler(stop: threading.Event) -> None:
    """Sincroniza al arrancar y cada diez minutos."""
    global _sincronizando

    while not stop.is_set():
        try:
            with _lock:
                if _sincronizando:
                    stop.wait(CADA_SEGUNDOS)
                    continue
                _sincronizando = True
            try:
                sincronizar()
            finally:
                with _lock:
                    _sincronizando = False
        except Exception as e:  # noqa: BLE001
            logger.warning("No se pudieron sincronizar las llamadas: %s", str(e)[:200])
        stop.wait(CADA_SEGUNDOS)
