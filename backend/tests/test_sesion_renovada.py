"""La sesión se renueva sola mientras se usa Ops.

Antes el token duraba 7 días desde el login y no se renovaba nunca: al que entraba todos
los días lo cortaba igual, en medio de lo que estuviera haciendo, con un cartel de
"Sesión inválida o vencida" que no decía qué hacer.
"""
from datetime import datetime, timedelta, timezone

import jwt

from src.services import auth_services as a


def token(dias, **extra):
    claims = {"sub": "3", "username": "lucas", "rol": "ventas",
              "exp": datetime.now(timezone.utc) + timedelta(days=dias)}
    claims.update(extra)
    return jwt.encode(claims, a._secret(), algorithm="HS256")


def test_al_recien_entrado_no_se_le_renueva_nada():
    """Emitir uno nuevo en cada request no sirve de nada y cambia la clave del caché."""
    assert a.renovar_token(token(7)) is None
    assert a.renovar_token(token(4)) is None


def test_el_que_esta_por_vencerse_vuelve_con_uno_nuevo():
    nuevo = a.renovar_token(token(2))
    assert nuevo
    payload = jwt.decode(nuevo, a._secret(), algorithms=["HS256"])
    vence = datetime.fromtimestamp(payload["exp"], timezone.utc)
    assert timedelta(days=6, hours=23) < vence - datetime.now(timezone.utc) <= timedelta(days=7)
    # Y sigue siendo la misma persona: el token no guarda nada más que esto.
    assert payload["sub"] == "3" and payload["username"] == "lucas" and payload["rol"] == "ventas"


def test_la_renovacion_se_acuerda_de_quien_entro_como_otro():
    """Franco mirando la cuenta de Lucas no vuelve a ser Franco al renovarse."""
    payload = jwt.decode(a.renovar_token(token(1, por="franco")), a._secret(), algorithms=["HS256"])
    assert payload["por"] == "franco"


def test_el_vencido_ya_no_se_renueva():
    """Pasados los 7 días hay que poner la clave: si no, la sesión no vencería nunca."""
    assert a.renovar_token(token(-1)) is None


def test_un_token_de_cualquier_lado_no_renueva_nada():
    assert a.renovar_token("cualquier.cosa.inventada") is None
    assert a.renovar_token(jwt.encode({"sub": "3"}, "otra-clave", algorithm="HS256")) is None
    # Firmado con la nuestra pero sin vencimiento: tampoco.
    assert a.renovar_token(jwt.encode({"sub": "3"}, a._secret(), algorithm="HS256")) is None
