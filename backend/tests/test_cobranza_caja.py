"""La caja y la cobranza son dos preguntas distintas, y el tablero las mostraba juntas.

El 28-09-2026 ATV Ops decía US$ 54.666 y ATV Clients US$ 58.866 para el mismo mes. No
mentía ninguno: ATV Ops sumaba las cuotas que vencían en septiembre y estaban marcadas
pagadas —sin mirar cuándo se cobraron— y ATV Clients sumaba los pagos con fecha en
septiembre. Los dos se llamaban "cobrado del mes".

Estos tests fijan la diferencia con los tres casos que la producen, para que el día que
alguien "arregle" uno de los dos números se caiga acá y no en una reunión.
"""

from datetime import date

from src.services import cartera_services as cs
from src.services import clients_db

MES = "2026-09"

CUOTAS = [
    # vence en el mes y está pagada, pero la plata entró en agosto
    {"id": 1, "monto_usd": 6800, "fecha_vence": date(2026, 9, 5), "fecha_pago": date(2026, 8, 26),
     "estado": "pagado", "notas": "", "nombre": "Cobrada antes", "plan_actual": "boost",
     "estado_cliente": "vigente", "responsable": "franco"},
    # vence en el mes y se cobró en el mes: el caso sano
    {"id": 2, "monto_usd": 1000, "fecha_vence": date(2026, 9, 10), "fecha_pago": date(2026, 9, 10),
     "estado": "pagado", "notas": "", "nombre": "Al día", "plan_actual": "mentoria",
     "estado_cliente": "vigente", "responsable": "franco"},
    # se cobró en el mes pero vencía en julio: entró plata, no cuenta como cobranza del mes
    {"id": 3, "monto_usd": 9000, "fecha_vence": date(2026, 7, 8), "fecha_pago": date(2026, 9, 3),
     "estado": "pagado", "notas": "", "nombre": "Atrasada que pagó", "plan_actual": "boost",
     "estado_cliente": "vigente", "responsable": "franco"},
]
CLIENTES = [{"estado_cliente": "vigente", "n": 3, "deuda": 0, "pagado": 16800}]
# Los pagos del mes se pasan aparte: 1000 + 9000 de las cuotas 2 y 3, más 2000 de pagos
# parciales contra una cuota que sigue vencida y por eso no aparece como pagada.


def _falso(monkeypatch, pagos_usd, pagos_n, split=None):
    def consultar(sql, params=None):
        if "FROM {esquema}.pagos" in sql:
            return [{"n": pagos_n, "usd": pagos_usd}]
        if "GROUP BY estado_cliente" in sql:
            return CLIENTES
        return CUOTAS

    monkeypatch.setattr(clients_db, "disponible", lambda: True)
    monkeypatch.setattr(clients_db, "consultar", consultar)
    # El desglose se pide por HTTP a ATV Clients: acá se corta siempre, para que los
    # tests no dependan de que ese sistema esté vivo.
    monkeypatch.setattr(cs, "_split_de_caja", lambda mes: split)
    cs._cache.clear()


def test_la_caja_sale_de_pagos_y_no_de_cuotas(monkeypatch):
    """`caja` es la plata con fecha de pago en el mes: es la que compara con ATV Clients."""
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4)
    r = cs.resumen(MES, refrescar=True)
    assert r["caja"]["usd"] == 12000.0
    assert r["caja"]["pagos"] == 4


def test_sin_desglose_la_tarjeta_no_promete_detalle(monkeypatch):
    """Si ATV Clients no contesta, el total queda y el desglose va en None."""
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4, split=None)
    r = cs.resumen(MES, refrescar=True)
    assert r["caja"]["usd"] == 12000.0
    assert r["caja"]["caja1"] is None and r["caja"]["caja2"] is None


def test_el_desglose_siempre_cierra_contra_el_total(monkeypatch):
    """Si las partes no llegan al total, la diferencia se muestra como `otros`.

    Las dos fuentes pueden desincronizarse —el total sale de la base, el desglose de la
    API de ATV Clients—. Mostrar un desglose que no suma es peor que mostrar un resto.
    """
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4, split={"caja1": 9000.0, "caja2": 2000.0})
    c = cs.resumen(MES, refrescar=True)["caja"]
    assert c["otros"] == 1000.0
    assert c["caja1"] + c["caja2"] + c["otros"] == c["usd"]


def test_cuando_cierra_no_hay_resto(monkeypatch):
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4, split={"caja1": 9000.0, "caja2": 3000.0})
    assert cs.resumen(MES, refrescar=True)["caja"]["otros"] == 0


def test_la_cobranza_del_mes_mira_el_vencimiento_no_el_pago(monkeypatch):
    """`delMes.cobradoUsd` suma las cuotas que vencen en el mes y están pagadas.

    Incluye la que se cobró en agosto (6800) y deja afuera la que se cobró en septiembre
    pero vencía en julio (9000). Es a propósito: mide cobranza, no caja.
    """
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4)
    r = cs.resumen(MES, refrescar=True)
    assert r["delMes"]["cobradoUsd"] == 7800.0
    assert r["delMes"]["totalUsd"] == 7800.0


def test_las_dos_no_tienen_por_que_dar_igual(monkeypatch):
    """Que difieran no es un error: es la diferencia entre plata y cobranza."""
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4)
    r = cs.resumen(MES, refrescar=True)
    assert r["caja"]["usd"] != r["delMes"]["cobradoUsd"]


def test_sin_conexion_la_caja_va_en_cero_y_no_falta(monkeypatch):
    monkeypatch.setattr(clients_db, "disponible", lambda: False)
    cs._cache.clear()
    r = cs.resumen(MES, refrescar=True)
    assert r["caja"]["usd"] == 0 and r["caja"]["pagos"] == 0
    assert r["caja"]["caja1"] is None
    assert r["conectado"] is False
