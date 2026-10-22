"""
Tests de la edición de secuencias en la pizarra y de lo que aprende de ella.

Lo que duele si se rompe: que la pizarra "aprenda" algo que nadie cambió (o se pierda lo
que sí se cambió), que una edición rara rompa la vista o la base, y que el álbum de fondos
deje de leerse.
"""

import os
from pathlib import Path

import pytest
from fastapi import HTTPException

from src.services import correcciones_services as c
from src.services import fondos_services as f
from src.services import pizarra_services as p

ORIGINAL = [
    [{"tipo": "imagen", "texto": "foto oscura de noche"},
     {"tipo": "texto", "tamano": "g", "texto": "no separás tus ofertas por __avatar__.\npor eso tu equipo\nno da más."}],
    [{"tipo": "texto", "tamano": "n", "texto": "metés en el mismo producto.\n**al primero no le sirve.**"}],
    [{"tipo": "texto", "tamano": "n", "texto": "responde [[OFERTA]]"}, {"tipo": "flecha", "color": "roja", "texto": "a la palabra"}],
]


def _igual():
    return [{"origen": i, "bloques": [dict(b) for b in h if b["tipo"] != "fondo"]} for i, h in enumerate(ORIGINAL)]


# ------------------------------------------------------------------ diferencias

def test_sin_cambios_es_una_secuencia_aprobada():
    d = c.diferencias(ORIGINAL, _igual())
    assert d["aprobada"] is True
    assert c.lo_que_cambiaste(d) == ["No cambiaste nada: queda como una secuencia aprobada tal cual."]
    assert "ejemplo bueno" in c.lo_que_usa(d)[0]


def test_cambiar_solo_una_marca_no_cuenta_como_texto_reescrito():
    e = _igual()
    e[1]["bloques"][0]["texto"] = "metés en el mismo {{producto}}.\n**al primero no le sirve.**"
    d = c.diferencias(ORIGINAL, e)
    assert d["textos"] == []
    assert d["marcas"] == [{"n": 2, "agregadas": ["rojo"], "sacadas": []}]
    assert not d["aprobada"]


def test_texto_reescrito_queda_con_antes_y_despues_con_sus_marcas():
    e = _igual()
    e[2]["bloques"][0]["texto"] = "responde [[OFERTA]] y te lo paso"
    d = c.diferencias(ORIGINAL, e)
    assert d["textos"] == [{"n": 3, "antes": "responde [[OFERTA]]", "despues": "responde [[OFERTA]] y te lo paso"}]


def test_historias_sacadas_agregadas_y_movidas():
    e = _igual()
    e = [e[2], e[0], {"origen": None, "bloques": [{"tipo": "texto", "tamano": "n", "texto": "mi número: 4 personas."}]}]
    d = c.diferencias(ORIGINAL, e)
    assert d["orden"] == [3, 1, None]
    assert d["sacadas"] == [{"n": 2, "texto": ORIGINAL[1][0]["texto"]}]
    assert d["agregadas"] == [{"n": 3, "texto": "mi número: 4 personas."}]
    assert "Cambiaste el orden: 3 → 1 → nueva." in c.lo_que_cambiaste(d)


def test_sacar_un_bloque_que_no_estaba_en_el_mismo_orden_no_reordena():
    e = [_igual()[0], _igual()[2]]
    d = c.diferencias(ORIGINAL, e)
    assert d["orden"] is None and [s["n"] for s in d["sacadas"]] == [2]


def test_imagen_sacada_rayones_figuras_nota_y_fondo():
    e = _igual()
    e[0]["bloques"] = e[0]["bloques"][1:]
    e[0]["trazos"] = [{"d": "M1 1 L2 2", "color": "rojo"}, {"d": "M3 3 L4 4", "color": "negro"}]
    e[0]["fondo"] = 7
    e[2]["figuras"] = [{"tipo": "circ", "x": 1, "y": 1, "w": 100, "h": 100},
                       {"tipo": "nota", "x": 1, "y": 1, "w": 100, "h": 100, "texto": "usar la captura de Mercury"}]
    d = c.diferencias(ORIGINAL, e, {7: "Juan de espaldas frente a la ciudad, de noche"})
    assert d["bloques"] == [{"n": 1, "sacados": [{"tipo": "imagen", "texto": "foto oscura de noche"}], "agregados": []}]
    assert d["trazos"] == [{"n": 1, "cantidad": 2, "colores": ["negro", "rojo"]}]
    assert d["figuras"] == [{"n": 3, "tipos": ["círculo"]}]
    assert d["notas"] == [{"n": 3, "texto": "usar la captura de Mercury"}]
    assert d["fondos"][0]["foto"] == 7 and "ciudad" in d["fondos"][0]["descripcion"]
    usa = c.lo_que_usa(d)
    assert any("Tu nota" in x for x in usa) and any("Fondos como" in x for x in usa)


def test_el_fondo_que_eligio_la_ia_viene_como_bloque_y_se_separa():
    h = c.historia_normal([{"tipo": "texto", "texto": "hola"}, {"tipo": "fondo", "foto": 4}], 0)
    assert h["fondo"] == 4 and [b["tipo"] for b in h["bloques"]] == ["texto"] and h["origen"] == 0
    # Dejar el fondo que eligió la IA no es un cambio.
    original = [[{"tipo": "texto", "tamano": "n", "texto": "hola"}, {"tipo": "fondo", "foto": 4}]]
    d = c.diferencias(original, [{"origen": 0, "bloques": [{"tipo": "texto", "tamano": "n", "texto": "hola"}], "fondo": 4}])
    assert d["aprobada"]


# ------------------------------------------------------------------ el tramo del pedido

def _registro(d, aprobada=False, idea="no separás tus ofertas"):
    return {"idea": idea, "largo": "corta", "objetivo": "palabra", "cambios": d, "aprobada": aprobada,
            "despues": "1. no separás tus ofertas por __avatar__.", "fecha": "22-10"}


def test_el_tramo_de_correcciones_lleva_los_hechos_y_los_aprobados():
    e = _igual()
    e[2]["bloques"][0]["texto"] = "responde [[OFERTA]] y te lo paso"
    texto = c.armar_bloque([_registro(c.diferencias(ORIGINAL, e)), _registro(c.diferencias(ORIGINAL, _igual()), aprobada=True, idea="otra")])
    assert "# Cómo corrigió Juan secuencias anteriores" in texto
    assert 'Antes: "responde [[OFERTA]]" Después: "responde [[OFERTA]] y te lo paso"' in texto
    assert "(pedir la palabra)" in texto
    assert "# Secuencias que Juan aprobó tal cual" in texto and "«otra»" in texto


def test_sin_correcciones_no_hay_tramo():
    assert c.armar_bloque([]) == ""


def test_el_tramo_tiene_tope():
    e = _igual()
    e[2]["bloques"][0]["texto"] = "x" * 400
    registros = [_registro(c.diferencias(ORIGINAL, e)) for _ in range(50)]
    assert len(c.armar_bloque(registros)) <= c.MAX_CHARS + 2


# ------------------------------------------------------------------ validación de la editada

def _h(**k):
    return {"origen": None, "bloques": [{"tipo": "texto", "tamano": "n", "texto": "hola"}], **k}


def test_una_editada_vacia_o_con_demasiadas_historias_se_rechaza():
    with pytest.raises(HTTPException):
        p.validar_editada({"historias": []})
    with pytest.raises(HTTPException):
        p.validar_editada({"historias": [_h() for _ in range(p.MAX_HISTORIAS_EDITADA + 1)]})
    with pytest.raises(HTTPException) as e:
        p.validar_editada({"historias": [_h(trazos=[{"d": "M1 1 " + "L1 1 " * 200_000}])]})
    assert e.value.status_code == 413


def test_la_editada_corta_lo_raro_y_deja_lo_que_sirve():
    salida = p.validar_editada({"historias": [
        _h(origen=0, trazos=[{"d": "M10 10 L20 20", "color": "negro"}, {"d": "<script>", "color": "rojo"}],
           figuras=[{"tipo": "circ", "x": 900, "y": -5, "w": 500, "h": 50, "color": "verde"}, {"tipo": "estrella"}],
           fondo=99),
        _h(origen=0),                      # el mismo origen dos veces: la segunda es nueva
        {"origen": 1, "bloques": [{"tipo": "texto", "texto": "   "}]},   # vacía: no va
    ]}, fondos_ok={3}, n_original=3)
    assert len(salida) == 2
    a, b = salida
    assert a["trazos"] == [{"d": "M10 10 L20 20", "color": "negro"}]
    assert a["figuras"] == [{"tipo": "circ", "x": 900, "y": 0, "w": 100, "h": 50, "color": "rojo", "relleno": False}]
    assert a["fondo"] is None and a["origen"] == 0
    assert b["origen"] is None


def test_un_fondo_de_la_ia_entra_solo_si_la_foto_existe():
    data = {"secuencias": {"corta": [[{"tipo": "texto", "texto": "hola"}, {"tipo": "fondo", "foto": 5}],
                                     [{"tipo": "texto", "texto": "chau"}, {"tipo": "fondo", "foto": 6}]]}}
    corta = p.validar_secuencias(data, fondos_ok={5})["corta"]
    assert corta[0][-1] == {"tipo": "fondo", "foto": 5}
    assert all(b["tipo"] != "fondo" for b in corta[1])


# ------------------------------------------------------------------ álbum

MUESTRA = Path(os.environ.get("FONDOS_ALBUM_MUESTRA", "/private/tmp/claude-501/-Users-francoayet-Desktop-ATV-Bussines/"
                              "2d167df9-041d-48b4-a3c7-a23cce3be085/scratchpad/album.html"))


def test_el_album_se_lee_sin_repetir():
    html = ('["https://lh3.googleusercontent.com/pw/AAA_b-1",1080,1920] x '
            '"https://lh3.googleusercontent.com/pw/AAA_b-1",1080,1920 "https://lh3.googleusercontent.com/pw/BBB",800,600')
    assert f.leer_album(html) == [{"url": "https://lh3.googleusercontent.com/pw/AAA_b-1", "ancho": 1080, "alto": 1920},
                                  {"url": "https://lh3.googleusercontent.com/pw/BBB", "ancho": 800, "alto": 600}]
    assert f.leer_album("") == []


@pytest.mark.skipif(not MUESTRA.exists(), reason="sin la página del álbum guardada")
def test_la_pagina_real_del_album_trae_301_fotos():
    fotos = f.leer_album(MUESTRA.read_text(encoding="utf-8"))
    assert len(fotos) == 301
    assert all(x["ancho"] > 0 and x["alto"] > 0 for x in fotos)


def test_la_busqueda_pide_todas_las_palabras_sin_tildes():
    assert f.coincide("Juan de espaldas, ciudad de noche, oscura", "noche JUAN")
    assert not f.coincide("Juan de espaldas, ciudad de noche", "oficina")
    assert f.coincide(None, "")
    assert not f.coincide(None, "noche")
    assert f.coincide("Reunión en la oficina", "reunion")
