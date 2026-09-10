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


def ejecutar(sql: str, params: tuple | dict | None = None) -> int:
    """Guarda en el CRM lo que el equipo carga desde Ops: el resultado de una llamada
    y el catálogo de programas. El resto del acceso es de solo lectura."""
    try:
        import psycopg2
    except ImportError as e:
        raise HTTPException(status_code=503, detail="Falta psycopg2 en el servidor.") from e
    try:
        with psycopg2.connect(dsn(), connect_timeout=10) as cnx, cnx.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.rowcount
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.warning("CRM escritura: %s", str(e)[:200])
        raise HTTPException(status_code=502, detail=f"No se pudo escribir en el CRM: {str(e)[:160]}") from e


def insertar(sql: str, params: tuple | dict | None = None) -> list[dict]:
    """Corre un INSERT con RETURNING y devuelve lo que la base contesta.
    Se usa para crear en el CRM la reunión que solo existía en el calendario."""
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError as e:
        raise HTTPException(status_code=503, detail="Falta psycopg2 en el servidor.") from e
    try:
        with psycopg2.connect(dsn(), connect_timeout=10) as cnx, cnx.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            filas = [dict(f) for f in cur.fetchall()]
        return filas
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.warning("CRM escritura: %s", str(e)[:200])
        raise HTTPException(status_code=502, detail=f"No se pudo escribir en el CRM: {str(e)[:160]}") from e


def consultar(sql: str, params: tuple | dict | None = None) -> list[dict]:
    """Corre un SELECT y devuelve filas como diccionarios."""
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError as e:
        raise HTTPException(status_code=503, detail="Falta psycopg2 en el servidor.") from e
    try:
        with psycopg2.connect(dsn(), connect_timeout=10) as cnx, cnx.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return [dict(f) for f in cur.fetchall()]
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.warning("CRM: %s", str(e)[:200])
        raise HTTPException(status_code=502, detail=f"No se pudo leer el CRM de Marketing: {str(e)[:160]}") from e
