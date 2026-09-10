"""
Tests de la lógica de ventas que no toca ninguna base.

Cubren las reglas que sostienen los números del tablero: cómo se clasifica una llamada,
qué es una agenda y qué es un seguimiento, cómo se limpian los duplicados del CRM y
cómo se lee el nombre del prospecto en un título del calendario.
"""

from datetime import datetime

import pytest

from src.services import gcal_services as g
from src.services import ventas_services as v

AHORA = datetime(2026, 9, 10, 12, 0)
AYER = datetime(2026, 9, 9, 10, 0)
MANANA = datetime(2026, 9, 11, 10, 0)


def fila(nombre, call, resultado="", **extra):
    base = {"id": extra.pop("id", 1), "nombre": nombre, "email": "", "call": call,
            "resultado": resultado, "calificacion": "", "pago": 0, "debe": 0}
    base.update(extra)
    return base


# ------------------------------------------------------------------ _clasificar

@pytest.mark.parametrize("resultado, esperado", [
    ("cerrado", "cierre"),
    ("seña", "cierre"),
    ("sena", "cierre"),
    ("no show", "no_show"),
    ("cancelada", "no_show"),
    ("seguimiento", "show"),
    ("descalificado", "show"),
    ("re-agenda", "show"),
    ("descartada", "descartada"),
    ("no corresponde", "descartada"),
])
def test_clasificar_por_resultado(resultado, esperado):
    assert v._clasificar(resultado, "", AYER, AHORA) == esperado


def test_llamada_pasada_sin_resultado_es_deuda_del_closer():
    assert v._clasificar("", "", AYER, AHORA) == "sin_reportar"


def test_llamada_futura_es_agendada_aunque_traiga_resultado_viejo():
    # El sync de atv-mkt le mueve la fecha a la llamada vieja: el resultado no es de esta.
    assert v._clasificar("descalificado", "", MANANA, AHORA) == "agendado"


def test_solo_calendario_y_duplicada_tienen_su_clase():
    assert v._clasificar("", "", AYER, AHORA, solo_calendario=True) == "sin_crm"
    assert v._clasificar("cerrado", "", AYER, AHORA, duplicada=True) == "duplicada"


# ------------------------------------------------------------------ _bloque

def test_bloque_separa_cierres_de_senas_y_cuenta_toda_reunion_como_agenda():
    leads = [
        fila("A", AYER, "cerrado", pago=5000),
        fila("B", AYER, "seña", pago=200),
        fila("C", AYER, "seguimiento"),
        fila("D", AYER, "no show"),
        fila("E", AYER, "seguimiento", seguimiento=True),   # segunda reunión de E
        fila("F", AYER, "descartada"),
    ]
    b = v._bloque(leads, AHORA)
    assert b["reuniones"] == 5                 # la descartada no cuenta para nada
    assert b["seguimientos"] == 1
    assert b["agendados"] == 5                 # la segunda vuelta también se agendó
    assert b["shows"] == 4                     # cerrado, seña, seguimiento, seguimiento
    assert b["noShows"] == 1
    assert b["cierres"] == 1 and b["senas"] == 1 and b["ventas"] == 2
    assert b["cashUsd"] == 5200               # la seña suma cash aunque no sea cierre
    assert b["closeRate"] == 25.0              # 1 cerrado sobre 4 shows
    assert b["showRate"] == 80.0               # 4 de 5 evaluables


def test_bloque_vacio_no_divide_por_cero():
    b = v._bloque([], AHORA)
    assert b["showRate"] is None and b["closeRate"] is None and b["averageSaleUsd"] == 0


# ------------------------------------------------------------------ nombres

@pytest.mark.parametrize("titulo, nombre, segunda", [
    ("Fulano and Aumenta Tu Valor", "Fulano", False),
    ("2da reu Pablo Ingratta and Aumenta Tu Valor", "Pablo Ingratta", True),
    ("2da reunion Alejandro Cross and Aumenta Tu Valor", "Alejandro Cross", True),
    ("Alejandro & Aumenta Tu Valor", "Alejandro", False),
    ("Aumenta Tu Valor & Michael", "Michael", False),
    ("Rodrigo Soler y Aumenta Tu Valor", "Rodrigo Soler", False),
])
def test_prospecto_desde_el_titulo(titulo, nombre, segunda):
    assert g._prospecto(titulo) == (nombre, segunda)


def test_clave_persona_iguala_variantes_del_crm_y_del_calendario():
    assert v._clave_persona("Martin  and Aumenta Tu Valor") == v._clave_persona("Martin")
    assert v._clave_persona("2da reu DANILO  and Aumenta Tu Valor") == v._clave_persona("Danilo")


# ------------------------------------------------------------------ duplicados

def test_duplicados_dejan_la_fila_con_resultado():
    a = fila("Martin", AYER, "seguimiento", id=1)
    b = fila("Martin  and Aumenta Tu Valor", AYER, "agendado", id=2, eventoId="ev1", segunda=False)
    v._marcar_duplicados([a, b])
    assert not a.get("duplicada") and b.get("duplicada")
    assert a["eventoId"] == "ev1"              # la que queda hereda la reunión del calendario


def test_dos_reuniones_del_mismo_prospecto_a_distinta_hora_no_son_duplicado():
    a = fila("Juan", datetime(2026, 9, 8, 9, 0), "seña", id=1)
    b = fila("Juan", datetime(2026, 9, 8, 20, 0), "no show", id=2)
    v._marcar_duplicados([a, b])
    assert not a.get("duplicada") and not b.get("duplicada")


# ------------------------------------------------------------------ seguimientos

def test_seguimiento_es_toda_reunion_posterior_a_la_primera(monkeypatch):
    monkeypatch.setattr(v, "_primera_reunion_de_cada_uno", lambda: {v._clave_persona("Danilo"): datetime(2026, 8, 20, 10, 0)})
    sep3 = fila("DANILO", datetime(2026, 9, 3, 14, 0), "descalificado", id=1)
    sep11 = fila("DANILO", datetime(2026, 9, 11, 13, 0), "", id=2)
    nuevo = fila("Alguien Nuevo", datetime(2026, 9, 5, 9, 0), "", id=3)
    v._marcar_seguimientos([sep3, sep11, nuevo])
    assert sep3["seguimiento"] and sep11["seguimiento"]   # Danilo ya tuvo una en agosto
    assert nuevo["seguimiento"] is False                  # su primera reunión


# ------------------------------------------------------------------ zona horaria

def test_el_crm_guarda_utc_y_se_muestra_en_argentina():
    assert v._a_argentina(datetime(2026, 9, 3, 0, 0)) == datetime(2026, 9, 2, 21, 0)
    assert v._a_utc(datetime(2026, 9, 2, 21, 0)) == datetime(2026, 9, 3, 0, 0)
    assert v._a_argentina(None) is None


# ------------------------------------------------------------------ Pony

def test_las_altas_usan_el_flush_del_modulo_no_el_de_la_sesion():
    """`db_session` no tiene `flush`: llamarlo así rompía el alta de una reunión.

    Se necesita el flush para leer el id recién asignado antes de cerrar la sesión, así
    que el import tiene que traerlo del módulo de Pony.
    """
    import inspect

    for fn in (v.crear_lead_desde_calendario, v.crear_llamada_manual):
        codigo = inspect.getsource(fn)
        assert "db_session.flush()" not in codigo, f"{fn.__name__} usa el flush de la sesión"
        if "flush()" in codigo:
            assert "import db_session, flush" in codigo, f"{fn.__name__} no importa flush de pony.orm"


# ------------------------------------------------------------------ _metricas_closer

def test_metricas_closer_cuenta_toda_reunion_como_agenda():
    """La segunda reunión con el mismo prospecto también se agendó: cuenta, y se avisa aparte.

    Lo único que no suma es lo que se descarta a mano, que llega ya filtrado.
    """
    del_mes = [
        {"estado": "cierre", "resultado": "Cerrado", "pasada": True, "seguimiento": False,
         "cashUsd": 3000.0, "facturacionUsd": 3000.0, "saldoUsd": 0.0},
        {"estado": "show", "resultado": "Seguimiento", "pasada": True, "seguimiento": True,
         "cashUsd": 0.0, "facturacionUsd": 0.0, "saldoUsd": 0.0},
        {"estado": "agendado", "resultado": "", "pasada": False, "seguimiento": False,
         "cashUsd": 0.0, "facturacionUsd": 0.0, "saldoUsd": 0.0},
    ]
    m = v._metricas_closer(del_mes, [del_mes[0]])
    assert m["reuniones"] == 3
    assert m["seguimientos"] == 1
    assert m["agendadas"] == 3          # ninguna se descuenta por ser seguimiento
    assert m["porVenir"] == 1
    assert m["shows"] == 2              # pero sí se presentó: cuenta como show
    assert m["closeRate"] == 50.0


# ------------------------------------------------------------------ reprogramadas

def test_la_llamada_que_se_cayo_y_se_rehizo_el_mismo_dia_no_es_no_show():
    """Se cancela a la mañana y se hace a la tarde: se movió, no se perdió.

    Contarla como caída ensucia el no show rate y le suma una agenda de más al setter,
    cuando en el día hubo una sola reunión y el prospecto vino.
    """
    manana = fila("Juan Manuel Sanabria", datetime(2026, 9, 8, 9, 0), "cancelada", id=1)
    tarde = fila("Juan Manuel Sanabria", datetime(2026, 9, 8, 20, 0), "seguimiento", id=2)
    otro = fila("Adam", datetime(2026, 9, 4, 8, 30), "no show", id=3)
    v._marcar_reprogramadas([manana, tarde, otro], AHORA)

    assert manana["reprogramada"] and not tarde["reprogramada"]
    assert not otro["reprogramada"]          # nadie lo rehizo: ese sí se perdió
    assert v._clasificar(manana["resultado"], "", manana["call"], AHORA, reprogramada=True) == "reprogramada"


def test_una_caida_que_se_rehace_otro_dia_si_es_no_show():
    """El closer tuvo el hueco y alguien tuvo que volver a traerla."""
    lunes = fila("Pedro", datetime(2026, 9, 7, 10, 0), "cancelada", id=1)
    jueves = fila("Pedro", datetime(2026, 9, 10, 10, 0), "seguimiento", id=2)
    v._marcar_reprogramadas([lunes, jueves], AHORA)
    assert not lunes["reprogramada"]


def test_la_reprogramada_no_se_queda_con_la_agenda_del_dia(monkeypatch):
    """La agenda es de la reunión que se hizo, no de la que se cayó."""
    monkeypatch.setattr(v, "_primera_reunion_de_cada_uno", lambda: {})
    manana = fila("Sanabria", datetime(2026, 9, 8, 9, 0), "cancelada", id=1, reprogramada=True)
    tarde = fila("Sanabria", datetime(2026, 9, 8, 20, 0), "seguimiento", id=2, reprogramada=False)
    v._marcar_seguimientos([manana, tarde])
    assert manana["seguimiento"] is False    # no cuenta, pero tampoco ocupa el lugar
    assert tarde["seguimiento"] is False     # esta es la primera real del prospecto
