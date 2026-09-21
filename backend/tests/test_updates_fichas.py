"""
Tests de cómo se arma la vista de Updates: la ficha por persona y las cuatro
lecturas del resumen.

Trabajan sobre diccionarios, sin base ni Claude: lo que se prueba es el
agrupado y las cuentas, no la ronda.

El test que manda es `test_reproduce_la_ronda_del_18_09`: son los hilos reales
de esa mañana, los mismos que Mauri mandó dibujados. Si el agrupado cambia sin
querer —a quién se le cuenta un hilo, qué es el cuello— ese test es el que lo grita.
"""

from src.services import pedidos_services as p

# La ronda del 18-09-2026 08:01: 15 hilos abiertos en 5 personas.
# (canal, tipo, tema, responsable, horas abierto)
RONDA_18_09 = [
    ("facundo-martinez", "feedback", "procesos de ventas", "Lucas", 28.0),
    ("gretelukz", "consulta", "procesos de ventas", "Lucas", 26.0),
    ("har-program", "seguimiento", "solicitud de llamada (funnel)", "Lucas", 3.0),
    ("emmanuel-moises", "feedback", "estructura setting + VSL", "Lucas", 1.0),
    ("nehuen", "consulta", "Manychat", "Lucas", 1.0),
    ("alicia-damian", "entregable", "MIROs entregados", "Juan Pablo", 2.0),
    ("1541906", "agenda", "confirmar horario de llamada", "Juan Pablo", 4.0),
    ("1541907", "agenda", "confirmar horario adelantado", "Juan Pablo", 4.0),
    ("1461049", "feedback", "oferta creador", "Alejandro Ramírez", 10.0),
    ("conchi-marin", "entregable", "oferta", "Alejandro Ramírez", 2.0),
    ("santiago-y-javier", "seguimiento", "Biz", "Alejandro Ramírez", 1.0),
    ("1541908", "consulta", "reportes", "Emi", 11.0),
    ("benat-y-vicente", "consulta", "formatos de entregables", "Emi", 9.0),
    ("emmanuel-moises", "feedback", "secuencia de historias", "Emi", 2.0),
    ("gretelukz", "consulta", "objeciones en llamada", "Nick Xanderz", 21.0),
]


def _abiertos(filas=RONDA_18_09):
    return [
        {"id": i, "canal": canal, "tipo": tipo, "tema": tema, "estado": "esperando_equipo",
         "responsable": resp, "horasAbierto": horas, "nota": ""}
        for i, (canal, tipo, tema, resp, horas) in enumerate(filas, start=1)
    ]


def test_reproduce_la_ronda_del_18_09():
    fichas = p._fichas_de(_abiertos())
    carga = {f["responsable"]: len(f["hilos"]) for f in fichas}
    assert carga["Lucas"] == 5
    assert carga["Juan Pablo"] == 3
    assert carga["Alejandro Ramírez"] == 3
    assert carga["Emi"] == 3
    assert carga["Nick Xanderz"] == 1
    assert sum(carga.values()) == 15

    resumen = p._resumen_de(_abiertos())
    assert resumen["cuello"] == {"responsable": "Lucas", "hilos": 5}
    assert [v["canal"] for v in resumen["masViejos"]] == ["facundo-martinez", "gretelukz"]
    assert {r["canal"] for r in resumen["repetidos"]} == {"gretelukz", "emmanuel-moises"}
    assert resumen["sinCanalPropio"] == ["1461049", "1541906", "1541907", "1541908"]


def test_la_ficha_muestra_al_que_no_tiene_nada():
    """Ver quién está limpio es parte de la lectura: si no aparece, no se sabe."""
    fichas = p._fichas_de(_abiertos())
    vacias = [f["responsable"] for f in fichas if not f["hilos"]]
    assert "Juan Carrizo" in vacias
    assert "Franco" in vacias


def test_los_hilos_van_del_mas_viejo_al_mas_nuevo():
    lucas = next(f for f in p._fichas_de(_abiertos()) if f["responsable"] == "Lucas")
    assert [h["canal"] for h in lucas["hilos"]][:2] == ["facundo-martinez", "gretelukz"]
    assert lucas["hilos"][-1]["horasAbierto"] <= lucas["hilos"][0]["horasAbierto"]


def test_un_responsable_fuera_de_la_nota_de_equipo_no_desaparece():
    """Si Claude devuelve un nombre que no está en equipo.md, sus hilos se muestran igual."""
    extra = RONDA_18_09 + [("cliente-nuevo", "consulta", "algo", "Maite", 5.0)]
    fichas = p._fichas_de(_abiertos(extra))
    maite = next(f for f in fichas if f["responsable"] == "Maite")
    assert len(maite["hilos"]) == 1
    assert maite["area"] == ""


def test_sin_hilos_abiertos_el_resumen_no_inventa_un_cuello():
    assert p._resumen_de([])["cuello"] is None


def test_una_persona_con_un_solo_hilo_no_es_un_cuello():
    """Con un hilo cada uno no hay a quién señalar; marcarlo sería ruido."""
    solo_uno = [RONDA_18_09[0], RONDA_18_09[5]]
    assert p._resumen_de(_abiertos(solo_uno))["cuello"] is None


def test_lo_de_hoy_no_entra_como_mas_viejo():
    """El bloque es para lo que se está durmiendo, no para lo que entró hace un rato."""
    recientes = [(c, t, m, r, 2.0) for c, t, m, r, _ in RONDA_18_09]
    assert p._resumen_de(_abiertos(recientes))["masViejos"] == []
