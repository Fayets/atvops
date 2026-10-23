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


def test_links_de_loom_y_vimeo():
    assert rs._link_video("https://www.loom.com/share/3f2a9c0d1e2b4a5f8c7d6e5f4a3b2c1d?sid=x") == \
        {"tipo": "loom", "id": "3f2a9c0d1e2b4a5f8c7d6e5f4a3b2c1d"}
    assert rs._link_video("https://vimeo.com/123456789") == {"tipo": "vimeo", "id": "123456789", "h": None}
    assert rs._link_video("https://vimeo.com/123456789/abc123def0") == {"tipo": "vimeo", "id": "123456789", "h": "abc123def0"}
    assert rs._link_video("https://player.vimeo.com/video/123456789?h=abc123def0") == \
        {"tipo": "vimeo", "id": "123456789", "h": "abc123def0"}
    assert rs._link_video("https://youtube.com/watch?v=x") is None


def test_la_landing_publica_video_texto_y_recurso(base):
    from src.models import RecursosLanding

    with db_session:
        previa = RecursosLanding.get(id=1)
        guardada = previa.to_dict() if previa else None
    a = _nuevo("pruebarecG", link="https://docs.google.com/g")
    try:
        with pytest.raises(HTTPException):
            rs.guardar_landing({"mediaTipo": "loom", "mediaId": "https://youtube.com/x", "recursoId": a["id"], "titular": "x"}, "t")
        rs.guardar_landing({"mediaTipo": "vimeo", "mediaId": "https://vimeo.com/123456789", "recursoId": a["id"],
                            "titular": "Hola *rojo*", "bajada": "**Mirá** esto", "boton": "Bajalo", "entrega": "regalo"}, "t")
        d = rs.publico()["destacado"]
        assert d["slug"] == "pruebarecg" and d["titular"] == "Hola *rojo*" and d["boton"] == "Bajalo"
        assert d["media"] == {"tipo": "vimeo", "id": "123456789", "h": None} and d["entrega"] == "regalo"
    finally:
        with db_session:
            fila = RecursosLanding.get(id=1)
            if guardada is None and fila:
                fila.delete()
            elif guardada:
                guardada.pop("id")
                fila.set(**guardada)


def test_los_recursos_salen_solos_de_los_reels_y_no_se_duplican(base):
    rs.sincronizar(forzar=True)
    antes = len(rs.publico()["recursos"])
    assert rs.sincronizar(forzar=True) == []
    assert len(rs.publico()["recursos"]) == antes
    assert rs.sincronizar() == []   # dentro de los 10 minutos ni lo intenta
