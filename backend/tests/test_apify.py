"""El respaldo de Apify: se usa solo cuando la API de Instagram se queda corta, no repite
pedidos pagos sin comentarios nuevos y nunca corta la corrida si falla. Sin Apify real."""

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import apify_services as ap

ITEMS = [  # forma de la salida de apify/instagram-comment-scraper
    {"id": "1801", "ownerUsername": "_abelxflores", "text": "Info", "timestamp": "2026-10-19T14:02:11.000Z"},
    {"id": "1802", "ownerUsername": "yohn_editor", "text": "info", "timestamp": "2026-10-19T14:05:00.000Z"},
    {"id": "1802", "ownerUsername": "yohn_editor", "text": "info", "timestamp": "2026-10-19T14:05:00.000Z"},
    {"id": "1803", "owner": {"username": "yamisilva.cm"}, "text": "Info"},
    {"id": "1804", "text": "sin usuario"},
]


@pytest.fixture()
def apify(monkeypatch):
    if db.provider is None:
        init_db()
    from src.models import AjusteAudiencia

    def limpiar():
        with db_session:
            for x in list(AjusteAudiencia.select()):
                if x.clave.startswith("apify:prueba"):
                    x.delete()
        ap._memoria.clear()

    limpiar()
    pedidos = []
    monkeypatch.setattr(ap, "_token", lambda: "tok")
    monkeypatch.setattr(ap, "_pedir", lambda url, tok: pedidos.append(url) or ITEMS)
    yield pedidos
    limpiar()


def test_solo_hace_falta_si_la_api_se_quedo_corta():
    assert ap.hace_falta(0, 45)          # el reel del 19-10
    assert ap.hace_falta(2, 161)
    assert not ap.hace_falta(56, 94)     # el resto son respuestas del bot: la API trajo todo
    assert not ap.hace_falta(44, 72)
    assert not ap.hace_falta(0, 0)       # sin comentarios no hay nada que buscar


def test_normaliza_a_la_forma_de_la_api_de_instagram():
    c = ap.normalizar(ITEMS)
    assert [x["username"] for x in c] == ["_abelxflores", "yohn_editor", "yamisilva.cm"]
    assert c[0] == {"id": "1801", "username": "_abelxflores", "text": "Info", "timestamp": "2026-10-19T14:02:11+0000"}


def test_no_paga_dos_veces_el_mismo_reel_sin_comentarios_nuevos(apify):
    url = "https://www.instagram.com/reel/prueba/"
    assert len(ap.comentarios("prueba1", url, 45)) == 3 and len(apify) == 1
    assert len(ap.comentarios("prueba1", url, 45)) == 3 and len(apify) == 1   # de memoria
    ap._memoria.clear()                                                        # como tras un reinicio
    assert ap.comentarios("prueba1", url, 47) == [] and len(apify) == 1        # 2 nuevos: no alcanza
    assert len(ap.comentarios("prueba1", url, 52)) == 3 and len(apify) == 2    # 7 nuevos: vuelve a leer


def test_si_falla_o_no_esta_configurado_no_corta(apify, monkeypatch):
    def rompe(url, tok):
        raise TimeoutError("apify no contesta")
    monkeypatch.setattr(ap, "_pedir", rompe)
    assert ap.comentarios("prueba2", "https://www.instagram.com/reel/x/", 45) == []
    monkeypatch.setattr(ap, "_token", lambda: "")
    assert ap.comentarios("prueba3", "https://www.instagram.com/reel/y/", 45) == []
