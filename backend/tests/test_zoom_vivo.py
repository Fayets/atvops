"""El vivo se arma con los webhooks, no con la API de métricas.

La API de métricas en vivo de Zoom pide plan Business. Los webhooks —que avisan cada
entrada y cada salida— llegan igual y dicen lo mismo. Estos tests fijan esa
reconstrucción, incluido lo que hace que sirva de verdad: que el estado salga de los
eventos guardados y no de un contador, así un reinicio del contenedor en medio del
webinar no se lleva puesto el número.
"""

from datetime import datetime, timedelta

import pytest
from pony.orm import db_session

from src.db import init_db
from src.models import ZoomEvento
from src.services import zoom_services as z

W = "99999999999"
T0 = datetime.utcnow() - timedelta(minutes=30)


# Pony se ata una sola vez al proceso: si otro módulo de tests ya lo hizo, esto sobra.
try:
    init_db()
except Exception:  # noqa: BLE001
    pass


@pytest.fixture(autouse=True)
def base():
    with db_session:
        for e in ZoomEvento.select(lambda e: e.webinar_zoom_id == W):
            e.delete()
    yield
    with db_session:
        for e in ZoomEvento.select(lambda e: e.webinar_zoom_id == W):
            e.delete()


def evento(tipo, pid="", email=None, minuto=0):
    with db_session:
        ZoomEvento(webinar_zoom_id=W, participante_id=pid, email=email,
                   nombre=pid or None, tipo=tipo, at=T0 + timedelta(minutes=minuto))


def test_sin_eventos_no_esta_en_vivo():
    r = z.vivo(W)
    assert r["enVivo"] is False and r["conectados"] == 0 and r["distintos"] == 0


def test_cuenta_quien_esta_adentro_ahora():
    evento("inicio", minuto=0)
    evento("entra", "a", "a@x.com", 1)
    evento("entra", "b", "b@x.com", 2)
    evento("sale", "a", "a@x.com", 5)
    r = z.vivo(W)
    assert r["enVivo"] is True
    assert r["conectados"] == 1
    assert [p["email"] for p in r["gente"]] == ["b@x.com"]


def test_el_pico_incluye_a_los_que_siguen_adentro():
    """Mientras el webinar pasa nadie tiene salida todavía: si solo contáramos los
    tramos cerrados, el pico daría cero justo cuando más se mira."""
    evento("inicio", minuto=0)
    for i, pid in enumerate(("a", "b", "c")):
        evento("entra", pid, f"{pid}@x.com", 1 + i)
    assert z.vivo(W)["picoConcurrentes"] == 3


def test_el_que_se_cae_y_vuelve_es_una_sola_persona():
    evento("inicio", minuto=0)
    evento("entra", "a1", "a@x.com", 1)
    evento("sale", "a1", "a@x.com", 4)
    evento("entra", "a2", "a@x.com", 5)
    r = z.vivo(W)
    assert r["distintos"] == 1
    assert r["conectados"] == 1


def test_cuando_termina_deja_de_estar_en_vivo():
    evento("inicio", minuto=0)
    evento("entra", "a", "a@x.com", 1)
    evento("sale", "a", "a@x.com", 20)
    evento("fin", minuto=21)
    r = z.vivo(W)
    assert r["enVivo"] is False
    assert r["conectados"] == 0
    assert r["picoConcurrentes"] == 1


def test_un_evento_que_no_conocemos_no_rompe_nada():
    assert z.registrar_evento({"event": "recording.completed"})["ok"] is True
