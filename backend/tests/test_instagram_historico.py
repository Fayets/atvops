"""El selector de Historias: "Histórico" trae todo, sin recortar por mes."""

from datetime import date

from src.controllers import ventas_controller as vc


def _pedido(monkeypatch, mes):
    rangos = []
    monkeypatch.setattr(vc.instagram, "contenido", lambda d, h: rangos.append((d, h)) or {"secuencias": []})
    monkeypatch.setattr(vc.instagram, "estado", lambda: {})
    return vc.instagram_contenido({}, mes), rangos[0]


def test_historico_no_tiene_fecha_de_corte(monkeypatch):
    r, (desde, hasta) = _pedido(monkeypatch, "historico")
    assert r["mes"] == "historico"
    assert desde.year == 2000 and hasta > date.today()


def test_un_mes_sigue_recortado_a_ese_mes(monkeypatch):
    _, rango = _pedido(monkeypatch, "2026-10")
    assert rango == (date(2026, 10, 1), date(2026, 11, 1))
