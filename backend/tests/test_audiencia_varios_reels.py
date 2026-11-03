"""Alguien que ya era lead por un reel y comenta otro sigue siendo un solo lead, pero aparece en
los dos reels. Antes el segundo reel quedaba vacío aunque todos sus comentarios fueran de gente
conocida. Sin Instagram ni IA reales."""

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import apify_services, comentarios_ig_services
from src.services import audiencia_services as a

VIEJO, NUEVO = "888001", "888002"


@pytest.fixture()
def base(monkeypatch):
    if db.provider is None:
        init_db()
    from src.models import AjusteAudiencia, LeadAudiencia, LeadReel

    def limpiar():
        with db_session:
            for clave in (f"seguir:{VIEJO}", f"seguir:{NUEVO}"):
                f = AjusteAudiencia.get(clave=clave)
                if f:
                    f.delete()
            ids = [x.id for x in list(LeadAudiencia.select()) if x.ig_usuario.startswith("prueba_")]
            for r in list(LeadReel.select()):
                if r.lead_id in ids or r.media_id in (VIEJO, NUEVO):
                    r.delete()
            for x in list(LeadAudiencia.select()):
                if x.id in ids:
                    x.delete()
    limpiar()
    with db_session:
        LeadAudiencia(ig_usuario="prueba_conocido", media_id=VIEJO, comentario="Clase", comentario_id="c-viejo",
                      creado_por="instagram", veredicto="calificado", puntaje=8.0, analizado_at=a.datetime.utcnow())
    comentarios = {"data": [
        {"id": "c1", "username": "prueba_conocido", "text": "Clase", "timestamp": "2026-11-02T10:00:00+0000"},
        {"id": "c2", "username": "prueba_nuevo", "text": "Clase", "timestamp": "2026-11-02T10:05:00+0000"},
    ]}
    monkeypatch.setattr(a, "_pedir", lambda token, path, **p: comentarios)
    monkeypatch.setattr(comentarios_ig_services, "del_reel", lambda mid: [])
    monkeypatch.setattr(apify_services, "hace_falta", lambda leidos, total: False)
    yield
    limpiar()


def test_el_que_ya_era_lead_aparece_tambien_en_el_reel_nuevo(base):
    nuevos, sin_usuario = a._comentarios_de_reel("tok", "atv", {"id": NUEVO, "comments_count": 2,
                                                               "caption": "Clase", "permalink": "x"})
    assert (nuevos, sin_usuario) == (2, 0)
    p = a.progreso_reel(NUEVO)
    assert p["personas"] == 2 and p["analizados"] == 1 and p["calificados"] == 1
    # sigue siendo un solo lead, y en el reel nuevo se ve lo que comentó en ese
    perfiles = a.perfiles_de_reel(NUEVO)["perfiles"]
    assert sorted(x["usuario"] for x in perfiles) == ["prueba_conocido", "prueba_nuevo"]
    assert next(x for x in perfiles if x["usuario"] == "prueba_conocido")["reelId"] == NUEVO
    assert a.progreso_reel(VIEJO)["personas"] == 1


def test_leer_el_reel_dos_veces_no_duplica(base):
    m = {"id": NUEVO, "comments_count": 2, "caption": "Clase", "permalink": "x"}
    a._comentarios_de_reel("tok", "atv", m)
    assert a._comentarios_de_reel("tok", "atv", m) == (0, 0)
    assert a.progreso_reel(NUEVO)["personas"] == 2


def test_en_la_lista_de_reels_el_reel_nuevo_cuenta_a_los_dos(base):
    a._comentarios_de_reel("tok", "atv", {"id": NUEVO, "comments_count": 2, "caption": "Clase", "permalink": "x"})
    with db_session:
        from src.models import LeadAudiencia
        filas = [a._a_dict(x) for x in list(LeadAudiencia.select()) if x.ig_usuario.startswith("prueba_")]
        otros = a.reels_por_lead()
    for f in filas:
        f["reels"] = ([f["reelId"]] if f["reelId"] else []) + [r for r in otros.get(f["id"], []) if r != f["reelId"]]
    reel = next(r for r in a._reels(filas) if r["id"] == NUEVO)
    assert reel["personas"] == 2 and reel["calificado"] == 1


def test_si_solo_se_lo_conocia_por_una_historia_entra_al_reel_con_el_analisis_copiado(base):
    # Las fichas de historias no se ven en los reels: atar el comentario ahí lo dejaba invisible.
    from src.models import LeadAudiencia
    with db_session:
        x = LeadAudiencia.get(ig_usuario="prueba_conocido")
        x.creado_por = "historia"
        x.perfil_at = a.datetime.utcnow()
    nuevos, _ = a._comentarios_de_reel("tok", "atv", {"id": NUEVO, "comments_count": 2, "caption": "Clase", "permalink": "x"})
    assert nuevos == 2
    perfiles = {p["usuario"]: p for p in a.perfiles_de_reel(NUEVO)["perfiles"]}
    assert set(perfiles) == {"prueba_conocido", "prueba_nuevo"}
    assert perfiles["prueba_conocido"]["veredicto"] == "calificado" and perfiles["prueba_conocido"]["fuente"] == "reel"
    p = a.progreso_reel(NUEVO)
    assert p["personas"] == 2 and p["calificados"] == 1


def test_un_comentario_que_falla_no_corta_la_lectura_del_resto(base, monkeypatch):
    # Antes un solo error dejaba el reel a medias: 11 personas de 90.
    real = a._usuario_limpio
    monkeypatch.setattr(a, "_usuario_limpio", lambda t: (_ for _ in ()).throw(RuntimeError("boom")) if t == "prueba_conocido" else real(t))
    a.seguir_reel(NUEVO, por="franco")
    nuevos, _ = a._comentarios_de_reel("tok", "atv", {"id": NUEVO, "comments_count": 2, "caption": "Clase", "permalink": "x"})
    assert nuevos == 1                                     # el otro entró igual
    assert a.progreso_reel(NUEVO)["lectura"]["errores"] == 1   # y el error queda a la vista


def test_un_comentario_atado_a_una_historia_pasa_a_la_ficha_de_reels_sin_chocar(base):
    from src.models import LeadAudiencia, LeadReel
    m = {"id": NUEVO, "comments_count": 2, "caption": "Clase", "permalink": "x"}
    with db_session:
        hist = LeadAudiencia(ig_usuario="prueba_conocido", media_id="777", comentario_id="dm:1",
                             creado_por="historia")
        hist.flush()
        LeadReel(lead_id=hist.id, media_id=NUEVO, comentario="Clase", comentario_id="c1")
    a._comentarios_de_reel("tok", "atv", m)
    with db_session:
        r = LeadReel.get(comentario_id="c1")
        assert LeadAudiencia[r.lead_id].creado_por != "historia"
    assert a.progreso_reel(NUEVO)["personas"] == 2
    assert a.reels_seguidos() is not None
