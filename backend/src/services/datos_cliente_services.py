"""
Datos del cliente que el sistema NO puede deducir del canal: objetivo, ICP,
contacto y la gente de su equipo. Los carga el CSM una vez y los corrige cuando cambian.

El contrato y los pagos (plan, precio, vencimiento, reembolsos) viven en ATV Clients:
acá no se duplican. Fase, score, riesgo y resultados los mantiene Claude en la ficha.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from pony.orm import db_session

from src.models import DatosCliente
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.datos_cliente")
version = 0
STAGES = ("pre_lanzamiento", "lanzando", "escalando")
TEXTO = ("objetivo", "nicho", "stage", "nombre_completo", "email", "whatsapp", "pais", "zona_horaria", "linkedin", "notas")
NUM = ("objetivo_monto_usd", "ticket_promedio_usd")
ENTERO = ("objetivo_plazo_dias",)
LARGO = {"notas": 2000, "objetivo": 300}


def _a_dict(d: DatosCliente) -> dict:
    return {
        "clienteId": d.cliente_id, "canalId": d.canal_id,
        "objetivo": d.objetivo or None, "objetivoMontoUsd": d.objetivo_monto_usd, "objetivoPlazoDias": d.objetivo_plazo_dias,
        "nicho": d.nicho or None, "ticketPromedioUsd": d.ticket_promedio_usd, "stage": d.stage or None,
        "nombreCompleto": d.nombre_completo or None, "email": d.email or None, "whatsapp": d.whatsapp or None,
        "pais": d.pais or None, "zonaHoraria": d.zona_horaria or None, "linkedin": d.linkedin or None,
        "equipo": json.loads(d.equipo or "[]"), "notas": d.notas or None,
        "actualizadoPor": d.actualizado_por or None,
        "actualizadoAt": d.actualizado_at.replace(tzinfo=timezone.utc).astimezone(AR_TZ).isoformat(),
        "completitud": _completitud(d),
    }


def _completitud(d: DatosCliente) -> int:
    campos = [d.objetivo, d.nicho, d.stage, d.nombre_completo, d.email, d.whatsapp, d.pais]
    return round(sum(1 for c in campos if c) / len(campos) * 100)


@db_session
def obtener(cliente_id: str) -> dict | None:
    d = DatosCliente.get(cliente_id=cliente_id)
    return _a_dict(d) if d else None


@db_session
def todos() -> dict[str, dict]:
    return {d.cliente_id: _a_dict(d) for d in DatosCliente.select()}


def guardar(cliente_id: str, canal_id: str, payload: dict, usuario: dict) -> dict:
    global version
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Datos inválidos.")
    campos: dict = {"canal_id": canal_id, "actualizado_at": datetime.utcnow(),
                    "actualizado_por": (usuario.get("nombre") or usuario.get("username") or "?")[:120]}
    for k in TEXTO:
        v = payload.get(_camel(k))
        campos[k] = str(v).strip()[: LARGO.get(k, 200)] if v not in (None, "") else ""
    if campos.get("stage") and campos["stage"] not in STAGES:
        campos["stage"] = ""
    for k in NUM:
        v = payload.get(_camel(k))
        try:
            campos[k] = float(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            campos[k] = None
    for k in ENTERO:
        v = payload.get(_camel(k))
        try:
            campos[k] = int(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            campos[k] = None
    equipo = []
    for m in (payload.get("equipo") or [])[:10]:
        if isinstance(m, dict) and str(m.get("nombre") or "").strip():
            equipo.append({"nombre": str(m["nombre"]).strip()[:120], "rol": str(m.get("rol") or "").strip()[:60],
                           "contacto": str(m.get("contacto") or "").strip()[:120]})
    campos["equipo"] = json.dumps(equipo, ensure_ascii=False)
    with db_session:
        d = DatosCliente.get(cliente_id=cliente_id)
        if d is None:
            d = DatosCliente(cliente_id=cliente_id, **{k: v for k, v in campos.items() if v is not None})
        else:
            for k, v in campos.items():
                setattr(d, k, v if v is not None else (None if k in NUM + ENTERO else ""))
        salida = _a_dict(d)
    version += 1
    logger.info("Datos de %s guardados por %s", cliente_id, campos["actualizado_por"])
    return salida


def _camel(k: str) -> str:
    partes = k.split("_")
    return partes[0] + "".join(p.capitalize() for p in partes[1:])


def para_prompt(cliente_id: str) -> str:
    """Una línea con lo que Claude necesita saber del cliente para leer su canal."""
    d = obtener(cliente_id)
    if not d:
        return ""
    partes = []
    if d["objetivo"]:
        partes.append(f"objetivo: {d['objetivo']}")
    if d["nicho"]:
        partes.append(f"nicho: {d['nicho']}")
    if d["ticketPromedioUsd"]:
        partes.append(f"ticket promedio de su oferta: {d['ticketPromedioUsd']:.0f} USD")
    if d["stage"]:
        partes.append(f"stage declarado: {d['stage']}")
    if d["equipo"]:
        partes.append("su equipo: " + ", ".join(f"{m['nombre']} ({m['rol'] or 'sin rol'})" for m in d["equipo"]))
    return " · ".join(partes)


def markdown(d: dict) -> str:
    lineas = ["## Datos del cliente", ""]
    if d.get("objetivo"):
        lineas.append(f"- **Objetivo**: {d['objetivo']}")
    icp = " · ".join(x for x in [d.get("nicho"), f"ticket {d['ticketPromedioUsd']:.0f} USD" if d.get("ticketPromedioUsd") else None, d.get("stage")] if x)
    if icp:
        lineas.append(f"- **ICP**: {icp}")
    contacto = " · ".join(x for x in [d.get("nombreCompleto"), d.get("email"), d.get("whatsapp"), d.get("pais"), d.get("zonaHoraria")] if x)
    if contacto:
        lineas.append(f"- **Contacto**: {contacto}")
    if d.get("linkedin"):
        lineas.append(f"- **LinkedIn**: {d['linkedin']}")
    if d.get("equipo"):
        lineas.append("- **Su equipo**: " + ", ".join(f"{m['nombre']} ({m['rol'] or 'sin rol'}{', ' + m['contacto'] if m.get('contacto') else ''})" for m in d["equipo"]))
    if d.get("notas"):
        lineas += ["", d["notas"]]
    return "\n".join(lineas) if len(lineas) > 2 else ""
