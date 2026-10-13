"""Asociación del chat del classroom con la carpeta de Discord de cada cliente."""

from src.services import classroom_chat


def _con_chat(monkeypatch, nombres: dict[str, str]):
    datos = {slug: [{"classroom_id": 1}] for slug in nombres}
    monkeypatch.setattr(classroom_chat, "mensajes_por_canal", lambda: datos)
    monkeypatch.setitem(classroom_chat._cache, "nombres", nombres)


def test_coincide_por_canal_cargado(monkeypatch):
    _con_chat(monkeypatch, {"ema-romero": "Ema Romero"})
    assert classroom_chat.asociar(["ema-romero", "otro"]) == {"ema-romero": "ema-romero"}


def test_si_el_canal_no_coincide_usa_el_primer_nombre(monkeypatch):
    # Caso real: Valentino tiene cargado #valentino-babino pero su carpeta es valentino-y-gaston.
    _con_chat(monkeypatch, {"valentino-babino": "Valentino Babino"})
    assert classroom_chat.asociar(["valentino-y-gaston", "sofia-valentina"]) == {"valentino-y-gaston": "valentino-babino"}


def test_si_hay_dos_carpetas_posibles_no_adivina(monkeypatch):
    _con_chat(monkeypatch, {"juan-perez": "Juan Pérez"})
    assert classroom_chat.asociar(["juan-gomez", "juan-lopez"]) == {}
