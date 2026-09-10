"""
Las credenciales de las plataformas que ATV Ops consulta.

Viven en la base de ATV Ops. La primera vez se copian desde la tabla `apiconnection` de
atv-mkt, que es donde las cargó el equipo, y a partir de ahí se leen de acá: así se
pueden construir cosas nuevas sin depender de que ese sistema siga en pie.

Si una credencial cambia (un token que vence), se vuelve a copiar con `refrescar=True`
o se actualiza a mano con `guardar()`.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime

logger = logging.getLogger("atv_ops.conexiones")

# Lo que se copia de atv-mkt. Lo demás de esa tabla no lo usa ATV Ops.
PLATAFORMAS = ("instagram", "manychat", "youtube", "meta_ads", "google_calendar")

_cache: dict = {}
_lock = threading.Lock()
CACHE_SEGUNDOS = 300


def _de_atv_mkt() -> dict[str, dict]:
    """Lee la tabla apiconnection de atv-mkt. Solo se usa para la copia inicial."""
    from src.services import crm_db

    salida: dict[str, dict] = {}
    try:
        filas = crm_db.consultar(
            "SELECT platform, credentials FROM apiconnection WHERE platform = ANY(%s) ORDER BY id",
            (list(PLATAFORMAS),),
        )
    except Exception as e:  # noqa: BLE001
        logger.info("No se pudo leer apiconnection de atv-mkt: %s", str(e)[:160])
        return salida
    for f in filas:
        cred = f["credentials"]
        if isinstance(cred, str):
            try:
                cred = json.loads(cred)
            except ValueError:
                continue
        if isinstance(cred, dict) and cred:
            # Si hay más de una fila por plataforma gana la que tenga más datos cargados.
            previa = salida.get(f["platform"])
            if previa is None or len(cred) > len(previa):
                salida[f["platform"]] = cred
    return salida


def sembrar(refrescar: bool = False, quien: str = "migración") -> list[str]:
    """Copia a ATV Ops las credenciales que todavía no tenga. Devuelve las que copió."""
    from pony.orm import db_session

    from src.models import ConexionApi

    copiadas = []
    try:
        origen = _de_atv_mkt()
        if not origen:
            return copiadas
        with db_session:
            for plataforma, cred in origen.items():
                fila = ConexionApi.get(plataforma=plataforma)
                if fila is not None and not refrescar:
                    continue
                if fila is None:
                    ConexionApi(plataforma=plataforma, credenciales=json.dumps(cred),
                                origen="atv-mkt", actualizado_por=quien)
                else:
                    fila.credenciales = json.dumps(cred)
                    fila.origen = "atv-mkt"
                    fila.actualizado_por = quien
                    fila.actualizado_at = datetime.utcnow()
                copiadas.append(plataforma)
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron copiar las credenciales: %s", str(e)[:200])
    if copiadas:
        logger.info("Credenciales copiadas de atv-mkt a ATV Ops: %s", ", ".join(copiadas))
        with _lock:
            _cache.clear()
    return copiadas


def obtener(plataforma: str) -> dict:
    """Las credenciales de una plataforma. La primera vez las copia de atv-mkt."""
    from pony.orm import db_session

    from src.models import ConexionApi

    with _lock:
        guardado = _cache.get(plataforma)
        if guardado and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]
    datos: dict = {}
    try:
        with db_session:
            fila = ConexionApi.get(plataforma=plataforma)
        if fila is None:
            sembrar()
            with db_session:
                fila = ConexionApi.get(plataforma=plataforma)
        if fila is not None:
            datos = json.loads(fila.credenciales or "{}")
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron leer las credenciales de %s: %s", plataforma, str(e)[:160])
    with _lock:
        _cache[plataforma] = {"at": datetime.utcnow(), "data": datos}
    return datos if isinstance(datos, dict) else {}


def guardar(plataforma: str, credenciales: dict, quien: str = "") -> None:
    """Actualiza una credencial a mano (por ejemplo, un token que venció)."""
    from pony.orm import db_session

    from src.models import ConexionApi

    with db_session:
        fila = ConexionApi.get(plataforma=plataforma)
        if fila is None:
            ConexionApi(plataforma=plataforma, credenciales=json.dumps(credenciales),
                        origen="ATV Ops", actualizado_por=quien[:80])
        else:
            fila.credenciales = json.dumps(credenciales)
            fila.origen = "ATV Ops"
            fila.actualizado_por = quien[:80]
            fila.actualizado_at = datetime.utcnow()
    with _lock:
        _cache.pop(plataforma, None)


def estado() -> list[dict]:
    """Qué credenciales tiene ATV Ops, sin mostrar ningún secreto."""
    from pony.orm import db_session, select

    from src.models import ConexionApi

    def _seguro(v) -> str:
        texto = str(v)
        return f"{len(texto)} caracteres" if len(texto) > 24 else texto

    try:
        with db_session:
            return [{
                "plataforma": c.plataforma,
                "origen": c.origen or "",
                "actualizadoAt": c.actualizado_at.isoformat() if c.actualizado_at else None,
                "campos": {k: _seguro(v) for k, v in json.loads(c.credenciales or "{}").items()
                           if not isinstance(v, (list, dict))},
            } for c in select(c for c in ConexionApi).order_by(ConexionApi.plataforma)]
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo leer el estado de las conexiones: %s", str(e)[:160])
        return []
