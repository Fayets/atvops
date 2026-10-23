"""Recursos de Juan: qué ve el público, quién llega al documento y cómo se cuentan las visitas."""

import pytest
from fastapi import HTTPException
from pony.orm import db_session

from src.db import db, init_db
from src.services import recursos_services as rs

SESION = "sesionprueba01"


@pytest.fixture()
def base():
    if db.provider is None:
        init_db()
    from src.models import Recurso

    def limpiar():
        with db_session:
            for r in list(Recurso.select()):
                if r.slug.startswith("pruebarec"):
                    for e in list(r.eventos):
                        e.delete()
                    r.delete()
    # Destacar uno de prueba le saca el lugar al de verdad: se devuelve al terminar.
    with db_session:
        antes = next((r.id for r in list(Recurso.select()) if r.destacado), None)
    limpiar()
    yield
    limpiar()
    if antes is not None:
        with db_session:
            r = Recurso.get(id=antes)
            if r is not None:
                r.destacado = True


def _nuevo(palabra, **extra):
    return rs.crear({"palabra": palabra, "titulo": f"Recurso {palabra}", **extra}, "test")


def test_youtube_id_de_todas_las_formas():
    assert rs.youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert rs.youtube_id("youtu.be/dQw4w9WgXcQ?t=3") == "dQw4w9WgXcQ"
    assert rs.youtube_id("https://youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert rs.youtube_id("https://vimeo.com/123") is None


def test_el_link_nunca_sale_por_lo_publico(base):
    a = _nuevo("pruebarecA", link="docs.google.com/document/d/x/copy", entrega="regalo")
    rs.destacar(a["id"], {}, "test")
    datos = rs.publico()
    assert datos["destacado"]["slug"] == "pruebareca"
    assert datos["destacado"]["entrega"] == "regalo"
    assert "docs.google.com" not in str(datos)


def test_solo_el_destacado_de_regalo_lleva_al_documento(base):
    a = _nuevo("pruebarecB", link="https://docs.google.com/a", entrega="regalo")
    b = _nuevo("pruebarecC", link="https://docs.google.com/b", entrega="regalo")
    rs.destacar(a["id"], {}, "test")
    url, tipo = rs.destino_descarga("pruebarecb")
    assert (url, tipo) == ("https://docs.google.com/a", "descarga")
    # El otro tiene link y es de regalo, pero está en la biblioteca: va a WhatsApp.
    url, tipo = rs.destino_descarga("pruebarecc")
    assert tipo == "whatsapp" and url.startswith("https://wa.me/") and "PRUEBARECC" in url
    # Al destacar otro, el anterior vuelve a la biblioteca.
    rs.destacar(b["id"], {}, "test")
    assert rs.destino_descarga("pruebarecb")[1] == "whatsapp"


def test_destacar_de_regalo_sin_link_no_se_puede(base):
    a = _nuevo("pruebarecD")
    with pytest.raises(HTTPException):
        rs.destacar(a["id"], {"entrega": "regalo"}, "test")


def test_una_persona_suma_una_visita_por_dia(base):
    _nuevo("pruebarecE")
    assert rs.registrar("pruebarecE", "visita", "landing", SESION)
    assert not rs.registrar("pruebarecE", "visita", "landing", SESION)
    assert rs.registrar("pruebarecE", "play", "landing", SESION)
    assert not rs.registrar("pruebarecE", "inventado", "landing", SESION)
    assert not rs.registrar("pruebarecE", "visita", "landing", "corta")
    m = next(r for r in rs.listar(30)["recursos"] if r["slug"] == "pruebarece")["metricas"]
    assert m["visitas"] == 1 and m["play"] == 1 and m["visitasLanding"] == 1


def test_la_palabra_no_se_repite(base):
    _nuevo("pruebarecF")
    with pytest.raises(HTTPException):
        _nuevo("PruebaRecF")
