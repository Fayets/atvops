"""
Tests del lector del documento del domingo. No toca ninguna base.

Lo que se lee de un Google Doc son datos: qué día es cada título y qué dice cada viñeta.
Acá se fija que el reparto lo haga el código y que un título del documento no termine
cargado como si fuera una tarea.
"""

import pytest

from src.services import daily_importar_services as imp


def _tareas(doc: str) -> list[dict]:
    return imp.validar(imp.leer(doc))


@pytest.mark.parametrize("titulo", [
    "MIS TAREAS DE DESPLAZAMIENTO", "Tareas de desplazamiento", "Bloque de desplazamiento",
    "Desplazamiento", "Desplazamiento:", "- MIS TAREAS DE DESPLAZAMIENTO",
])
def test_el_titulo_del_bloque_es_un_titulo_no_una_tarea(titulo):
    assert imp._tipo_del_titulo(titulo) == imp.DESPLAZAMIENTO


@pytest.mark.parametrize("linea", [
    "Rearmar el guion de desplazamiento del equipo", "Mis tareas de la semana",
    "Armar la secuencia de velocidad para los setters",
])
def test_una_tarea_que_menciona_el_tipo_sigue_siendo_una_tarea(linea):
    assert imp._tipo_del_titulo(linea) is None


def test_el_titulo_del_bloque_le_pone_el_tipo_a_lo_que_cuelga():
    """Antes el título se colaba como tarea y todo lo que colgaba entraba como velocidad."""
    doc = "MIS TAREAS DE DESPLAZAMIENTO\n- Rearmar el guion\nVELOCIDAD\n- 30 mensajes\n"
    assert _tareas(doc) == [
        {"dia": None, "tipo": "desplazamiento", "texto": "Rearmar el guion"},
        {"dia": None, "tipo": "velocidad", "texto": "30 mensajes"},
    ]


def test_los_dias_reparten_y_el_tipo_de_la_linea_manda():
    doc = "Lunes\n- Llamadas\n- Revisar el embudo (desplazamiento)\nSábado\n- Editar\n"
    assert _tareas(doc) == [
        {"dia": 0, "tipo": "velocidad", "texto": "Llamadas"},
        {"dia": 0, "tipo": "desplazamiento", "texto": "Revisar el embudo"},
        {"dia": 5, "tipo": "velocidad", "texto": "Editar"},
    ]


def test_un_titulo_de_seccion_deja_las_tareas_abiertas_en_la_semana():
    doc = "Lunes\n- Llamadas\nObjetivos de la semana\n- Cerrar dos\n"
    assert _tareas(doc) == [
        {"dia": 0, "tipo": "velocidad", "texto": "Llamadas"},
        {"dia": None, "tipo": "velocidad", "texto": "Cerrar dos"},
    ]


def test_la_prosa_de_arriba_no_es_tarea():
    doc = "Esta es mi semana y la idea es cerrar dos clientes\n\nLunes\n- Llamadas\n"
    assert _tareas(doc) == [{"dia": 0, "tipo": "velocidad", "texto": "Llamadas"}]
