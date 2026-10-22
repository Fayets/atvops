"""Cómo titula Juan: el arranque de un reel es su primera línea con texto, no el CTA."""

from src.services import titulos_juan_services as t


def test_el_titulo_del_reel_es_su_primera_linea():
    assert t.titulo_de_reel("entender esto me hizo $200k/mes.\n\nel problema es…") == "entender esto me hizo $200k/mes."
    assert t.titulo_de_reel("\n#atv\ncomenta “INFO” y te lo mando\nmis onboardings hacen que…") == "mis onboardings hacen que…"
    assert t.titulo_de_reel("") == ""


def test_las_vistas_salen_de_la_metrica_que_haya():
    assert t._vistas('{"views": 1200, "reach": 900}', "views", "reach") == 1200
    assert t._vistas('{"reach": 900}', "views", "reach") == 900
    assert t._vistas("no es json", "views") == 0


def test_las_historias_que_cuentan_son_las_secuencias_con_cta(monkeypatch):
    from datetime import date

    from src.services import instagram_services

    lista = [{"titulo": f"t{i}", "fecha": date(2026, 9, i + 1)} for i in range(15)]
    monkeypatch.setattr(instagram_services, "cta_marcadas", lambda: {f"2026-09-{d:02d}" for d in range(1, 12)})
    assert len(t._de_secuencias_con_cta(lista)) == 11
    monkeypatch.setattr(instagram_services, "cta_marcadas", lambda: {"2026-09-01"})
    assert len(t._de_secuencias_con_cta(lista)) == 15   # pocas marcadas: van todas
