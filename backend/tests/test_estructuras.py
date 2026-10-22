"""
Estructuras de historias de Juan.

Lo que duele si se rompe: que una estructura sea inventada (sin secuencias reales de
Juan detrás) o que una idea de historias salga apoyada en una estructura que no existe.
"""

import json

from src.services import estructuras_services as e
from src.services import pizarra_services as p

PASOS = [{"rol": "gancho", "que": "ya no publico"}, {"rol": "cta", "que": "el lunes revelo"}]


def test_la_base_tiene_cada_estructura_probada_con_secuencias_reales():
    base = json.loads(e.BASE.read_text())
    assert len(base["estructuras"]) >= 15
    for est in base["estructuras"]:
        assert len(est["ejemplos"]) >= 3, est["clave"]
        assert all(f in base["dias"] for f in est["ejemplos"]), est["clave"]
        assert all(paso["rol"] in e.ROLES for paso in est["pasos"]), est["clave"]


def test_cada_dia_nuevo_entra_en_una_estructura_que_existe_o_queda_suelto():
    res = e.validar({"dias": [{"fecha": "2026-10-20", "estructura": "por-unica-vez", "resumen": "gancho → cta"},
                              {"fecha": "2026-10-21", "estructura": "inventada", "resumen": "x"},
                              {"fecha": "2026-01-01", "estructura": "por-unica-vez", "resumen": "fuera de la semana"}]},
                    nuevos={"2026-10-20", "2026-10-21", "2026-10-22"}, sueltas=set(), claves={"por-unica-vez"})
    assert [(d["fecha"], d["estructura"]) for d in res["dias"]] == [("2026-10-20", "por-unica-vez"), ("2026-10-21", None)]
    assert res["sueltos"] == ["2026-10-22"]


def test_una_estructura_nueva_necesita_dos_secuencias_sueltas_reales():
    nueva = {"nombre": "Cuenta regresiva bis", "cuando": "x", "pasos": PASOS}
    con_una = e.validar({"dias": [], "nuevas": [{**nueva, "fechas": ["2026-10-21", "2099-01-01"]}]},
                        nuevos={"2026-10-21"}, sueltas=set(), claves=set())
    assert con_una["nuevas"] == []
    con_dos = e.validar({"dias": [{"fecha": "2026-10-21", "estructura": None, "resumen": "x"}],
                         "nuevas": [{**nueva, "fechas": ["2026-10-21", "2026-09-10"]}]},
                        nuevos={"2026-10-21"}, sueltas={"2026-09-10"}, claves=set())
    assert con_dos["nuevas"][0]["fechas"] == ["2026-09-10", "2026-10-21"]


def test_una_secuencia_que_ya_tiene_estructura_no_sirve_para_una_nueva():
    res = e.validar({"dias": [{"fecha": "2026-10-20", "estructura": "por-unica-vez", "resumen": "x"},
                              {"fecha": "2026-10-21", "estructura": None, "resumen": "x"}],
                     "nuevas": [{"nombre": "Otra", "pasos": PASOS, "fechas": ["2026-10-20", "2026-10-21"]}]},
                    nuevos={"2026-10-20", "2026-10-21"}, sueltas=set(), claves={"por-unica-vez"})
    assert res["nuevas"] == []


def test_una_idea_de_historias_sin_estructura_real_no_entra():
    data = {"story": [{"titulo": "a", "detalle": "x", "estructura": "por-unica-vez"},
                      {"titulo": "b", "detalle": "x", "estructura": "inventada"},
                      {"titulo": "c", "detalle": "x"}],
            "reel": [{"titulo": "r", "detalle": "x"}]}
    v = p.validar_variantes(data, {"por-unica-vez"})
    assert [(i["titulo"], i["estructura"]) for i in v["story"]] == [("a", "por-unica-vez")]
    assert [i["titulo"] for i in v["reel"]] == ["r"]
