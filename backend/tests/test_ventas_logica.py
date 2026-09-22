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

def test_bloque_separa_cierres_de_senas_y_no_cuenta_el_seguimiento_como_agenda():
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
    assert b["agendados"] == 4                 # la segunda vuelta no es una agenda nueva
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

def test_metricas_closer_no_cuenta_el_seguimiento_como_agenda():
    """La agenda la trae el setter una sola vez: la segunda reunión con el mismo prospecto
    se sigue viendo y suma show y cierre, pero no es una agenda nueva."""
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
    assert m["agendadas"] == 2          # el seguimiento no abre una agenda nueva
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


# ------------------------------------------------------------------ AOV

def test_el_aov_es_el_cash_sobre_los_cierres_no_sobre_las_senas():
    """AOV es cuánto entra por venta cerrada.

    La seña es plata que entró con la venta a medio hacer: si contara como una venta más,
    dos señas chicas bajarían el promedio de un cierre que sí se hizo.
    """
    del_mes = [
        {"estado": "cierre", "resultado": "Cerrado", "pasada": True, "seguimiento": False,
         "cashUsd": 8000.0, "facturacionUsd": 8000.0, "saldoUsd": 0.0},
        {"estado": "cierre", "resultado": "Cerrado", "pasada": True, "seguimiento": False,
         "cashUsd": 3830.0, "facturacionUsd": 4000.0, "saldoUsd": 170.0},
        {"estado": "cierre", "resultado": "Seña", "pasada": True, "seguimiento": False,
         "cashUsd": 200.0, "facturacionUsd": 4000.0, "saldoUsd": 3800.0},
    ]
    ventas = del_mes
    m = v._metricas_closer(del_mes, ventas)

    assert m["cierres"] == 2 and m["senas"] == 1
    assert m["cashUsd"] == 12030.0            # la seña sí suma al cash cobrado
    assert m["aovUsd"] == 6015.0              # 12.030 sobre 2 cierres, no sobre 3 ventas


# ------------------------------------------------- disposición en llamada

def _lead(resultado):
    return {"resultado": resultado, "calificacion": "", "call": None}


def test_no_contesta_se_pliega_sobre_no_show():
    """Si el prospecto no se conectó, la llamada no pasó. Contarlo como show infla el
    show rate con llamadas que nunca existieron."""
    leads = [_lead("No contesta"), _lead("No show"), _lead("Cancelada")]
    d = v.disposiciones(leads, ["no_show"] * 3)
    tajada = {t["disposicion"]: t["n"] for t in d["tajadas"]}
    assert tajada["No show"] == 3
    assert "No contesta" not in tajada


def test_la_barra_tiene_siete_tajadas():
    d = v.disposiciones([], [])
    assert [t["disposicion"] for t in d["tajadas"]] == [
        "Cerrado", "Seña", "No show", "Descalificado",
        "No tiene la plata", "Lo voy a pensar", "Seguimiento",
    ]


def test_las_sin_reportar_no_se_reparten():
    """Meterlas en una tajada sería inventar qué pasó; repartirlas proporcionalmente
    maquillaría justo el número que uno mira para saber dónde se cae."""
    leads = [_lead("Cerrado"), _lead(""), _lead("")]
    d = v.disposiciones(leads, ["cierre", "sin_reportar", "sin_reportar"])
    assert d["total"] == 1
    assert d["sinReportar"] == 2
    assert sum(t["n"] for t in d["tajadas"]) == 1


def test_los_estados_de_plata_y_duda_salen_de_seguimiento():
    """Son las dos tajadas que antes vivían colapsadas y que dan el diagnóstico."""
    leads = [_lead("No tiene la plata"), _lead("Lo voy a pensar"), _lead("Seguimiento")]
    d = v.disposiciones(leads, ["show"] * 3)
    tajada = {t["disposicion"]: t["n"] for t in d["tajadas"]}
    assert tajada["No tiene la plata"] == 1
    assert tajada["Lo voy a pensar"] == 1
    assert tajada["Seguimiento"] == 1


def test_la_reagenda_cuenta_como_seguimiento():
    """La llamada pasó y el paso siguiente es otra llamada: no es una tajada propia."""
    d = v.disposiciones([_lead("Re-agenda")], ["show"])
    assert {t["disposicion"]: t["n"] for t in d["tajadas"]}["Seguimiento"] == 1


# ------------------------------------------------- qué llamadas ve el closer

def test_una_llamada_sin_closer_no_desaparece_al_cargarla():
    """Antes se pedía que además fuera "solo del calendario" para considerarla huérfana.
    Al cargarle un resultado desde un rol que no toma llamadas —ops, admin— dejaba de
    ser del calendario, se quedaba sin closer, y desaparecía de la lista justo después
    de guardarla."""
    def visible(fila, mios):
        es_mio = v._norm(fila.get("closer")) in mios
        huerfana = not (fila.get("closer") or "").strip()
        return es_mio or huerfana

    mios = [v._norm("Nick Xanderz")]
    assert visible({"closer": "Nick Xanderz", "soloCalendario": False}, mios)
    assert visible({"closer": "", "soloCalendario": True}, mios)
    # El caso que se rompía: cargada, sin closer, ya no es del calendario.
    assert visible({"closer": "", "soloCalendario": False}, mios)
    assert not visible({"closer": "Lucas", "soloCalendario": False}, mios)
