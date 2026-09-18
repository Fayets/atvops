"""
Tests de las cuentas del sistema del setter: tasas, embudo y "dónde conviene trabajar".

Trabajan sobre diccionarios, sin base: lo que se prueba es la aritmética, que es donde
un error se ve como un porcentaje creíble y nadie lo cuestiona.
"""

from datetime import date

from src.services import setting_services as s

HOY = date(2026, 9, 18)


def pitch(**k):
    base = {"id": 1, "prospecto": "x", "pitchAt": "2026-09-15", "canal": "dm", "origen": "organico",
            "pitchEstado": "pendiente", "llamadaEstado": None, "llamadaAt": None, "reprogramadaAt": None,
            "cashUsd": 0, "valorUsd": 0}
    return {**base, **k}


def test_las_cuatro_tasas():
    filas = [
        pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="showed"),
        pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="closed", cashUsd=1500),
        pitch(pitchEstado="booked", llamadaAt="2026-09-17", llamadaEstado="no_show"),
        pitch(pitchEstado="ghosted"),
    ]
    m = s._metricas_de(filas, HOY)
    assert (m["pitches"], m["agendas"], m["shows"], m["cierres"]) == (4, 3, 2, 1)
    assert m["booking"] == 75.0
    assert m["show"] == round(2 / 3 * 100, 1)
    assert m["close"] == 50.0
    assert m["setting"] == 25.0
    assert m["cashUsd"] == 1500


def test_las_llamadas_por_ocurrir_no_bajan_el_show_rate():
    """Una agenda para mañana todavía no es un no-show."""
    filas = [
        pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="showed"),
        pitch(pitchEstado="booked", llamadaAt="2026-09-25", llamadaEstado="scheduled"),
    ]
    m = s._metricas_de(filas, HOY)
    assert m["porOcurrir"] == 1
    assert m["show"] == 100.0


def test_la_reprogramacion_pisa_la_fecha_original():
    filas = [pitch(pitchEstado="booked", llamadaAt="2026-09-10", reprogramadaAt="2026-09-30", llamadaEstado="scheduled")]
    m = s._metricas_de(filas, HOY)
    assert m["porOcurrir"] == 1
    assert m["sinResolver"] == 0


def test_una_llamada_pasada_sin_resultado_queda_sin_resolver():
    filas = [pitch(pitchEstado="booked", llamadaAt="2026-09-10", llamadaEstado="scheduled")]
    m = s._metricas_de(filas, HOY)
    assert m["sinResolver"] == 1
    assert m["porOcurrir"] == 0


def test_el_deposito_es_show_pero_no_cierre():
    filas = [pitch(pitchEstado="booked", llamadaAt="2026-09-10", llamadaEstado="deposit")]
    m = s._metricas_de(filas, HOY)
    assert m["shows"] == 1 and m["cierres"] == 0 and m["depositos"] == 1


def test_el_periodo_recorta_por_la_fecha_del_pitch():
    filas = [pitch(pitchAt="2026-08-20", pitchEstado="booked", llamadaAt="2026-09-02", llamadaEstado="showed"),
             pitch(pitchAt="2026-09-02", pitchEstado="ghosted")]
    m = s._metricas_de(filas, HOY, date(2026, 9, 1), date(2026, 9, 30))
    assert m["pitches"] == 1 and m["agendas"] == 0


def test_el_filtro_por_canal():
    filas = [pitch(canal="dm"), pitch(canal="phone"), pitch(canal="hibrido")]
    assert s._metricas_de(filas, HOY, canal="phone")["pitches"] == 1
    assert s._metricas_de(filas, HOY)["porCanal"] == {"dm": 1, "phone": 1, "hibrido": 1}


def test_donde_conviene_trabajar_apunta_a_la_peor_brecha():
    # Booking 50% (sano), show 50% (rojo, brecha 30), close 100%.
    filas = [pitch(pitchEstado="booked", llamadaAt="2026-09-10", llamadaEstado="closed"),
             pitch(pitchEstado="booked", llamadaAt="2026-09-10", llamadaEstado="no_show"),
             pitch(pitchEstado="ghosted"), pitch(pitchEstado="denied")]
    m = s._metricas_de(filas, HOY)
    assert m["peorEtapa"] == "show"
    show = next(e for e in m["dondeConviene"] if e["id"] == "show")
    assert show["perdidos"] == 1
    # +10 puntos de show sobre 2 llamadas ocurridas, con close del 100%: 0.2 cierres más.
    assert show["masDiez"] == 0.2


def test_semanas_termina_en_la_semana_de_hoy():
    sem = s._semanas_de([pitch(pitchAt="2026-09-15")], HOY, cuantas=3)
    assert [w["semana"] for w in sem] == ["2026-08-31", "2026-09-07", "2026-09-14"]
    assert sem[-1]["pitches"] == 1


def test_limpiar_agendar_pone_fecha_y_llamada_programada():
    limpio = s._limpiar({"pitchEstado": "booked"})
    assert limpio["pitchEstado"] == "booked"
    assert limpio["agendoAt"] == s.hoy_ar()
    assert limpio["llamadaEstado"] == "scheduled"


def test_limpiar_un_resultado_de_llamada_implica_agenda():
    limpio = s._limpiar({"llamadaEstado": "closed"}, {"pitchEstado": "pendiente"})
    assert limpio["pitchEstado"] == "booked"
    assert limpio["cierreAt"] == s.hoy_ar()


def test_limpiar_rechaza_estados_inventados():
    import pytest

    with pytest.raises(ValueError):
        s._limpiar({"llamadaEstado": "vino"})
    with pytest.raises(ValueError):
        s._limpiar({"canal": "telegram"})


def test_ida_y_vuelta_con_setsystem():
    lead = {"id": "seed-0", "name": "Maholy", "pitch_date": "2026-08-17", "booked_on": "2026-08-17",
            "booked_for": "2026-08-18", "rescheduled_for": None, "reschedule_count": 0, "pitch_status": "booked",
            "call_status": "no_show", "close_date": None, "follow_ups": 0, "notes": "", "deal_value": 0,
            "cash_collected": 0, "calls": 0, "channel": "dm", "email": None, "number": None,
            "username": "@maholy", "source": "ads"}
    p = s.desde_setsystem(lead)
    assert p["externoId"] == "seed-0" and p["usuarioIg"] == "maholy" and p["llamadaEstado"] == "no_show"
    vuelta = s.a_setsystem({**p, "id": 9, "creadoAt": None, "actualizadoAt": None})
    assert vuelta["id"] == "seed-0" and vuelta["call_status"] == "no_show" and vuelta["pitch_status"] == "booked"
