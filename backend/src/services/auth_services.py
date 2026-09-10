from __future__ import annotations

import hashlib
import logging
import secrets
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import _BACKEND_ROOT
from src.models import Usuario

_PBKDF2_ROUNDS = 120_000
# Sesiones validadas en memoria por este tiempo antes de volver a consultar la base.
_CACHE_SESION_SEGUNDOS = 300
_CACHE_SESION: dict[int, tuple[float, dict]] = {}
_TOKEN_DIAS = 7
_LOCAL_USERNAME = "franco"
_LOCAL_PASSWORD = "franco"
_LOCAL_NOMBRE = "Franco"
_LOCAL_ROL = "admin"

# Usuarios sembrados al arrancar: (username, variable de entorno con la clave,
# clave de desarrollo, nombre, rol). En SQLite local vale la clave de desarrollo;
# en Postgres (server) la clave TIENE que venir del .env, si no el usuario no se crea.
_USUARIOS_SEMILLA = (
    (_LOCAL_USERNAME, "SEED_FRANCO_PASSWORD", _LOCAL_PASSWORD, _LOCAL_NOMBRE, _LOCAL_ROL),
    ("mauri", "SEED_MAURI_PASSWORD", "mauri", "Mauri", "csm"),  # CSM: clientes y fulfillment
    ("lucas", "SEED_LUCAS_PASSWORD", "lucas", "Lucas", "ventas"),  # Director de Ventas
    ("nick", "SEED_NICK_PASSWORD", "nick", "Nick", "closer"),  # Closer: Mi día
    ("cris", "SEED_CRIS_PASSWORD", "cris", "Cris", "setter"),  # Setter: Mi progreso
    ("emi", "SEED_EMI_PASSWORD", "emi", "Emi", "marketing"),  # Director de Marketing
)


def _password_semilla(env_var: str, dev_default: str) -> str | None:
    from src.db import ES_POSTGRES

    valor = (config(env_var, default="") or "").strip()
    if valor:
        return valor
    return None if ES_POSTGRES else dev_default

ROLES_VALIDOS = frozenset({
    "closer",
    "setter",
    "csm",
    "operaciones",
    "ventas",
    "marketing",
    "founder",
    "admin",
})


def _secret() -> str:
    return config("SECRET_KEY", default="atv-ops-local-dev")


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _PBKDF2_ROUNDS,
    )
    return f"{salt}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _PBKDF2_ROUNDS,
    )
    return secrets.compare_digest(check.hex(), digest)


def _to_response(usuario: Usuario) -> dict:
    rol = getattr(usuario, "rol", None) or "operaciones"
    if rol not in ROLES_VALIDOS:
        rol = "operaciones"
    return {
        "id": usuario.id,
        "username": usuario.username,
        "nombre": usuario.nombre,
        "rol": rol,
    }


def ensure_usuario_rol_column() -> None:
    """SQLite ya creado sin `rol`: agrega la columna sin romper la DB local."""
    provider = config("DB_PROVIDER", default="sqlite")
    if provider != "sqlite":
        return
    filename = config("DB_FILENAME", default="data/atv_ops.db")
    if filename in {":memory:", ":sharedmemory:"}:
        return
    path = Path(filename)
    if not path.is_absolute():
        path = _BACKEND_ROOT / path
    if not path.exists():
        return
    con = sqlite3.connect(path)
    try:
        cols = {row[1] for row in con.execute("PRAGMA table_info(Usuario)")}
        if "rol" not in cols:
            con.execute(
                "ALTER TABLE Usuario ADD COLUMN rol TEXT NOT NULL DEFAULT 'operaciones'"
            )
            con.execute(
                "UPDATE Usuario SET rol = ? WHERE username = ?",
                (_LOCAL_ROL, _LOCAL_USERNAME),
            )
            con.commit()
    finally:
        con.close()


def ensure_reunion_usuario_column() -> None:
    """SQLite ya creado sin `Reunion.usuario`: agrega la columna y asigna las
    reuniones huérfanas al usuario local (Franco) para no perder nada."""
    provider = config("DB_PROVIDER", default="sqlite")
    if provider != "sqlite":
        return
    filename = config("DB_FILENAME", default="data/atv_ops.db")
    if filename in {":memory:", ":sharedmemory:"}:
        return
    path = Path(filename)
    if not path.is_absolute():
        path = _BACKEND_ROOT / path
    if not path.exists():
        return
    con = sqlite3.connect(path)
    try:
        tablas = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "Reunion" not in tablas:
            return
        cols = {row[1] for row in con.execute("PRAGMA table_info(Reunion)")}
        if "usuario" not in cols:
            con.execute("ALTER TABLE Reunion ADD COLUMN usuario INTEGER REFERENCES Usuario(id)")
        if "Usuario" in tablas:
            con.execute(
                "UPDATE Reunion SET usuario = (SELECT id FROM Usuario WHERE username = ?) WHERE usuario IS NULL",
                (_LOCAL_USERNAME,),
            )
        con.commit()
    finally:
        con.close()


def ensure_reunion_crm_columns() -> None:
    """La tabla de llamadas de ATV Ops nació solo con la referencia al CRM. Se le agregan
    las columnas del resultado, que es lo que ahora guarda el sistema por su cuenta."""
    from src.db import DB_SCHEMA, ES_POSTGRES

    columnas = [
        ("resultado", "TEXT"), ("closer", "TEXT"), ("programa", "TEXT"), ("cash_usd", "DOUBLE PRECISION"),
        ("saldo_usd", "DOUBLE PRECISION"), ("nota", "TEXT"),
        ("descartada", "BOOLEAN DEFAULT FALSE NOT NULL"),
        ("actualizado_por", "TEXT"), ("actualizado_at", "TIMESTAMP"),
    ]
    if ES_POSTGRES:
        import psycopg2

        from src.db import _postgres_kwargs

        kw = _postgres_kwargs()
        conn = psycopg2.connect(
            user=kw["user"], password=kw["password"], host=kw["host"], port=kw["port"],
            dbname=kw["database"], **({"sslmode": kw["sslmode"]} if "sslmode" in kw else {}),
        )
        try:
            with conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM information_schema.tables WHERE table_schema=%s AND table_name='reuniones_crm'",
                    (DB_SCHEMA,),
                )
                if cur.fetchone() is None:
                    return  # la crea Pony con las columnas incluidas
                for nombre, tipo in columnas:
                    cur.execute(f'ALTER TABLE "{DB_SCHEMA}".reuniones_crm ADD COLUMN IF NOT EXISTS {nombre} {tipo}')
        finally:
            conn.close()
        return

    import sqlite3

    filename = config("DB_FILENAME", default="data/atv_ops.db")
    if filename in {":memory:", ":sharedmemory:"}:
        return
    path = Path(filename)
    if not path.exists():
        return
    con = sqlite3.connect(path)
    try:
        tablas = {f[0] for f in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "ReunionCrm" not in tablas:
            return
        tiene = {f[1] for f in con.execute('PRAGMA table_info("ReunionCrm")')}
        for nombre, tipo in columnas:
            if nombre not in tiene:
                con.execute(f'ALTER TABLE "ReunionCrm" ADD COLUMN {nombre} {tipo.replace("DOUBLE PRECISION", "REAL")}')
        con.commit()
    finally:
        con.close()


def ensure_idea_usuario_column() -> None:
    """Tabla de ideas creada antes de que fueran por usuario: agrega la columna
    y asigna las huérfanas a Franco. Cubre SQLite (local) y Postgres (server)."""
    from src.db import DB_SCHEMA, ES_POSTGRES

    if ES_POSTGRES:
        import psycopg2
        from src.db import _postgres_kwargs

        kw = _postgres_kwargs()
        conn = psycopg2.connect(
            user=kw["user"], password=kw["password"], host=kw["host"], port=kw["port"],
            dbname=kw["database"], **({"sslmode": kw["sslmode"]} if "sslmode" in kw else {}),
        )
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT 1 FROM information_schema.tables WHERE table_schema=%s AND table_name='ideas'",
                        (DB_SCHEMA,),
                    )
                    if cur.fetchone() is None:
                        return  # la crea Pony con la columna incluida
                    cur.execute(
                        f'ALTER TABLE "{DB_SCHEMA}".ideas ADD COLUMN IF NOT EXISTS usuario INTEGER REFERENCES "{DB_SCHEMA}".usuarios(id)'
                    )
                    cur.execute(
                        f'UPDATE "{DB_SCHEMA}".ideas SET usuario = (SELECT id FROM "{DB_SCHEMA}".usuarios WHERE username = %s) WHERE usuario IS NULL',
                        (_LOCAL_USERNAME,),
                    )
        finally:
            conn.close()
        return

    filename = config("DB_FILENAME", default="data/atv_ops.db")
    if filename in {":memory:", ":sharedmemory:"}:
        return
    path = Path(filename)
    if not path.is_absolute():
        path = _BACKEND_ROOT / path
    if not path.exists():
        return
    con = sqlite3.connect(path)
    try:
        tablas = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "Idea" not in tablas:
            return
        cols = {row[1] for row in con.execute("PRAGMA table_info(Idea)")}
        if "usuario" not in cols:
            con.execute("ALTER TABLE Idea ADD COLUMN usuario INTEGER REFERENCES Usuario(id)")
        if "Usuario" in tablas:
            con.execute(
                "UPDATE Idea SET usuario = (SELECT id FROM Usuario WHERE username = ?) WHERE usuario IS NULL",
                (_LOCAL_USERNAME,),
            )
        con.commit()
    finally:
        con.close()


class AuthServices:
    def ensure_local_user(self) -> None:
        """Crea los usuarios locales de desarrollo que todavía no existan."""
        ensure_usuario_rol_column()
        with db_session:
            for username, env_var, dev_default, nombre, rol in _USUARIOS_SEMILLA:
                existente = Usuario.get(username=username)
                if existente is None:
                    password = _password_semilla(env_var, dev_default)
                    if password is None:
                        logging.getLogger("atv_ops").warning(
                            "Usuario %s no sembrado: falta %s en el .env.", username, env_var
                        )
                        continue
                    Usuario(
                        username=username,
                        password_hash=_hash_password(password),
                        nombre=nombre,
                        rol=rol,
                    )
                    continue
                # Dev local: franco siempre admin; los demás conservan su rol si es válido.
                if username == _LOCAL_USERNAME:
                    existente.rol = _LOCAL_ROL
                elif not getattr(existente, "rol", None) or existente.rol not in ROLES_VALIDOS:
                    existente.rol = rol
                # La clave del .env manda: si cambió, se actualiza al arrancar.
                deseada = (config(env_var, default="") or "").strip()
                if deseada and not _verify_password(deseada, existente.password_hash):
                    existente.password_hash = _hash_password(deseada)
                    logging.getLogger("atv_ops").info("Clave de %s actualizada desde %s.", username, env_var)

    def login(self, username: str, password: str) -> dict:
        with db_session:
            usuario = Usuario.get(username=username.strip())
            if usuario is None or not _verify_password(password, usuario.password_hash):
                raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
            token = jwt.encode(
                {
                    "sub": str(usuario.id),
                    "username": usuario.username,
                    "rol": getattr(usuario, "rol", None) or "operaciones",
                    "exp": datetime.now(timezone.utc) + timedelta(days=_TOKEN_DIAS),
                },
                _secret(),
                algorithm="HS256",
            )
            return {"token": token, "user": _to_response(usuario)}

    def usuario_desde_token(self, token: str) -> dict:
        try:
            payload = jwt.decode(token, _secret(), algorithms=["HS256"])
            user_id = int(payload["sub"])
        except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
            raise HTTPException(status_code=401, detail="Sesión inválida o vencida.")

        # Caché en memoria: el frontend relee los chats cada 15 s y cada request
        # valida la sesión. Sin esto, cada relectura es una consulta a la base
        # (que en el server es Neon y cobra por tiempo despierto).
        ahora = time.monotonic()
        cacheado = _CACHE_SESION.get(user_id)
        if cacheado and ahora - cacheado[0] < _CACHE_SESION_SEGUNDOS:
            return dict(cacheado[1])

        with db_session:
            usuario = Usuario.get(id=user_id)
            if usuario is None:
                _CACHE_SESION.pop(user_id, None)
                raise HTTPException(status_code=401, detail="Sesión inválida o vencida.")
            datos = _to_response(usuario)
        _CACHE_SESION[user_id] = (ahora, datos)
        return dict(datos)
