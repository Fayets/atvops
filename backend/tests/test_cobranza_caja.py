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
# Los pagos de upsell y recompra del mes: son la caja 2, y van aparte de las cuotas.
CAJA2 = [
    {"nombre": "Subió de plan", "usd": 1200, "fecha": date(2026, 9, 12), "tipo": "cuota_upsell"},
    {"nombre": "Volvió", "usd": 800, "fecha": date(2026, 9, 4), "tipo": "cuota_recompra"},
]
# Los pagos del mes se pasan aparte: 1000 + 9000 de las cuotas 2 y 3, más 2000 de pagos
# parciales contra una cuota que sigue vencida y por eso no aparece como pagada.


def _falso(monkeypatch, pagos_usd, pagos_n, split=None, huerfanos=(0, 0)):
    def consultar(sql, params=None):
        # Antes que la de abajo: las tres leen `pagos`, pero una trae las filas de la
        # caja 2, otra los pagos sin imputar y la última solo cuenta el total del mes.
        if "cuota_upsell" in sql:
            return list(CAJA2)
        if "NOT EXISTS (SELECT 1 FROM {esquema}.pago_imputaciones" in sql:
            return [{"n": huerfanos[0], "usd": huerfanos[1]}]
        if "FROM {esquema}.pagos" in sql:
            return [{"n": pagos_n, "usd": pagos_usd}]
        if "total_adeudado_usd, 0) > 0" in sql:
            return []
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
    """`caja` es la plata con fecha de pago en el mes, nunca las cuotas que vencían."""
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


def test_el_total_es_el_de_atv_clients_y_no_la_suma_local(monkeypatch):
    """La plata del mes es la que publica ATV Clients, no la suma de `pagos`.

    En octubre de 2026 la suma local daba US$ 69.500 y ATV Clients mostraba 50.500: la
    diferencia eran tres pagos cargados a mano sin imputar a ninguna cuota —apuntaban a
    cuotas que no existen—, que entran en la suma pero Clients no cuenta. El tablero
    decía que entró plata que del otro lado no aparece.
    """
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4, huerfanos=(1, 1000.0),
           split={"caja1": 9000.0, "caja2": 2000.0, "total": 11000.0})
    c = cs.resumen(MES, refrescar=True)["caja"]
    assert c["usd"] == 11000.0
    assert c["caja1"] + c["caja2"] == c["usd"]
    assert c["otros"] == 0


def test_los_pagos_sin_imputar_se_muestran_aparte(monkeypatch):
    """No se tapan con un resto: son un problema de carga y conviene que se vea.

    También salen de la cuenta de pagos, para que "26 pagos por US$ 50.500" sea cierto
    en las dos mitades.
    """
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4, huerfanos=(1, 1000.0),
           split={"caja1": 9000.0, "caja2": 2000.0, "total": 11000.0})
    c = cs.resumen(MES, refrescar=True)["caja"]
    assert c["sinImputar"] == {"usd": 1000.0, "pagos": 1}
    assert c["pagos"] == 3


def test_si_el_total_de_clients_no_da_con_sus_mitades_queda_un_resto(monkeypatch):
    """`otros` sigue existiendo, pero para la incoherencia de Clients consigo mismo."""
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4,
           split={"caja1": 9000.0, "caja2": 2000.0, "total": 12000.0})
    c = cs.resumen(MES, refrescar=True)["caja"]
    assert c["otros"] == 1000.0
    assert c["caja1"] + c["caja2"] + c["otros"] == c["usd"]


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


def test_falta_cobrar_se_parte_en_vencido_y_por_vencer(monkeypatch):
    """Las partes del desglose tienen que sumar la tarjeta, siempre.

    Las tarjetas de Cobranza se abren y muestran las filas que las componen. Si las
    partes no dan el total, el tablero pasa de herramienta a tema de discusión.
    """
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4)
    m = cs.resumen(MES, refrescar=True)["delMes"]
    assert m["pendienteVencidoUsd"] + m["pendientePorVencerUsd"] == m["pendienteUsd"]
    assert m["cobradoUsd"] + m["pendienteUsd"] == m["totalUsd"]


def test_los_deudores_suman_la_deuda_de_la_cartera(monkeypatch):
    def consultar(sql, params=None):
        if "cuota_upsell" in sql:
            return []
        if "FROM {esquema}.pagos" in sql:
            return [{"n": 0, "usd": 0}]
        if "total_adeudado_usd, 0) > 0" in sql:
            return [
                {"nombre": "Uno", "plan_actual": "boost", "estado_cliente": "vigente",
                 "total_adeudado_usd": 1500},
                {"nombre": "Dos", "plan_actual": "mentoria", "estado_cliente": "inactivo",
                 "total_adeudado_usd": 500},
            ]
        if "GROUP BY estado_cliente" in sql:
            return [{"estado_cliente": "vigente", "n": 2, "deuda": 2000, "pagado": 0}]
        return CUOTAS

    monkeypatch.setattr(clients_db, "disponible", lambda: True)
    monkeypatch.setattr(clients_db, "consultar", consultar)
    monkeypatch.setattr(cs, "_split_de_caja", lambda mes: None)
    cs._cache.clear()

    cartera = cs.resumen(MES, refrescar=True)["cartera"]
    assert sum(d["deudaUsd"] for d in cartera["deudores"]) == cartera["deudaUsd"]


def test_la_caja_2_se_puede_abrir(monkeypatch):
    """El número de caja 2 viene con los pagos que lo forman.

    El total lo publica ATV Clients y no se recalcula acá, pero un monto que no se puede
    desarmar en nombres no sirve para discutir nada: las filas salen de `pagos`.
    """
    _falso(monkeypatch, pagos_usd=12000, pagos_n=4, split={"caja1": 9000.0, "caja2": 2000.0})
    filas = cs.resumen(MES)["caja2Filas"]
    assert [f["cliente"] for f in filas] == ["Subió de plan", "Volvió"]
    assert [f["tipo"] for f in filas] == ["upsell", "recompra"]
    assert sum(f["montoUsd"] for f in filas) == 2000.0


def test_sin_conexion_la_caja_2_no_rompe(monkeypatch):
    monkeypatch.setattr(clients_db, "disponible", lambda: False)
    cs._cache.clear()
    assert cs.resumen(MES)["caja2Filas"] == []
