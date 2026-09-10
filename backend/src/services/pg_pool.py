"""
Pool de conexiones a Postgres, compartido por las bases externas que ATV Ops lee.

Abrir una conexión nueva contra Neon cuesta cerca de medio segundo (TLS + handshake),
y una vista dispara nueve o diez consultas: casi todo el tiempo de espera era abrir y
cerrar conexiones, no correr las consultas. El pool las mantiene abiertas y las presta.

Una conexión que se rompió (Neon la cerró por inactividad, se cayó la red) se descarta
y se abre otra: nunca se devuelve al pool una conexión con error.
"""

from __future__ import annotations

import logging
import threading
from contextlib import contextmanager

logger = logging.getLogger("atv_ops.pg")

_pools: dict[str, object] = {}
_lock = threading.Lock()


def _pool_para(dsn: str, maximo: int):
    from psycopg2.pool import ThreadedConnectionPool

    with _lock:
        pool = _pools.get(dsn)
        if pool is None:
            pool = ThreadedConnectionPool(1, maximo, dsn, connect_timeout=10)
            _pools[dsn] = pool
        return pool


@contextmanager
def conexion(dsn: str, maximo: int = 4):
    """Presta una conexión del pool y la devuelve al terminar.

    Si la consulta falló por la conexión y no por el SQL, se cierra en vez de devolverla,
    así la próxima consulta abre una sana. Confirma la transacción al salir bien y la
    deshace si hubo error.
    """
    import psycopg2

    pool = _pool_para(dsn, maximo)
    cnx = pool.getconn()
    rota = False
    try:
        if cnx.closed:
            raise psycopg2.OperationalError("conexión cerrada")
        yield cnx
        cnx.commit()
    except psycopg2.OperationalError:
        rota = True
        raise
    except Exception:
        try:
            cnx.rollback()
        except Exception:  # noqa: BLE001
            rota = True
        raise
    finally:
        pool.putconn(cnx, close=rota)


def consultar(dsn: str, sql: str, params=None) -> list[dict]:
    """SELECT (o INSERT ... RETURNING) que devuelve filas como diccionarios.
    Si la conexión prestada estaba muerta, reintenta una vez con una nueva."""
    import psycopg2
    from psycopg2.extras import RealDictCursor

    for intento in (1, 2):
        try:
            with conexion(dsn) as cnx, cnx.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params or ())
                return [dict(f) for f in cur.fetchall()] if cur.description else []
        except psycopg2.OperationalError:
            if intento == 2:
                raise
            logger.info("Conexión caída al consultar; se reintenta con una nueva.")
    return []


def ejecutar(dsn: str, sql: str, params=None) -> int:
    """UPDATE / DELETE: devuelve cuántas filas tocó."""
    import psycopg2

    for intento in (1, 2):
        try:
            with conexion(dsn) as cnx, cnx.cursor() as cur:
                cur.execute(sql, params or ())
                return cur.rowcount
        except psycopg2.OperationalError:
            if intento == 2:
                raise
            logger.info("Conexión caída al escribir; se reintenta con una nueva.")
    return 0
