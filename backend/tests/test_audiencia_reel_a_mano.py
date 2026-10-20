"""El botón del reel hace lo del análisis a mano: los usuarios pegados quedan atados al reel y
el reel queda seguido. Sin Instagram ni IA reales."""

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import audiencia_services as a


@pytest.fixture()
def base(monkeypatch):
    if db.provider is None:
        init_db()
    from src.models import AjusteAudiencia, LeadAudiencia

    def limpiar():
        with db_session:
            for x in list(LeadAudiencia.select()):
                if x.ig_usuario.startswith("prueba_"):
                    x.delete()
            f = AjusteAudiencia.get(clave="seguir:999001")
            if f:
                f.delete()
    limpiar()
    monkeypatch.setattr(a, "_credenciales", lambda: ("tok", "uid"))
    monkeypatch.setattr(a, "_pedir", lambda t, path, **k: {"id": "999001", "caption": "comenta “info” y te paso", "permalink": "https://www.instagram.com/reel/x/"})
    monkeypatch.setattr(a, "leer_perfil", lambda t, u, usuario: ("personal", {}))
    monkeypatch.setattr(a, "analizar", lambda **k: {"analizados": 0, "errores": 0})
    yield
    limpiar()


def test_los_pegados_quedan_atados_al_reel_y_el_reel_seguido(base):
    from src.models import LeadAudiencia

    r = a.analizar_a_mano("@prueba_ana\nhttps://instagram.com/prueba_beto/", {"username": "franco"}, "999001")
    assert r["nuevos"] == 2
    with db_session:
        ana = next(x for x in list(LeadAudiencia.select()) if x.ig_usuario == "prueba_ana")
        assert ana.media_id == "999001" and ana.creado_por == "instagram" and ana.reel_caption.startswith("comenta")
    assert "999001" in a.reels_seguidos() and a.reels_seguidos()["999001"]["por"] == "franco"
    # Si se pegan de nuevo, no se duplican.
    assert a.analizar_a_mano("prueba_ana", {"username": "franco"}, "999001")["nuevos"] == 0


def test_sin_reel_sigue_siendo_carga_suelta(base):
    from src.models import LeadAudiencia

    a.analizar_a_mano("prueba_caro", {"username": "franco"})
    with db_session:
        caro = next(x for x in list(LeadAudiencia.select()) if x.ig_usuario == "prueba_caro")
        assert caro.media_id is None and caro.creado_por == "franco"
