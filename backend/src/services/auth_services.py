from __future__ import annotations

import hashlib
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import _BACKEND_ROOT
from src.models import Usuario

_PBKDF2_ROUNDS = 120_000
_TOKEN_DIAS = 7
_LOCAL_USERNAME = "franco"
_LOCAL_PASSWORD = "franco"
_LOCAL_NOMBRE = "Franco"
_LOCAL_ROL = "admin"

# Usuarios sembrados al arrancar (dev local). (username, password, nombre, rol)
_USUARIOS_SEMILLA = (
    (_LOCAL_USERNAME, _LOCAL_PASSWORD, _LOCAL_NOMBRE, _LOCAL_ROL),
    ("mauri", "mauri", "Mauri", "csm"),  # CSM: clientes y fulfillment
)

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


class AuthServices:
    def ensure_local_user(self) -> None:
        """Crea los usuarios locales de desarrollo que todavía no existan."""
        ensure_usuario_rol_column()
        with db_session:
            for username, password, nombre, rol in _USUARIOS_SEMILLA:
                existente = Usuario.get(username=username)
                if existente is None:
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

        with db_session:
            usuario = Usuario.get(id=user_id)
            if usuario is None:
                raise HTTPException(status_code=401, detail="Sesión inválida o vencida.")
            return _to_response(usuario)
