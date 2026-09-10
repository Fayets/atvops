"""
Acceso de solo lectura al CRM de ATV Marketing (atv-mkt).

Vive en otro proyecto de Neon, así que se conecta por DSN: `MKT_DSN` o, si no está,
el mismo `GCAL_CONEXION_DSN` que ya se usa para la conexión de Google Calendar.
Nunca escribe: ATV Ops solo lee para mostrar métricas.
"""

from __future__ import annotations

import logging

from decouple import config
from fastapi import HTTPException

from src.services import pg_pool

logger = logging.getLogger("atv_ops.crm")


def dsn() -> str:
    valor = (config("MKT_DSN", default="") or "").strip() or (config("GCAL_CONEXION_DSN", default="") or "").strip()
    if not valor:
        raise HTTPException(
            status_code=503,
            detail="No hay conexión al CRM de Marketing. Falta MKT_DSN (o GCAL_CONEXION_DSN) en el .env.",
        )
    return valor


def disponible() -> bool:
    try:
        dsn()
        return True
    except HTTPException:
        return False


def _traducir(e: Exception, que: str) -> HTTPException:
    return HTTPException(status_code=502, detail=f"{que}: {str(e)[:160]}")


def ejecutar(sql: str, params: tuple | dict | None = None) -> int:
    """UPDATE o DELETE en el CRM. Lo usan solo los scripts de limpieza: el sistema ya no
    le escribe nada al CRM viejo."""
    try:
        return pg_pool.ejecutar(dsn(), sql, params)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.warning("CRM escritura: %s", str(e)[:200])
        raise _traducir(e, "No se pudo escribir en el CRM") from e


def insertar(sql: str, params: tuple | dict | None = None) -> list[dict]:
    """INSERT con RETURNING. Queda por si un script lo necesita."""
    try:
        return pg_pool.consultar(dsn(), sql, params)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.warning("CRM escritura: %s", str(e)[:200])
        raise _traducir(e, "No se pudo escribir en el CRM") from e


def consultar(sql: str, params: tuple | dict | None = None) -> list[dict]:
    """Corre un SELECT y devuelve filas como diccionarios."""
    try:
        return pg_pool.consultar(dsn(), sql, params)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.warning("CRM: %s", str(e)[:200])
        raise _traducir(e, "No se pudo leer el CRM de Marketing") from e
