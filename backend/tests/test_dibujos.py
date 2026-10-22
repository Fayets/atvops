"""
Los dibujos de Juan sacados del video de la llamada.

Lo que duele si se rompe: que se cuele un documento o una pantalla cualquiera como dibujo,
o que el mismo tablero aparezca cinco veces.
"""

from src.services import dibujos_services as d


def _cuadro(fondo=235, trazos=(), ancho=d.W, alto=d.H):
    raw = bytearray([fondo] * (ancho * alto))
    for x0, y0, x1, y1 in trazos:
        for y in range(y0, y1):
            for x in range(x0, x1):
                raw[y * ancho + x] = 60
    return bytes(raw)


DIBUJO = [(60, 30, 64, 70), (64, 66, 100, 70)]  # una L: poca tinta sobre fondo claro


def test_una_pizarra_con_trazos_es_pizarra_y_una_pantalla_oscura_no():
    m = d.medir(_cuadro(trazos=DIBUJO))
    assert m["pizarra"] and d.MIN_TINTA <= m["tinta"] <= d.MAX_TINTA
    assert not d.medir(_cuadro(fondo=25))["pizarra"]


def test_queda_el_momento_mas_completo_de_cada_tablero_y_no_los_documentos():
    a = d.medir(_cuadro(trazos=DIBUJO[:1]))
    b = d.medir(_cuadro(trazos=DIBUJO))
    corrido = d.medir(_cuadro(trazos=[(x0 + 8, y0 + 4, x1 + 8, y1 + 4) for x0, y0, x1, y1 in DIBUJO]))
    documento = d.medir(_cuadro(trazos=[(14, y, 146, y + 2) for y in range(16, 84, 4)]))
    oscuro = d.medir(_cuadro(fondo=25))
    elegidos = d.elegir([(0, "u0", a), (30, "u1", b), (60, "u2", oscuro), (90, "u3", documento), (120, "u4", oscuro), (150, "u5", corrido)])
    assert elegidos == [(150, "u5", 0)]  # el mismo tablero corrido es el mismo dibujo: queda el último, con cuándo empezó


def test_lo_que_juan_decia_sale_de_la_transcripcion_alrededor_del_minuto():
    texto = "[00:09:00] Juan: arranco con la idea\n[00:10:01] Juan: esto vale 21k\n[00:20:00] Juan: otra cosa"
    assert d.dicho_en(texto, 601) == "Juan: arranco con la idea Juan: esto vale 21k"
    largo = "[00:07:00] Juan: " + " ".join(["logo"] * 50 + ["planta"] * 50) + "\n[00:15:00] Ana: ok"
    assert d.dicho_en(largo, 720, antes=60, despues=10) == "Juan: " + " ".join(["planta"] * 50)  # la mitad que cae en el tramo
    assert d.minuto(2283) == "38:03" and d.minuto(3725) == "1:02:05"


def test_una_busqueda_cortada_por_un_reinicio_queda_como_error_para_reintentar():
    class Llamada:
        id, dibujos_estado, dibujos_error = 999, "buscando", None
    est, error = d.estado(Llamada())
    assert est == "error" and "Volvé a buscar" in error
