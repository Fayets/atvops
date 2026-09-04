from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.models import Usuario

_PBKDF2_ROUNDS = 120_000
_TOKEN_DIAS = 7
_LOCAL_USERNAME = "franco"
_LOCAL_PASSWORD = "franco"
_LOCAL_NOMBRE = "Franco"


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
    return {
        "id": usuario.id,
        "username": usuario.username,
        "nombre": usuario.nombre,
    }


class AuthServices:
    def ensure_local_user(self) -> None:
        """Crea el usuario local de desarrollo si todavía no existe."""
        with db_session:
            if Usuario.get(username=_LOCAL_USERNAME) is not None:
                return
            Usuario(
                username=_LOCAL_USERNAME,
                password_hash=_hash_password(_LOCAL_PASSWORD),
                nombre=_LOCAL_NOMBRE,
            )

    def login(self, username: str, password: str) -> dict:
        with db_session:
            usuario = Usuario.get(username=username.strip())
            if usuario is None or not _verify_password(password, usuario.password_hash):
                raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
            token = jwt.encode(
                {
                    "sub": str(usuario.id),
                    "username": usuario.username,
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
