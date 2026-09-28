"""El pico de concurrentes y la retención se deducen de las horas de Zoom.

Zoom publica el pico en su dashboard en vivo, pero esa API pide plan Business. El
reporte de participantes —que sí viene con Pro— trae la hora de entrada y la de salida
de cada uno, y con eso el pico se calcula exacto. Estos tests son lo que sostiene esa
decisión: si se rompen, la única salida es pagar el plan de arriba.
"""

from datetime import datetime, timedelta

from src.services.zoom_services import conectados_en, pico_concurrentes

T0 = datetime(2026, 10, 1, 19, 0)


def m(desde, hasta):
    return (T0 + timedelta(minutes=desde), T0 + timedelta(minutes=hasta))


def test_el_pico_no_es_la_cantidad_de_asistentes():
    """Tres personas que nunca coinciden dan un pico de uno."""
    pico, _ = pico_concurrentes([m(0, 10), m(20, 30), m(40, 50)])
    assert pico == 1


def test_el_pico_cuenta_los_que_se_superponen():
    pico, cuando = pico_concurrentes([m(0, 60), m(5, 60), m(10, 15)])
    assert pico == 3
    assert cuando == T0 + timedelta(minutes=10)


def test_el_que_se_va_justo_cuando_otro_llega_no_suma():
    """Sin ordenar la salida antes que la entrada, este caso daría 2."""
    pico, _ = pico_concurrentes([m(0, 30), m(30, 60)])
    assert pico == 1


def test_sin_nadie_el_pico_es_cero():
    assert pico_concurrentes([]) == (0, None)


def test_retenidos_al_pitch_cuenta_los_de_ese_momento():
    tramos = [m(0, 60), m(0, 20), m(5, 90), m(50, 90)]
    # Al minuto 45 quedan los dos que se quedaron largo; el que se fue al 20 no, y el
    # que entró al 50 todavía no llegó.
    assert conectados_en(tramos, T0 + timedelta(minutes=45)) == 2


def test_el_borde_cuenta_como_adentro():
    """Quien entra justo cuando arranca el pitch estuvo en el pitch."""
    assert conectados_en([m(45, 90)], T0 + timedelta(minutes=45)) == 1
