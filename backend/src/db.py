"""
Base de datos de ATV Ops.

- Local: SQLite en disco (DB_PROVIDER=sqlite), cero configuración.
- Server: Postgres con esquema propio dentro de la base compartida del
  ecosistema ATV (DB_PROVIDER=postgres, DB_SCHEMA=ops). Misma convención que
  ecosystem / hiring / clients: una base, un esquema por sistema.
"""

from pathlib import Path
import sqlite3

from decouple import config
from pony.orm import Database

db = Database()

_BACKEND_ROOT = Path(__file__).resolve().parent.parent

DB_PROVIDER = (config("DB_PROVIDER", default="sqlite") or "sqlite").lower().strip()
ES_POSTGRES = DB_PROVIDER in {"postgres", "postgresql"}
DB_SCHEMA = (config("DB_SCHEMA", default="ops") or "ops").strip()


def _bind_sqlite() -> None:
    filename = config("DB_FILENAME", default="data/atv_ops.db")
    if filename in {":memory:", ":sharedmemory:"}:
        db.bind(provider="sqlite", filename=filename, create_db=True)
        return

    path = Path(filename)
    if not path.is_absolute():
        path = _BACKEND_ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    sqlite3.connect(path).close()

    db.bind(provider="sqlite", filename=str(path), create_db=True)


def _postgres_kwargs() -> dict:
    """Credenciales Postgres. Acepta DB_PASS (convención ecosystem) o DB_PASSWORD."""
    kw = dict(
        user=config("DB_USER"),
        password=config("DB_PASS", default="") or config("DB_PASSWORD"),
        host=config("DB_HOST", default="localhost"),
        port=config("DB_PORT", default="5432", cast=int),
        database=config("DB_NAME"),
    )
    sslmode = (config("DB_SSLMODE", default="") or "").strip()
    if sslmode:
        kw["sslmode"] = sslmode
    return kw


def _ensure_schema() -> None:
    """El esquema tiene que existir antes de que Pony cree las tablas adentro."""
    import psycopg2

    kw = _postgres_kwargs()
    conn = psycopg2.connect(
        user=kw["user"],
        password=kw["password"],
        host=kw["host"],
        port=kw["port"],
        dbname=kw["database"],
        **({"sslmode": kw["sslmode"]} if "sslmode" in kw else {}),
    )
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{DB_SCHEMA}"')
    finally:
        conn.close()


def _bind_postgres() -> None:
    _ensure_schema()
    db.bind(provider="postgres", **_postgres_kwargs())


def init_db() -> None:
    import src.models  # noqa: F401 — registra entidades en `db`
    # Migraciones SQLite ligeras ANTES de generate_mapping (Pony check_tables).
    from src.services.auth_services import (ensure_idea_usuario_column, ensure_reunion_crm_columns,
                                            ensure_reunion_usuario_column, ensure_usuario_rol_column)

    if ES_POSTGRES:
        _bind_postgres()
    else:
        _bind_sqlite()

    ensure_usuario_rol_column()
    ensure_reunion_usuario_column()
    ensure_idea_usuario_column()
    ensure_reunion_crm_columns()

    if db.entities:
        db.generate_mapping(create_tables=True)
