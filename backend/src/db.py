from pathlib import Path
import sqlite3

from decouple import config
from pony.orm import Database

db = Database()

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


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

    db.bind(
        provider="sqlite",
        filename=str(path),
        create_db=True,
    )


def _bind_postgres() -> None:
    db.bind(
        provider="postgres",
        user=config("DB_USER"),
        password=config("DB_PASSWORD"),
        host=config("DB_HOST", default="localhost"),
        port=config("DB_PORT", default="5432", cast=int),
        database=config("DB_NAME"),
    )


def init_db() -> None:
    import src.models  # noqa: F401 — registra entidades en `db`
    # Migraciones SQLite ligeras ANTES de generate_mapping (Pony check_tables).
    from src.services.auth_services import ensure_reunion_usuario_column, ensure_usuario_rol_column

    provider = config("DB_PROVIDER", default="sqlite")
    if provider == "postgres":
        _bind_postgres()
    else:
        _bind_sqlite()

    ensure_usuario_rol_column()
    ensure_reunion_usuario_column()

    if db.entities:
        db.generate_mapping(create_tables=True)
