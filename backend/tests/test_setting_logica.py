"""
Tests de las cuentas del sistema del setter.

Trabajan sobre diccionarios, sin base: lo que se prueba es la aritmética, que es donde un
error se ve como un porcentaje creíble y nadie lo cuestiona.

El test que manda es `test_reproduce_los_numeros_de_setsystem`: son los números que Cris
venía mirando en SetSystem, con los leads que los produjeron. Si una definición cambia sin
querer —qué es un show, qué es un ciclo completo— ese test es el que lo grita.
"""

from datetime import date

import pytest

from src.services import setting_services as s

HOY = date(2026, 9, 18)


def pitch(**k):
    base = {"id": 1, "prospecto": "x", "pitchAt": "2026-09-15", "canal": "dm", "origen": "organico",
            "pitchEstado": "pendiente", "llamadaEstado": None, "llamadaAt": None, "reprogramadaAt": None,
            "seguimientos": 0, "cashUsd": 0, "valorUsd": 0}
    return s._derivados({**base, **k}, HOY)


def bloque(filas, desde=None, hasta=None):
    leads, calls = s._recorte(filas, desde, hasta)
    return s._bloque(leads, calls)


# ------------------------------------------------------------------ las cuatro tasas

def test_las_tasas_se_calculan_sobre_lo_resuelto():
    """El que todavía no contestó no cuenta como fallado: no está en el denominador."""
    filas = [
        pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="showed"),
        pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="closed"),
        pitch(pitchEstado="ghosted"),
        pitch(pitchEstado="pendiente"),
    ]
    m = bloque(filas)
    assert m["pitches"] == 4 and m["pitchesResueltos"] == 3 and m["pitchesPendientes"] == 1
    assert m["booking"] == round(2 / 3 * 100, 1)


def test_la_llamada_sin_resultado_no_entra_en_el_show_rate():
    """Ni la de mañana ni la de ayer: si nadie cargó qué pasó, no resolvió nada."""
    filas = [
        pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="showed"),
        pitch(pitchEstado="booked", llamadaAt="2026-09-25", llamadaEstado="scheduled"),
        pitch(pitchEstado="booked", llamadaAt="2026-09-10", llamadaEstado="scheduled"),
    ]
    m = bloque(filas)
    assert m["porOcurrir"] == 2 and m["llamadasResueltas"] == 1
    assert m["show"] == 100.0


def test_la_cancelada_cuenta_como_que_no_vino():
    """Avisar que no viene no es venir: baja el show rate igual que un no show."""
    filas = [pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="showed"),
             pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="cancelled")]
    m = bloque(filas)
    assert m["noShows"] == 1 and m["llamadasResueltas"] == 2 and m["show"] == 50.0


def test_el_deposito_es_show_pero_no_cierre():
    filas = [pitch(pitchEstado="booked", llamadaAt="2026-09-10", llamadaEstado="deposit")]
    m = bloque(filas)
    assert m["shows"] == 1 and m["cierres"] == 0 and m["depositos"] == 1


def test_el_setting_rate_va_sobre_los_ciclos_que_terminaron():
    """Dos cierres sobre cuatro pitches, pero uno tiene la call por delante: son tres ciclos."""
    filas = [
        pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="closed"),
        pitch(pitchEstado="booked", llamadaAt="2026-09-16", llamadaEstado="closed"),
        pitch(pitchEstado="ghosted"),
        pitch(pitchEstado="booked", llamadaAt="2026-09-30", llamadaEstado="scheduled"),
    ]
    m = bloque(filas)
    assert m["recorridosCompletos"] == 3
    assert m["setting"] == round(2 / 3 * 100, 1)


def test_la_reprogramacion_pisa_la_fecha_original():
    p = pitch(pitchEstado="booked", llamadaAt="2026-09-10", reprogramadaAt="2026-09-30",
              llamadaEstado="scheduled")
    assert p["fechaLlamada"] == "2026-09-30"


def test_la_agendada_vencida_se_marca_para_resolver():
    """Es la que hay que ir a cargar: la fecha ya pasó y sigue sin resultado."""
    assert pitch(pitchEstado="booked", llamadaAt="2026-09-10", llamadaEstado="scheduled")["vencida"]
    assert not pitch(pitchEstado="booked", llamadaAt="2026-09-30", llamadaEstado="scheduled")["vencida"]


def test_el_periodo_separa_el_pitch_de_la_call():
    """El booking se juzga el día del pitch; el show, el día de la llamada."""
    filas = [pitch(pitchAt="2026-08-20", pitchEstado="booked", llamadaAt="2026-09-02", llamadaEstado="showed")]
    m = bloque(filas, date(2026, 9, 1), date(2026, 9, 30))
    assert m["pitches"] == 0        # el pitch fue en agosto
    assert m["shows"] == 1          # la llamada, en septiembre


# ------------------------------------------------------------------ dónde conviene trabajar

def test_donde_conviene_ordena_por_cierres_ganados_no_por_peor_tasa():
    """Una etapa mala sobre pocos leads mueve menos que una mediocre sobre muchos."""
    filas = ([pitch(pitchEstado="booked", llamadaAt="2026-09-10", llamadaEstado="showed") for _ in range(20)]
             + [pitch(pitchEstado="booked", llamadaAt="2026-09-10", llamadaEstado="closed")])
    d = s._donde_conviene(bloque(filas))
    # Close rate es 1/21 (pésimo) y booking 100%: la etapa que más suma es el cierre.
    assert d["mejor"] == "close"
    assert d["etapas"][0]["consejo"].startswith("Llegan a la call")


def test_donde_conviene_sin_datos_no_inventa_una_etapa():
    assert s._donde_conviene(bloque([])) is None


# ------------------------------------------------------------------ plata

def test_el_cierre_sin_monto_no_baja_el_ticket_promedio():
    filas = [pitch(pitchEstado="booked", llamadaEstado="closed", valorUsd=5000, cashUsd=1500),
             pitch(pitchEstado="booked", llamadaEstado="closed")]
    c = s._cash(filas)
    assert c["revenue"] == 5000 and c["cobrado"] == 1500 and c["porCobrar"] == 3500
    assert c["ticket"] == 5000 and c["sinMonto"] == 1


def test_los_cobros_listan_lo_que_falta():
    filas = [pitch(pitchEstado="booked", llamadaEstado="deposit", valorUsd=5000, cashUsd=1000,
                   cierreAt="2026-09-10")]
    assert s._cash(filas)["cobros"][0]["falta"] == 4000


# ------------------------------------------------------------------ qué tan firmes son los números

def test_con_pocos_datos_la_diferencia_no_es_concluyente():
    org = {"agendas": 3, "pitchesResueltos": 4, "shows": 0, "llamadasResueltas": 0, "cierres": 0}
    ads = {"agendas": 1, "pitchesResueltos": 4, "shows": 0, "llamadasResueltas": 0, "cierres": 0}
    booking = s._confianza(org, ads)[0]
    assert booking["concluyente"] is False
    assert booking["necesarios"] > 10        # harían falta muchos más por fuente


def test_con_muchos_datos_la_misma_diferencia_si_lo_es():
    org = {"agendas": 300, "pitchesResueltos": 400, "shows": 0, "llamadasResueltas": 0, "cierres": 0}
    ads = {"agendas": 100, "pitchesResueltos": 400, "shows": 0, "llamadasResueltas": 0, "cierres": 0}
    assert s._confianza(org, ads)[0]["concluyente"] is True


def test_dos_fuentes_iguales_no_piden_mas_datos():
    org = ads = {"agendas": 5, "pitchesResueltos": 10, "shows": 0, "llamadasResueltas": 0, "cierres": 0}
    assert s._confianza(org, ads)[0]["necesarios"] is None


# ------------------------------------------------------------------ el mes real de Cris

# La semana del 14 al 20 de septiembre tal como estaba en SetSystem: los doce pitches de
# esos días más tres calls que caen adentro pero se pitchearon antes.
SEMANA = [
    ("Manuel Conralis", "2026-09-10", "2026-09-15", "deposit"), ("Nico", "2026-09-13", "2026-09-14", "showed"),
    ("Claudio", "2026-09-13", "2026-09-15", "showed"), ("Dani", "2026-09-14", "2026-09-15", "deposit"),
    ("Laura", "2026-09-14", "2026-09-15", "closed"), ("Jessica", "2026-09-14", "2026-09-16", "showed"),
    ("Ignacio Mansur", "2026-09-15", "2026-09-16", "showed"), ("Jose", "2026-09-15", "2026-09-16", "closed"),
    ("Guadalupe", "2026-09-15", "2026-09-16", "showed"), ("Karina", "2026-09-15", "2026-09-21", "scheduled"),
    ("Juan Felipe", "2026-09-16", "2026-09-17", "scheduled"), ("Santiago", "2026-09-16", "2026-09-17", "scheduled"),
    ("Kevin Serna", "2026-09-16", "2026-09-18", "cancelled"), ("Axel Bialet", "2026-09-17", "2026-09-19", "scheduled"),
    ("tincho", "2026-09-17", "2026-09-19", "scheduled"),
]


def test_reproduce_los_numeros_de_setsystem():
    """Semana del 14 al 20 de septiembre: booking 100% 12/12, show 90% 9/10, close 22% 2/9,
    setting 29% 2/7, y 4 calls por ocurrir. Son los mismos que mostraba SetSystem."""
    filas = [pitch(id=i, prospecto=n, pitchAt=p, llamadaAt=c, pitchEstado="booked", llamadaEstado=e)
             for i, (n, p, c, e) in enumerate(SEMANA)]
    m = bloque(filas, date(2026, 9, 14), date(2026, 9, 20))
    assert (m["pitches"], m["pitchesResueltos"], m["agendas"]) == (12, 12, 12)
    assert m["booking"] == 100.0
    assert (m["shows"], m["llamadasResueltas"]) == (9, 10)
    assert m["show"] == 90.0
    assert (m["cierres"], m["shows"]) == (2, 9)
    assert m["close"] == round(2 / 9 * 100, 1)
    assert (m["cierresDelPitch"], m["recorridosCompletos"]) == (2, 7)
    assert m["setting"] == round(2 / 7 * 100, 1)
    assert m["porOcurrir"] == 4
    assert m["depositos"] == 2


def test_las_semanas_terminan_en_la_del_dia_de_corte():
    sem = s._semanas_de([pitch(pitchAt="2026-09-15")], HOY, cuantas=3)
    assert [w["semana"] for w in sem] == ["2026-08-31", "2026-09-07", "2026-09-14"]
    assert sem[-1]["pitches"] == 1


# ------------------------------------------------------------------ validación al guardar

def test_limpiar_agendar_pone_fecha_y_llamada_programada():
    limpio = s._limpiar({"pitchEstado": "booked"})
    assert limpio["agendoAt"] == s.hoy_ar() and limpio["llamadaEstado"] == "scheduled"


def test_limpiar_un_resultado_de_llamada_implica_agenda():
    limpio = s._limpiar({"llamadaEstado": "closed"}, {"pitchEstado": "pendiente"})
    assert limpio["pitchEstado"] == "booked" and limpio["cierreAt"] == s.hoy_ar()


def test_limpiar_rechaza_estados_inventados():
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
    assert vuelta["id"] == "seed-0" and vuelta["call_status"] == "no_show"
