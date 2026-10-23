"""Las clases de la landing: sembrar, editar y, sobre todo, cómo se cuenta.

Lo que se fija acá es que las métricas midan únicamente lo que pasa en la página: una
persona que entra diez veces el mismo día es una visita, y abrir un playbook cuenta una
vez por día. Nada de comentarios de Instagram: eso vive en los recursos por palabra.
"""

from datetime import date

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import clases_services as c


def _limpiar():
    from src.db import ES_POSTGRES
    from src.models import ClaseEvento, ClaseRecurso, ClaseSerie, ClaseVisita

    # Estas pruebas vacían las tablas: contra la base de verdad no se corren.
    assert not ES_POSTGRES, "los tests de clases borran datos: solo contra sqlite"

    with db_session:
        for entidad in (ClaseEvento, ClaseVisita, ClaseRecurso, ClaseSerie):
            for x in list(entidad.select()):
                x.delete()


@pytest.fixture()
def base():
    if db.provider is None:
        init_db()
    _limpiar()
    yield
    _limpiar()


def test_siembra_las_series_de_juan_una_sola_vez(base):
    r = c.sembrar("franco")
    assert r == {"creadas": 6, "recursos": 24}
    assert c.sembrar("franco")["creadas"] == 0        # no duplica

    p = c.publico()
    assert p["totales"] == {"llamadas": 6, "playbooks": 18, "recursos": 24, "minutos": 388, "horas": "6h+"}
    assert [s["numero"] for s in p["series"]] == [1, 2, 3, 4, 5, 6]
    primera = p["series"][0]
    assert primera["llamada"]["minutos"] == 69
    assert len(primera["playbooks"]) == 3


def test_el_link_no_viaja_en_el_json_publico(base):
    c.sembrar(None)
    crudo = repr(c.publico())
    assert "fathom.video" not in crudo and "drive.google.com" not in crudo


def test_ir_redirige_al_link_y_cuenta_una_vez_por_dia(base):
    c.sembrar(None)
    slug = c.publico()["series"][0]["llamada"]["slug"]

    assert c.destino(slug, "sesionunodeprueba").startswith("https://fathom.video/")
    c.destino(slug, "sesionunodeprueba")              # la misma persona, el mismo día
    c.destino(slug, "sesiondosdeprueba")

    serie = next(s for s in c.listar(30)["series"] if s["numero"] == 1)
    llamada = next(r for r in serie["recursos"] if r["tipo"] == "llamada")
    assert llamada["clics"] == 2


def test_quien_abre_tres_playbooks_es_una_sola_persona(base):
    """Los clics pueden ser más que la gente: el que se baja los tres playbooks cuenta una vez."""
    c.sembrar(None)
    serie = c.publico()["series"][0]
    for pb in serie["playbooks"]:
        c.destino(pb["slug"], "sesionunodeprueba")

    t = c.listar(30)["totales"]
    assert t["clics"] == 3 and t["personas"] == 1


def test_una_persona_que_recarga_es_una_sola_visita(base):
    c.sembrar(None)
    for _ in range(5):
        c.registrar_visita("sesionunodeprueba")
    c.registrar_visita("sesiondosdeprueba")
    assert c.listar(30)["totales"]["visitas"] == 2


def test_las_visitas_no_se_mezclan_con_los_chats_de_instagram(base):
    """La queja de Franco: los números de la pantalla vieja eran comentarios de Instagram.
    Acá, sin nadie en la página, todo tiene que dar cero."""
    c.sembrar(None)
    t = c.listar(30)["totales"]
    assert t == {"visitas": 0, "personas": 0, "clics": 0, "llamadas": 0, "playbooks": 0}


def test_una_sesion_inventada_no_cuenta(base):
    c.sembrar(None)
    assert c.registrar_visita("x") is False           # corta
    assert c.registrar_visita("") is False
    assert c.listar(30)["totales"]["visitas"] == 0


def test_lo_apagado_no_sale_en_la_pagina_pero_sigue_en_el_panel(base):
    c.sembrar(None)
    serie = c.listar(30)["series"][0]
    playbook = next(r for r in serie["recursos"] if r["tipo"] == "playbook")
    c.editar_recurso(playbook["id"], {"activo": False}, "franco")

    publica = c.publico()["series"][0]
    assert len(publica["playbooks"]) == 2
    assert c.publico()["totales"]["playbooks"] == 17
    assert len(c.listar(30)["series"][0]["recursos"]) == 4

    c.editar_serie(serie["id"], {"activa": False}, "franco")
    assert [s["numero"] for s in c.publico()["series"]] == [2, 3, 4, 5, 6]


def test_un_recurso_apagado_tampoco_se_puede_abrir(base):
    c.sembrar(None)
    serie = c.listar(30)["series"][0]
    playbook = next(r for r in serie["recursos"] if r["tipo"] == "playbook")
    c.editar_recurso(playbook["id"], {"activo": False}, None)
    with pytest.raises(Exception) as e:
        c.destino(playbook["slug"], "sesionunodeprueba")
    assert getattr(e.value, "status_code", None) == 404


def test_cada_serie_tiene_una_sola_llamada(base):
    s = c.crear_serie({"titulo": "Serie de prueba"}, "franco")
    c.crear_recurso({"serieId": s["id"], "tipo": "llamada", "titulo": "La llamada",
                     "url": "https://fathom.video/share/abc"}, "franco")
    with pytest.raises(Exception) as e:
        c.crear_recurso({"serieId": s["id"], "tipo": "llamada", "titulo": "Otra",
                         "url": "https://fathom.video/share/def"}, "franco")
    assert getattr(e.value, "status_code", None) == 409


def test_cambiar_el_orden_intercambia_en_vez_de_chocar(base):
    c.sembrar(None)
    serie = c.listar(30)["series"][0]
    pbs = [r for r in serie["recursos"] if r["tipo"] == "playbook"]
    primero, segundo = pbs[0], pbs[1]
    c.editar_recurso(primero["id"], {"orden": 2}, "franco")

    ahora = {r["id"]: r["orden"] for r in c.listar(30)["series"][0]["recursos"]}
    assert ahora[primero["id"]] == 2 and ahora[segundo["id"]] == 1


def test_el_link_tiene_que_ser_un_link(base):
    s = c.crear_serie({"titulo": "Serie de prueba"}, None)
    with pytest.raises(Exception) as e:
        c.crear_recurso({"serieId": s["id"], "tipo": "playbook", "titulo": "Sin link", "url": "drive.google.com/x"}, None)
    assert getattr(e.value, "status_code", None) == 422


def test_los_textos_de_la_pagina_se_editan(base):
    c.guardar_pagina({"titulo": "Fathoms + Playbooks", "notaLlamadas": "grabadas en Fathom"}, "juan")
    p = c.publico()["pagina"]
    assert p["titulo"] == "Fathoms + Playbooks"
    assert p["notaLlamadas"] == "grabadas en Fathom"
    assert p["actualizadoPor"] == "juan"


def test_el_dia_es_el_argentino(base):
    """A las 2 de la mañana de Argentina, en UTC ya es el día siguiente: la visita de
    alguien que entra de madrugada tiene que caer en el día que ve él."""
    assert c._hoy() <= date.today()
