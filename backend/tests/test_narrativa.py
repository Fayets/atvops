"""
Tests de la revisión semanal de la narrativa.

Lo que duele si se rompe: que entre un cambio sin una pieza de la semana que lo sostenga,
que una frase inventada pase como de Juan, o que aceptar un cambio pise una línea que
alguien ya editó a mano.
"""

from datetime import date

import pytest
from fastapi import HTTPException

from src.services import narrativa_services as n

NARRATIVA = """ATV vende implementación, no información.
La comunicación es B2B: se le habla al dueño del negocio.
Juan escaló de $30k a $200k/mes."""

SEMANA = {
    "reels": [{"ref": "reel:1", "fecha": "2026-10-13", "texto": "Hoy hacemos $250k/mes con 6 personas y sin depender de mí."}],
    "youtube": [{"ref": "youtube:abc", "fecha": "2026-10-14", "texto": "el arte de trabajar menos\nte explico cómo aplicarlo"}],
    "historias": [{"ref": "historia:9", "fecha": "2026-10-15", "foto": "/tmp/9.jpg"}],
}


def test_la_semana_pasada_va_de_lunes_a_domingo():
    assert n.semana_anterior(date(2026, 10, 22)) == (date(2026, 10, 12), date(2026, 10, 18))
    assert n.semana_anterior(date(2026, 10, 19)) == (date(2026, 10, 12), date(2026, 10, 18))


def test_un_cambio_con_su_frase_textual_entra():
    data = {"cambios": [{"accion": "cambiar", "linea_actual": "Juan escaló de $30k a $200k/mes.",
                         "linea_nueva": "Juan escaló de $30k a $250k/mes.", "motivo": "subió la cifra",
                         "evidencias": [{"ref": "reel:1", "cita": "hoy hacemos $250k/mes con 6 personas"}]}]}
    c = n.validar(data, NARRATIVA, SEMANA)
    assert len(c) == 1 and c[0]["evidencias"][0]["verificada"] is True


def test_una_frase_que_no_esta_en_el_reel_no_sostiene_nada():
    data = {"cambios": [{"accion": "agregar", "linea_nueva": "Juan vende cursos.",
                         "evidencias": [{"ref": "reel:1", "cita": "vendo cursos grabados"}]}]}
    assert n.validar(data, NARRATIVA, SEMANA) == []


def test_una_pieza_que_no_es_de_la_semana_no_cuenta():
    data = {"cambios": [{"accion": "agregar", "linea_nueva": "Algo nuevo.",
                         "evidencias": [{"ref": "reel:999", "cita": "Hoy hacemos $250k/mes"}]}]}
    assert n.validar(data, NARRATIVA, SEMANA) == []


def test_de_una_historia_se_acepta_la_pieza_pero_la_frase_queda_sin_verificar():
    data = {"cambios": [{"accion": "agregar", "linea_nueva": "Trabajar menos es la meta.",
                         "evidencias": [{"ref": "historia:9", "cita": "trabajo 4 horas"}]}]}
    c = n.validar(data, NARRATIVA, SEMANA)
    assert c[0]["evidencias"][0]["verificada"] is False


def test_no_se_cambia_una_linea_que_no_existe():
    data = {"cambios": [{"accion": "quitar", "linea_actual": "Una línea que nunca estuvo.",
                         "evidencias": [{"ref": "reel:1", "cita": "Hoy hacemos $250k/mes"}]}]}
    assert n.validar(data, NARRATIVA, SEMANA) == []


def test_aplicar_cambia_quita_y_agrega_linea_por_linea():
    t = n.aplicar(NARRATIVA, {"accion": "cambiar", "linea_actual": "juan escalo de $30k a $200k/mes", "linea_nueva": "Juan escaló a $250k/mes."})
    assert t.splitlines()[2] == "Juan escaló a $250k/mes."
    t = n.aplicar(t, {"accion": "quitar", "linea_actual": "La comunicación es B2B: se le habla al dueño del negocio."})
    assert len(t.splitlines()) == 2
    t = n.aplicar(t, {"accion": "agregar", "linea_nueva": "Trabajar menos."})
    assert t.splitlines()[-1] == "Trabajar menos."


def test_aceptar_un_cambio_sobre_una_linea_editada_a_mano_no_pisa_nada():
    with pytest.raises(HTTPException) as e:
        n.aplicar(NARRATIVA, {"accion": "cambiar", "linea_actual": "Una línea que ya no está.", "linea_nueva": "x"})
    assert e.value.status_code == 409
