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


def test_una_campania_al_perfil_es_follow_me_y_el_resto_respuesta_directa():
    assert c.tipo_de([{"destination_type": "INSTAGRAM_PROFILE", "optimization_goal": "PROFILE_VISIT"}]) == "fm"
    assert c.tipo_de([{"destination_type": "WEBSITE", "optimization_goal": "LEAD_GENERATION"}]) == "dr"
    assert c.tipo_de([]) == "dr"


def test_los_unfollows_alertan_recien_al_tercer_dia_seguido_arriba_del_50_por_ciento():
    dias = _dias("2026-11-01", [(30, 80), (30, 75), (30, 72)])
    assert c.alerta_dejan(dias, 47.6) == {"base": 47.6, "limite": 71.4, "racha": 3, "activa": True}
    dos = _dias("2026-11-01", [(30, 40), (30, 75), (30, 72)])
    assert c.alerta_dejan(dos, 47.6)["activa"] is False
    # un mal día en el medio no deja una alerta prendida
    corta = _dias("2026-11-01", [(30, 90), (30, 90), (30, 90), (30, 50)])
    assert c.alerta_dejan(corta, 47.6)["racha"] == 0


def test_las_celdas_de_la_cohorte_quedan_vacias_hasta_que_cierra_su_ventana():
    from datetime import date
    dias = _dias("2026-11-01", [(10, 0)] * 30)
    fuentes = {"chats": {"2026-11-03": 4, "2026-11-20": 2, "2026-11-23": 9}, "pitches": {}, "agendas": {}, "cashUsd": {}}
    filas = c.cohortes(dias, date(2026, 11, 1), date(2026, 11, 23), fuentes)
    assert [f["desde"] for f in filas] == ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22"]
    primera = filas[0]
    assert primera["seguidores"] == 70 and primera["completa"] is True
    # chats: la semana más dos = del 1 al 21 inclusive; el 22 ya cerró esa ventana
    assert primera["chats"] == 6 and primera["chatsListaEl"] is None
    assert primera["pitches"] is None and primera["pitchesListaEl"] == "2026-11-29"
    ultima = filas[-1]
    assert ultima["seguidores"] == 10 and ultima["completa"] is False and ultima["chats"] is None


def test_el_porcentaje_de_calificados_se_compara_contra_las_cuatro_semanas_de_antes():
    from datetime import date
    leads = [(datetime(2026, 10, 10), "calificado"), (datetime(2026, 10, 12), "no"),
             (datetime(2026, 10, 20), "no"), (datetime(2026, 10, 25), "no"),
             (datetime(2026, 11, 1), "calificado"), (datetime(2026, 11, 2), "no"),
             (datetime(2026, 9, 1), "calificado")]  # fuera de la base: más de 4 semanas antes
    r = c.tasa_calificados(leads, date(2026, 10, 31), date(2026, 11, 2))
    assert r["campania"] == {"analizados": 2, "calificados": 1, "pct": 50.0, "suficiente": False}
    assert r["base"] == {"analizados": 4, "calificados": 1, "pct": 25.0, "suficiente": False}
    # con 30 analizados ya se puede juzgar contra la meta
    muchos = [(datetime(2026, 11, 1), "no")] * 30
    assert c.tasa_calificados(muchos, date(2026, 10, 31), date(2026, 11, 2))["campania"]["suficiente"] is True


def test_el_delta_de_seguidores_se_mide_contra_la_ultima_foto_de_antes():
    from src.services.seguidores_vivo_services import delta_desde
    fotos = [{"at": datetime(2026, 11, 2, 2, 50), "total": 70400},
             {"at": datetime(2026, 11, 2, 3, 10), "total": 70410},
             {"at": datetime(2026, 11, 3, 1, 0), "total": 70455}]
    medianoche_ar = datetime(2026, 11, 2, 3, 0)  # 00:00 en Argentina
    assert delta_desde(fotos, medianoche_ar, 70455) == 55
    # sin fotos de antes, contra la primera de después
    assert delta_desde(fotos[1:], medianoche_ar, 70455) == 45
    assert delta_desde([], medianoche_ar, 70455) is None
