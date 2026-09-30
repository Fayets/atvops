"""
Acceso de solo lectura al esquema `clients` (ATV Clients: cartera y cuotas).

En el servidor vive en la misma base que ATV Ops, así que se consulta directo.
En desarrollo (SQLite) se puede apuntar con `CLIENTS_DSN`. Si no hay ninguna de las
dos, las vistas muestran cero en vez de inventar números.
"""

from __future__ import annotations

import logging

from decouple import config

logger = logging.getLogger("atv_ops.clients")

ESQUEMA = config("CLIENTS_SCHEMA", default="clients")


def _dsn() -> str:
    return (config("CLIENTS_DSN", default="") or "").strip()


def disponible() -> bool:
    from src.db import ES_POSTGRES

    return bool(_dsn()) or ES_POSTGRES


def consultar(sql: str, params: tuple | None = None) -> list[dict]:
    """SELECT sobre el esquema `clients`. Devuelve [] si la fuente no está disponible."""
    sql = sql.replace("{esquema}", ESQUEMA)
    dsn = _dsn()
    if dsn:
        try:
            from src.services import pg_pool

            return pg_pool.consultar(dsn, sql, params)
        except Exception as e:  # noqa: BLE001
            logger.info("Clients por DSN: %s", str(e)[:200])
            return []

    from pony.orm import db_session

    from src.db import ES_POSTGRES, db

    if not ES_POSTGRES:
        return []
    try:
        with db_session:
            cur = db.get_connection().cursor()
            cur.execute(sql, params or ())
            columnas = [c[0] for c in cur.description]
            return [dict(zip(columnas, fila)) for fila in cur.fetchall()]
    except Exception as e:  # noqa: BLE001
        logger.info("Clients: %s", str(e)[:200])
        return []


def ejecutar(sql: str, params: tuple | None = None) -> int:
    """INSERT/UPDATE sobre el esquema `clients`. Devuelve las filas tocadas.

    La lectura es la regla acá; escribir es la excepción y hoy la usa solo el reporte de
    producto, que deja la nota de cada cliente en `clients.observaciones`. Va por la
    misma conexión que `consultar` para no abrir un camino aparte: si la fuente no está,
    devuelve 0 en vez de hacer de cuenta que escribió.
    """
    sql = sql.replace("{esquema}", ESQUEMA)
    dsn = _dsn()
    if dsn:
        from src.services import pg_pool

        return pg_pool.ejecutar(dsn, sql, params)

    from pony.orm import db_session

    from src.db import ES_POSTGRES, db

    if not ES_POSTGRES:
        return 0
    with db_session:
        cur = db.get_connection().cursor()
        cur.execute(sql, params or ())
        return cur.rowcount or 0
