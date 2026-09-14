"""
Las metas del mes, en la base de ATV Ops.

Las decreta dirección y valen para todo el equipo: el closer mira su close rate contra la
misma meta que ve Franco. Antes vivían en el navegador de quien las cargaba, así que el
resto del equipo miraba sus números contra metas vacías.

Un mes que ya pasó no se toca: cambiarle la meta después es reescribir con qué vara se
midió al equipo.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

logger = logging.getLogger("atv_ops.metas")

ROLES_DECRETAN = {"admin", "operaciones", "founder"}


def _mes_actual() -> str:
    from src.services.transcripts_services import AR_TZ

    return datetime.now(AR_TZ).strftime("%Y-%m")


def listar() -> dict[str, dict]:
    """Todos los decretos, por mes. Es lo que el tablero carga al arrancar."""
    from pony.orm import db_session

    from src.models import DecretoMes

    try:
        with db_session:
            salida = {}
            for d in list(DecretoMes.select()):
                try:
                    salida[d.mes] = {**json.loads(d.valores or "{}"), "mes": d.mes,
                                     "creadoPor": d.actualizado_por or "Dirección",
                                     "creadoAt": d.actualizado_at.isoformat()}
                except ValueError:
                    continue
            return salida
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron leer los decretos: %s", str(e)[:160])
        return {}


def guardar(mes: str, decreto: dict, usuario: dict) -> dict:
    """Decreta las metas de un mes. Solo dirección, y solo de este mes en adelante."""
    from fastapi import HTTPException
    from pony.orm import db_session

    from src.models import DecretoMes

    if usuario.get("rol") not in ROLES_DECRETAN:
        raise HTTPException(status_code=403, detail="Las metas las decreta dirección.")
    mes = str(mes or "").strip()
    if len(mes) != 7 or mes[4] != "-":
        raise HTTPException(status_code=400, detail="El mes tiene que ser YYYY-MM.")
    if mes < _mes_actual():
        raise HTTPException(
            status_code=400,
            detail=f"{mes} ya pasó: cambiarle la meta sería reescribir con qué vara se midió al equipo.")

    limpio = {k: v for k, v in (decreto or {}).items() if k not in ("mes", "creadoAt", "creadoPor")}
    quien = (usuario.get("nombre") or usuario.get("username") or "")[:80]
    with db_session:
        fila = DecretoMes.get(mes=mes)
        if fila is None:
            fila = DecretoMes(mes=mes, valores=json.dumps(limpio), actualizado_por=quien)
        else:
            fila.valores = json.dumps(limpio)
            fila.actualizado_por = quien
            fila.actualizado_at = datetime.utcnow()
    return {**limpio, "mes": mes, "creadoPor": quien}
