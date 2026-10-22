"""Reglas de la línea de pagos, con filas armadas a mano (sin base).

Fijan lo que la vista da por sentado: a qué grupo va cada cliente, cuándo se marca D o
E, la duración esperada de Boost y Mentoría y que la permanencia se mida al corte.
"""

from datetime import date

from src.services import linea_pagos_services as lp

HOY = date(2026, 10, 21)
CUT = date(2026, 10, 20)


def _cli(id, **kw):
    base = {
        "id": id, "nombre": f"Cliente {id}", "plan_actual": "mentoria", "estado_cliente": "vigente",
        "fecha_inicio": date(2026, 9, 1), "duracion_dias": 122, "fecha_vencimiento": date(2027, 1, 1),
        "fecha_recompra": None, "fecha_baja": None, "total_pagado_usd": 0, "total_adeudado_usd": 0,
        "canal_discord": f"canal-{id}",
    }
    base.update(kw)
    return base


def _pago(id, cliente_id, fecha, monto, origen="manual"):
    return {"id": id, "cliente_id": cliente_id, "fecha": fecha, "monto_usd": monto, "origen": origen}


def _armar(clientes, pagos=(), vivos=frozenset()):
    out = lp.armar(list(clientes), list(pagos), set(vivos), hoy=HOY, cut=CUT)
    return {c["id"]: c for c in out["clients"]}


def test_grupos():
    clientes = [
        # en Discord: A, aunque esté vencido por fecha (A+B)
        _cli(1, fecha_inicio=date(2025, 12, 1), fecha_vencimiento=date(2026, 4, 1), estado_cliente="vencido"),
        # activo, vencido y fuera de Discord: B
        _cli(2, fecha_inicio=date(2026, 1, 10), fecha_vencimiento=date(2026, 5, 10), estado_cliente="vencido"),
        # inactivo que terminó su programa: C
        _cli(3, fecha_inicio=date(2026, 1, 10), fecha_vencimiento=date(2026, 5, 10), estado_cliente="inactivo"),
        # ingresante con US$ 100 y sin deuda, fuera de Discord: seña
        _cli(4, total_pagado_usd=100, canal_discord=None),
        # inactivo con vencimiento a futuro: baja sin fecha, sin grupo
        _cli(5, estado_cliente="inactivo"),
        # fecha de inicio futura: a revisar
        _cli(6, fecha_inicio=date(2026, 12, 26), fecha_vencimiento=date(2027, 4, 26), estado_cliente="inactivo"),
    ]
    pagos = [_pago(1, 4, date(2026, 9, 1), 100)]
    r = _armar(clientes, pagos, vivos={"#Canal-1 "})
    assert [r[i]["g"] for i in range(1, 7)] == ["A", "B", "C", "S", "O", "X"]
    assert r[1]["ab"] and not r[2]["ab"]
    assert r[4]["sn"]
    assert r[5]["cat"] == "baja_anticipada_sin_fecha" and r[5]["perm"] is None
    assert r[5]["flags"] == ["Inactivo con vencimiento a futuro y sin fecha de baja"]
    assert r[6]["coh"] == r[6]["cat"] == "revisar"
    assert r[6]["flags"] == ["Fecha de inicio futura (26/12/2026): revisar carga"]


def test_permanencia_al_corte_y_categorias():
    clientes = [
        # Boost viejo todavía en curso: permanencia hasta el corte, no hasta hoy
        _cli(1, plan_actual="boost", fecha_inicio=date(2025, 2, 28), duracion_dias=360,
             fecha_vencimiento=date(2027, 3, 3)),
        # baja antes del vencimiento: permanencia hasta la baja
        _cli(2, fecha_inicio=date(2025, 12, 4), duracion_dias=256, fecha_vencimiento=date(2026, 8, 17),
             fecha_baja=date(2026, 7, 6), estado_cliente="inactivo"),
        # vigente con vencimiento pasado: renovación sin cargar
        _cli(3, fecha_inicio=date(2026, 6, 12), duracion_dias=120, fecha_vencimiento=date(2026, 10, 10)),
    ]
    r = _armar(clientes)
    assert r[1]["cat"] == "en_curso" and r[1]["perm"] == 599
    assert r[2]["cat"] == "baja_anticipada_fecha" and r[2]["perm"] == 214
    assert r[2]["flags"] == ["Baja anticipada con fecha"]
    assert r[3]["cat"] == "vigente_venc_pasado" and r[3]["perm"] == 120


def test_duracion_esperada_boost_y_mentoria():
    clientes = [
        # Boost vendido antes de mayo: 12 meses; la ficha suma de más → "?"
        _cli(1, plan_actual="boost", fecha_inicio=date(2025, 2, 28), duracion_dias=360,
             fecha_vencimiento=date(2027, 3, 3)),
        # Boost de mayo (transición): sin duración esperada
        _cli(2, plan_actual="boost", fecha_inicio=date(2026, 5, 7), duracion_dias=365,
             fecha_vencimiento=date(2027, 5, 7)),
        # Boost desde junio: 6 meses; como es ingresante, la diferencia es D y no "?"
        _cli(3, plan_actual="boost", fecha_inicio=date(2026, 7, 8), duracion_dias=243,
             fecha_vencimiento=date(2027, 3, 8), total_pagado_usd=1000),
        # Mentoría: 4 meses, mismo día
        _cli(4, fecha_inicio=date(2026, 7, 25), fecha_vencimiento=date(2026, 11, 25), total_pagado_usd=1000),
        # Entry no tiene duración estándar
        _cli(5, plan_actual="entry", total_pagado_usd=1000),
    ]
    pagos = [_pago(1, 3, date(2026, 10, 1), 1000), _pago(2, 4, date(2026, 10, 1), 1000),
             _pago(3, 5, date(2026, 10, 1), 1000)]
    r = _armar(clientes, pagos)
    assert (r[1]["ve"], r[1]["dvd"], r[1]["qm"]) == ("2026-02-28", 368, True)
    assert (r[2]["ve"], r[2]["dvd"], r[2]["qm"]) == (None, None, False)
    assert (r[3]["ve"], r[3]["dvd"], r[3]["qm"]) == ("2027-01-08", 59, False)
    assert r[3]["mD"] == ["Vencimiento cargado +59 días respecto de la duración del programa"]
    assert (r[4]["ve"], r[4]["dvd"], r[4]["mD"]) == ("2026-11-25", 0, [])
    assert r[5]["ve"] is None and r[5]["dvd"] is None


def test_marca_d():
    clientes = [
        _cli(1, total_pagado_usd=0),                       # vigente sin pagos
        _cli(2, total_pagado_usd=1200, total_adeudado_usd=0),  # ficha ≠ pagos
        # "no va a renovar" sin pagos: no es D (la conversación pendiente es otra)
        _cli(3, estado_cliente="no_va_a_renovar"),
        # cliente viejo (antes de la ventana): sin D aunque la ficha no cierre
        _cli(4, fecha_inicio=date(2026, 2, 9), duracion_dias=303, fecha_vencimiento=date(2026, 12, 9),
             total_pagado_usd=500),
    ]
    pagos = [_pago(1, 2, date(2026, 9, 2), 1600)]
    r = _armar(clientes, pagos)
    assert r[1]["mD"] == ["Activo sin ningún pago registrado"]
    assert r[2]["mD"] == ["Total de la ficha distinto de la suma de pagos"]
    assert r[2]["flags"] == ["Total pagado de la ficha ≠ suma de pagos con fecha"]
    assert r[3]["mD"] == []
    assert r[4]["mD"] == [] and r[4]["flags"] == ["Total pagado de la ficha ≠ suma de pagos con fecha"]


def test_marca_e():
    clientes = [
        # deuda y último pago hace 47 días, en Discord: E1
        _cli(1, total_pagado_usd=6500, total_adeudado_usd=13500),
        # igual pero fuera de Discord: E2
        _cli(2, total_pagado_usd=6500, total_adeudado_usd=13500),
        # deuda pero pagó hace 28 días: sin E
        _cli(3, total_pagado_usd=7500, total_adeudado_usd=7500),
        # deuda y nunca pagó, arrancó hace más de 30 días
        _cli(4, fecha_inicio=date(2026, 5, 11), fecha_vencimiento=date(2026, 9, 11),
             estado_cliente="inactivo", total_adeudado_usd=5000),
        # cliente viejo con deuda: E es solo para ingresantes
        _cli(5, fecha_inicio=date(2026, 2, 9), fecha_vencimiento=date(2027, 2, 9), total_adeudado_usd=13500),
    ]
    pagos = [_pago(1, 1, date(2026, 9, 3), 6500), _pago(2, 2, date(2026, 9, 3), 6500),
             _pago(3, 3, date(2026, 9, 22), 7500)]
    r = _armar(clientes, pagos, vivos={"canal-1", "canal-3", "canal-5"})
    assert [r[i]["mE"] for i in range(1, 6)] == [1, 2, 0, 2, 0]


def test_pagos_despues_del_corte_no_entran_y_orden():
    clientes = [_cli(2, fecha_inicio=date(2026, 9, 2)), _cli(1, fecha_inicio=date(2026, 9, 2)),
                _cli(3, fecha_inicio=date(2026, 8, 1))]
    pagos = [_pago(1, 1, date(2026, 9, 2), 500, "migracion"), _pago(2, 1, HOY, 1000)]
    out = lp.armar(clientes, pagos, set(), hoy=HOY, cut=CUT)
    assert [c["id"] for c in out["clients"]] == [3, 1, 2]
    c1 = out["clients"][1]
    assert c1["pg"] == [["2026-09-02", 500.0, "migración"]] and c1["tp"] == 500.0
    assert (out["cut"], out["hoy"], out["win0"]) == ("2026-10-20", "2026-10-21", "2026-05-01")


def test_cohortes():
    # la cohorte se corta en el primer pago de junio (acá el 8/6)
    clientes = [
        _cli(1, fecha_inicio=date(2026, 6, 8), fecha_vencimiento=date(2026, 10, 8)),
        _cli(2, fecha_inicio=date(2026, 2, 3), fecha_vencimiento=date(2026, 6, 3), estado_cliente="inactivo"),
        _cli(3, fecha_inicio=date(2026, 2, 9), fecha_vencimiento=date(2026, 6, 9), estado_cliente="inactivo"),
    ]
    pagos = [_pago(1, 1, date(2026, 6, 8), 5000)]
    r = _armar(clientes, pagos)
    assert [r[i]["coh"] for i in (1, 2, 3)] == ["nuevo", "previo", "base"]


def test_sin_directorio_aproxima_por_canal_y_estado():
    clientes = [_cli(1), _cli(2, estado_cliente="inactivo", fecha_vencimiento=date(2026, 10, 1)),
                _cli(3, canal_discord=None, total_pagado_usd=5000)]
    pagos = [_pago(1, 3, date(2026, 10, 1), 5000)]
    out = lp.armar(clientes, pagos, None, hoy=HOY, cut=CUT)
    g = {c["id"]: c["g"] for c in out["clients"]}
    assert g == {1: "A", 2: "C", 3: "O"}
