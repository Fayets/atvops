"""
La voz de Juan que la pizarra le pasa a Claude, leída del cerebro del classroom.

Lo que duele si se rompe: que la pizarra se caiga porque el classroom no está, o que la
voz no llegue al pedido y las ideas salgan con la voz genérica de Claude.
"""

from src.services import pizarra_services as p
from src.services import voz_juan_services as v

VOZ = {"nombre": "Juan Carrizo", "mensajes": 812,
       "rasgos": {"todo_minuscula_pct": 72, "punto_final_pct": 10, "voseo_pct": 64, "emojis_pct": 3,
                  "muletillas": ["literal", "posta"], "palabras_propias": ["implementación", "cash"]},
       "ejemplos": ["hermano el problema no es el ads\nes que no tenés proceso de venta", "dale vamos"]}


def _con_voz(monkeypatch, voz):
    monkeypatch.setattr(v, "_leer", lambda: voz)
    v._cache.update(en=0.0, voz=None)


def test_los_rasgos_medidos_salen_como_reglas_de_escritura():
    reglas = v.describir(VOZ["rasgos"])
    assert "minúscula" in reglas and "punto final" in reglas and '"literal"' in reglas and "casi sin emojis" in reglas


def test_la_voz_de_juan_llega_al_pedido_de_la_pizarra(monkeypatch):
    _con_voz(monkeypatch, VOZ)
    texto = p._contexto_texto({k: {"texto": "x"} for k in p.CONTEXTO})
    assert "Cómo escribe Juan" in texto and "812 mensajes" in texto
    assert "- hermano el problema no es el ads es que no tenés proceso de venta" in texto


def test_sin_classroom_la_pizarra_sigue_sin_voz(monkeypatch):
    def falla():
        raise RuntimeError("permission denied for schema classroom")
    _con_voz(monkeypatch, None)
    monkeypatch.setattr(v, "_leer", falla)
    assert v.bloque() == ""
    assert "Cómo escribe Juan" not in p._contexto_texto({k: {"texto": "x"} for k in p.CONTEXTO})


def test_lo_que_juan_le_corrige_al_tab_del_classroom_llega_a_la_pizarra():
    rasgos = {**VOZ["rasgos"], "correcciones": {"aceptadas": 12, "largo_vs_ia": 0.6, "saca": ["genial", "increíble"], "saca_punto_final_pct": 80}}
    reglas = v.describir(rasgos)
    assert "escribí más corto" in reglas and '"genial"' in reglas and "saca el punto final" in reglas
    assert "escribí más corto" not in v.describir({**VOZ["rasgos"], "correcciones": {"aceptadas": 2, "largo_vs_ia": 0.6}})
