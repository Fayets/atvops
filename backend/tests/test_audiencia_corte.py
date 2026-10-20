"""Calificado = puntaje 7 o más, también para lo que ya estaba analizado con el corte viejo."""

from src.services import audiencia_services as a


def test_el_corte_es_7():
    assert a._veredicto({"negocio": 7, "financiero": 7, "avatar": 7}, False) == ("calificado", 7.0)
    assert a._veredicto({"negocio": 6, "financiero": 7, "avatar": 7}, False)[0] == "no"   # 6,6
    assert a._veredicto({"negocio": 10, "financiero": 10, "avatar": 10}, True)[0] == "no"  # descarte manda


def test_lo_ya_analizado_se_lee_con_el_corte_nuevo():
    assert a._veredicto_vigente("calificado", 6.5) == "no"
    assert a._veredicto_vigente("tibio", 5.2) == "no"
    assert a._veredicto_vigente("tibio", 7.4) == "calificado"
    assert a._veredicto_vigente("calificado", 8.0) == "calificado"
    assert a._veredicto_vigente("no", 9.0) == "no"            # un descarte automático no se rehabilita
    assert a._veredicto_vigente("sin_analizar", None) == "sin_analizar"
