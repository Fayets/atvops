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


def test_entiende_la_salida_de_apidojo():
    c = ap.normalizar([{"id": "9", "user": {"username": "drsebas.fit"}, "message": "Info", "createdAt": 1792432931},
                       {"id": "10", "user": {"username": "yamisilva.cm"}, "message": "Info", "createdAt": "2026-10-19T14:02:11Z"}])
    assert [(x["username"], x["text"]) for x in c] == [("drsebas.fit", "Info"), ("yamisilva.cm", "Info")]
    assert c[0]["timestamp"].endswith("+0000") and c[1]["timestamp"] == "2026-10-19T14:02:11+0000"


def test_entiende_la_salida_de_memo23():
    c = ap.normalizar([{"pk": "77", "user": {"username": "drsebas.fit"}, "text": "Info", "created_at": 1792432931}])
    assert c[0]["id"] == "77" and c[0]["username"] == "drsebas.fit" and c[0]["timestamp"].endswith("+0000")


def test_entiende_la_salida_de_dead00_y_descarta_respuestas():
    c = ap.normalizar([{"comment_id": "5", "username": "drsebas.fit", "text": "Info", "timestamp": 1792432931},
                       {"comment_id": "6", "username": "juanxcarrizo", "text": "te mandé", "is_reply": True}])
    assert [(x["id"], x["username"]) for x in c] == [("5", "drsebas.fit")]


def test_con_cookies_usa_el_scraper_con_sesion(monkeypatch):
    import json as js
    from src.services import conexiones_services as cx

    pedidos = []

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return b"[]"

    monkeypatch.setattr(ap.urllib.request, "urlopen", lambda req, timeout=0: pedidos.append(req) or Resp())
    cookies = [{"name": "sessionid", "value": "abc", "domain": ".instagram.com", "httpOnly": True}, {"name": "csrftoken", "value": "x"}]
    monkeypatch.setattr(cx, "obtener", lambda p: {"api_token": "tok", "instagram_cookies": js.dumps(cookies)})
    ap._pedir("https://www.instagram.com/reel/abc/", "tok")
    assert "dead00" in pedidos[0].full_url
    cuerpo = js.loads(pedidos[0].data)
    assert cuerpo["post_urls"] == ["https://www.instagram.com/reel/abc/"] and cuerpo["include_replies"] is False
    assert {c["name"] for c in cuerpo["cookies"]} == {"sessionid", "csrftoken"}
    # Sin sessionid no se usan: vuelve al oficial.
    monkeypatch.setattr(cx, "obtener", lambda p: {"api_token": "tok", "instagram_cookies": js.dumps([{"name": "csrftoken", "value": "x"}])})
    ap._pedir("https://www.instagram.com/reel/abc/", "tok")
    assert "apify~instagram-comment-scraper" in pedidos[1].full_url


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
