"""
Tests del resumen de eventos de tracking.

Los contadores se calculan con una sola consulta agregada en vez de recorrer los
eventos en Python: la vista de Integraciones se refresca sola cada pocos segundos y
una landing en campaña tiene miles de hits. Lo que se fija acá es que el armado del
resultado —qué fila va a qué integración, qué pasa con los tipos que no vinieron y
cómo se lee la fecha— siga dando lo mismo que el recorrido viejo.
"""

from datetime import datetime

import pytest

from src.services import integraciones_services as s


@pytest.fixture
def con_filas(monkeypatch):
    """Reemplaza la consulta para no necesitar base."""
    def armar(filas):
        monkeypatch.setattr(s, "_resumen_eventos", s._resumen_eventos)
        from src import db as db_mod

        monkeypatch.setattr(db_mod.db, "select", lambda _sql: filas)
        return s._resumen_eventos([7, 9])
    return armar


def test_cada_fila_va_a_su_integracion(con_filas):
    ahora = datetime(2026, 9, 24, 15, 0)
    salida = con_filas([
        (7, "pageview", 412, ahora),
        (7, "optin", 38, datetime(2026, 9, 24, 14, 0)),
        (9, "pageview", 5, datetime(2026, 9, 20, 9, 0)),
    ])
    assert salida[7]["counts"]["pageview"] == 412
    assert salida[7]["counts"]["optin"] == 38
    assert salida[9]["counts"]["pageview"] == 5
    # El último es el más nuevo de todos sus tipos, no el de la última fila leída.
    assert salida[7]["ultimo"] == ahora


def test_un_tipo_que_no_vino_es_cero_y_no_falta(con_filas):
    """El panel pinta las cuatro tarjetas siempre: si falta la clave, rompe."""
    salida = con_filas([(7, "pageview", 3, datetime(2026, 9, 24, 15, 0))])
    for tipo in s.TIPOS_EVENTO:
        assert tipo in salida[7]["counts"]
    assert salida[7]["counts"]["whatsapp"] == 0
    # Una integración sin un solo evento existe igual, en cero y sin fecha.
    assert salida[9]["counts"]["pageview"] == 0
    assert salida[9]["ultimo"] is None


def test_un_tipo_desconocido_no_rompe_ni_se_cuela(con_filas):
    salida = con_filas([(7, "inventado", 99, datetime(2026, 9, 24, 15, 0))])
    assert "inventado" not in salida[7]["counts"]


def test_sin_ids_no_se_consulta_nada():
    assert s._resumen_eventos([]) == {}


def test_la_fecha_de_sqlite_llega_como_texto():
    """SQLite devuelve el max() como string; Postgres, como datetime. Los dos sirven."""
    esperado = datetime(2026, 9, 24, 15, 30, 5)
    assert s._como_fecha("2026-09-24 15:30:05") == esperado
    assert s._como_fecha(esperado) == esperado
    assert s._como_fecha(None) is None
    assert s._como_fecha("cualquier cosa") is None


def test_los_tipos_son_los_cinco_que_muestra_el_panel():
    """
    La vista pinta una tarjeta por tipo y el webinar deriva sus tasas de estos nombres.
    Agregar un tipo sin tocar el panel deja eventos que entran y no se ven en ningún
    lado; sacarlo rompe las tarjetas. Este test es el recordatorio de que van juntos.
    """
    assert s.TIPOS_EVENTO == {"pageview", "optin", "thank_you", "whatsapp", "calendario"}
