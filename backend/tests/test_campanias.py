from datetime import datetime, timedelta, timezone

from src.services import campanias_services as c

AR = timezone(timedelta(hours=-3))


def _creativo(id_, gasto, res, hook=0.35, frec=1.0):
    return {"id": id_, "gastoUsd": gasto, "resultados": res,
            "costoResultadoUsd": round(gasto / res, 2) if res else None, "hook": hook, "frecuencia": frec}


def test_el_mas_barato_que_frena_el_scroll_se_escala_y_el_resto_se_mantiene():
    v = {x["id"]: x["veredicto"] for x in c.veredictos([
        _creativo("tareas", 32.0, 166, hook=0.385), _creativo("cris", 39.3, 166, hook=0.23)])}
    assert v == {"tareas": "escalar", "cris": "mantener"}


def test_el_mas_barato_con_mal_hook_no_se_escala():
    v = {x["id"]: x["veredicto"] for x in c.veredictos([_creativo("a", 20, 100, hook=0.2), _creativo("b", 30, 100)])}
    assert v["a"] == "mantener"


def test_se_pausa_el_que_cuesta_una_vez_y_media_o_el_quemado():
    v = {x["id"]: x["veredicto"] for x in c.veredictos([
        _creativo("bueno", 20, 100), _creativo("caro", 30, 100), _creativo("quemado", 21, 100, frec=1.7)])}
    assert v == {"bueno": "escalar", "caro": "pausar", "quemado": "pausar"}


def test_con_poco_gasto_o_sin_resultados_todavia_no_hay_veredicto():
    v = {x["id"]: x["veredicto"] for x in c.veredictos([_creativo("nuevo", 3, 10), _creativo("seco", 15, 0)])}
    assert v == {"nuevo": "juntando datos", "seco": "juntando datos"}


def test_una_imagen_sin_hook_se_escala_si_es_la_mas_barata():
    v = c.veredictos([_creativo("img", 20, 100, hook=None), _creativo("video", 25, 100)])
    assert v[0]["veredicto"] == "escalar"


def test_una_campania_al_perfil_se_mide_por_visitas_y_no_por_leads():
    mide = c.que_mide("OUTCOME_TRAFFIC", "INSTAGRAM_PROFILE")
    n = c.numeros({"spend": "32.01", "impressions": "7479", "frequency": "1.02",
                   "actions": [{"action_type": "link_click", "value": "163"},
                               {"action_type": "video_view", "value": "2879"},
                               {"action_type": "onsite_conversion.post_save", "value": "35"}],
                   "video_p25_watched_actions": [{"action_type": "video_view", "value": "214"}]}, mide)
    assert mide["clave"] == "visitas"
    assert n["resultados"] == 163 and n["costoResultadoUsd"] == 0.2
    assert round(n["hook"], 3) == 0.385 and round(n["retencion25"], 3) == 0.074 and n["guardados"] == 35


def _dias(desde, valores):
    d0 = datetime.fromisoformat(desde).date()
    return [{"fecha": (d0 + timedelta(days=i)).isoformat(), "siguen": s, "dejan": d} for i, (s, d) in enumerate(valores)]


def test_los_seguidores_extra_se_cuentan_contra_los_dias_de_antes_y_sin_el_dia_del_arranque():
    # Arranca el 31 a la noche: el 31 no cuenta para ningún lado; se mide desde el 1.
    dias = _dias("2026-10-24", [(30, 50)] * 7 + [(23, 50), (34, 65)])
    r = c.seguidores_extra(dias, datetime(2026, 10, 31, 21, 26, tzinfo=AR), {"2026-11-01": 52.5})
    assert r["base"]["siguen"] == 30 and r["base"]["dias"] == 7
    assert r["desde"] == "2026-11-01" and r["medidos"] == 1
    assert r["extra"] == 4 and r["costoExtraUsd"] == 13.12


def test_si_arranca_a_la_manana_ese_dia_ya_cuenta():
    dias = _dias("2026-10-25", [(30, 50)] * 6 + [(40, 50)])
    r = c.seguidores_extra(dias, datetime(2026, 10, 31, 9, 0, tzinfo=AR), {"2026-10-31": 20.0})
    assert r["desde"] == "2026-10-31" and r["extra"] == 10 and r["costoExtraUsd"] == 2.0


def test_si_no_suma_seguidores_no_hay_costo_por_seguidor():
    dias = _dias("2026-10-25", [(30, 50)] * 6 + [(25, 50)])
    r = c.seguidores_extra(dias, datetime(2026, 10, 31, 9, 0, tzinfo=AR), {"2026-10-31": 20.0})
    assert r["extra"] == -5 and r["costoExtraUsd"] is None


def test_sin_dias_cerrados_desde_el_arranque_no_se_calcula_nada():
    dias = _dias("2026-10-25", [(30, 50)] * 6)
    r = c.seguidores_extra(dias, datetime(2026, 10, 31, 21, 0, tzinfo=AR), {})
    assert r["medidos"] == 0 and r["extra"] is None
