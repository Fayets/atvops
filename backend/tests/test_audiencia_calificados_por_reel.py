"""El % de calificados que la vista Reels muestra al pie de cada pieza."""

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import audiencia_services as a

UNO, OTRO = "777001", "777002"


@pytest.fixture()
def base():
    if db.provider is None:
        init_db()
    from src.models import AjusteAudiencia, LeadAudiencia, LeadReel

    def limpiar():
        with db_session:
            for clave in (f"seguir:{UNO}", f"seguir:{OTRO}"):
                f = AjusteAudiencia.get(clave=clave)
                if f:
                    f.delete()
            ids = [x.id for x in list(LeadAudiencia.select()) if x.ig_usuario.startswith("cal_")]
            for r in list(LeadReel.select()):
                if r.lead_id in ids or r.media_id in (UNO, OTRO):
                    r.delete()
            for x in list(LeadAudiencia.select()):
                if x.id in ids:
                    x.delete()
    limpiar()
    yield
    limpiar()


def test_cuenta_los_de_su_reel_y_los_que_vinieron_de_otro(base):
    from src.models import LeadAudiencia, LeadReel
    with db_session:
        LeadAudiencia(ig_usuario="cal_a", media_id=UNO, creado_por="instagram",
                      veredicto="calificado", puntaje=8.0, analizado_at=a.datetime.utcnow())
        LeadAudiencia(ig_usuario="cal_b", media_id=UNO, creado_por="instagram",
                      veredicto="no", puntaje=2.0, analizado_at=a.datetime.utcnow())
        LeadAudiencia(ig_usuario="cal_c", media_id=UNO, creado_por="instagram")  # sin analizar
        viejo = LeadAudiencia(ig_usuario="cal_d", media_id=OTRO, creado_por="instagram",
                              veredicto="calificado", puntaje=9.0, analizado_at=a.datetime.utcnow())
        viejo.flush()
        LeadReel(lead_id=viejo.id, media_id=UNO, comentario="Clase", comentario_id="cal-1")
    a.seguir_reel(UNO, por="franco")

    r = a.calificados_por_reel([UNO, OTRO, "no_existe"])
    # 4 personas, 3 analizadas (una sin analizar no entra al porcentaje), 2 calificadas
    assert r[UNO] == {"personas": 4, "analizados": 3, "calificados": 2, "pct": 66.7, "seguido": True}
    assert r[OTRO]["personas"] == 1 and r[OTRO]["seguido"] is False
    assert r["no_existe"] == {"personas": 0, "analizados": 0, "calificados": 0, "pct": None,
                              "seguido": False}


def test_sin_reels_no_pregunta_nada(base):
    assert a.calificados_por_reel([]) == {}
