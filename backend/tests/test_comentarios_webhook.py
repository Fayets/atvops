"""Los comentarios que Meta avisa por webhook se guardan y entran a Audiencia y al conteo de
chats aunque la API no los devuelva. Sin Meta real."""

from datetime import datetime

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import comentarios_ig_services as cm

AVISO = {"object": "instagram", "entry": [{"id": "17841400159563968", "time": 1792432931, "changes": [
    {"field": "comments", "value": {"id": "c_prueba_1", "text": "info", "from": {"id": "9", "username": "Prueba_Ana"},
                                    "media": {"id": "reel_prueba_wh", "media_product_type": "REELS"}}},
    {"field": "comments", "value": {"id": "c_prueba_2", "text": "te mandé", "from": {"id": "1", "username": "juanxcarrizo"},
                                    "media": {"id": "reel_prueba_wh"}, "parent_id": "c_prueba_1"}},
    {"field": "mentions", "value": {"comment_id": "x"}},
]}]}


@pytest.fixture()
def base():
    if db.provider is None:
        init_db()
    from src.models import ComentarioIg

    def limpiar():
        with db_session:
            for x in list(ComentarioIg.select()):
                if x.comentario_id.startswith("c_prueba_"):
                    x.delete()
    limpiar()
    yield
    limpiar()


def test_lee_el_aviso_y_descarta_respuestas_y_otros_campos():
    c = cm.de_aviso(AVISO)
    assert len(c) == 1 and c[0]["username"] == "prueba_ana" and c[0]["media_id"] == "reel_prueba_wh"
    assert c[0]["at"] == datetime.utcfromtimestamp(1792432931)


def test_guarda_una_vez_y_el_reel_los_devuelve_con_la_forma_de_la_api(base):
    assert cm.guardar(AVISO) == 1
    assert cm.guardar(AVISO) == 0
    r = cm.del_reel("reel_prueba_wh")
    assert r == [{"id": "c_prueba_1", "username": "prueba_ana", "text": "info", "timestamp": "2026-10-19T18:02:11+0000"}]


def test_el_conteo_de_chats_los_suma_aunque_la_api_no_los_de(base, monkeypatch):
    from src.services import chats_reels_services as cr

    cm.guardar(AVISO)
    monkeypatch.setattr(cr.aud if hasattr(cr, "aud") else __import__("src.services.audiencia_services", fromlist=["x"]),
                        "_pedir", lambda t, u, **k: {"data": [], "paging": {}})
    monkeypatch.setattr(cr, "_de_apify", lambda reel_id, de_la_api: [])
    assert [c["username"] for c in cr._comentarios("tok", "reel_prueba_wh")] == ["prueba_ana"]
