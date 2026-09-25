"""
Tests de la edición de credenciales.

La regla que se fija acá es la que puede borrar una clave de producción sin que nadie se
dé cuenta: **un campo vacío no toca nada**. La pantalla muestra los secretos
enmascarados, así que si el guardado tomara lo que ve el formulario, apretar "guardar"
después de cambiar un solo campo dejaría los otros en "…drrw · 212 caracteres".
"""

import pytest

from src.services import conexiones_services as c


@pytest.fixture
def base(monkeypatch):
    """Una credencial en memoria, para no tocar la base."""
    estado = {"access_token": "token-viejo", "ad_account_id": "act_1"}
    guardados = []

    monkeypatch.setattr(c, "obtener", lambda _p: dict(estado))
    monkeypatch.setattr(c, "guardar", lambda p, cred, quien="": guardados.append((p, cred, quien)))
    return estado, guardados


def test_un_campo_vacio_no_pisa_el_valor_guardado(base):
    estado, guardados = base
    r = c.actualizar("meta_ads", {"access_token": "token-nuevo", "ad_account_id": ""}, "franco")
    assert r["cambiados"] == ["access_token"]
    _, cred, quien = guardados[0]
    assert cred["access_token"] == "token-nuevo"
    assert cred["ad_account_id"] == "act_1", "el campo vacío borró lo que ya estaba"
    assert quien == "franco"


def test_sin_nada_escrito_no_se_guarda_nada(base):
    _, guardados = base
    r = c.actualizar("meta_ads", {"access_token": "", "ad_account_id": "   "}, "franco")
    assert r["cambiados"] == []
    assert guardados == [], "guardó una credencial sin que nadie cambiara nada"


def test_borrar_es_la_unica_forma_de_vaciar(base):
    _, guardados = base
    c.actualizar("meta_ads", {"ad_account_id": "BORRAR"}, "franco")
    assert guardados[0][1]["ad_account_id"] == ""
    assert guardados[0][1]["access_token"] == "token-viejo"


def test_un_campo_que_no_existe_se_rechaza(base):
    _, guardados = base
    with pytest.raises(ValueError, match="no existen"):
        c.actualizar("meta_ads", {"inventado": "x"}, "franco")
    assert guardados == []


def test_una_plataforma_desconocida_se_rechaza(base):
    with pytest.raises(ValueError, match="desconocida"):
        c.actualizar("tiktok", {"access_token": "x"}, "franco")


def test_el_enmascarado_no_devuelve_el_secreto():
    """Los últimos 4 alcanzan para reconocer cuál está cargada; el resto no sale nunca."""
    largo = "EAAuJZBqXqmYoBSSDmHAwR7aKCQFzGFfDPEBDOkfnebQAg8Q"
    salida = c.enmascarar(largo)
    assert largo not in salida
    assert salida.endswith("48 caracteres")
    assert "Ag8Q" in salida, "sin los últimos caracteres no se distingue una clave de otra"
    # Lo corto no es secreto: un channel_id o una palabra de la bio se leen enteros.
    assert c.enmascarar("info") == "info"
