"""Las señas de meses anteriores que se cierran en el período cuentan como cierres del que
las cerró, con su plata y en el close rate (Franco, 22-10-2026)."""

from src.services import ventas_services as v


def _bloque():
    return {"cierres": 1, "shows": 18, "cashUsd": 5000.0, "averageSaleUsd": 5000.0, "closeRate": 5.6,
            "cierresDetalle": [{"id": "1"}], "ventasDetalle": [{"id": "1"}],
            "disposiciones": {"total": 10, "sinReportar": 0, "tajadas": [
                {"disposicion": "Cerrado", "n": 1, "pct": 10.0, "leads": [{"id": "1"}]},
                {"disposicion": "Seguimiento", "n": 9, "pct": 90.0, "leads": []}]}}


def test_las_senas_cerradas_suman_cierres_cash_y_close_rate(monkeypatch):
    monkeypatch.setattr(v, "_persona", lambda n, rol="": n or "Sin asignar")
    dif = [{"id": 7, "prospecto": "Dani", "closer": "Nick", "fechaAt": "2026-09-30T15:00:00",
            "cashUsd": 2400.0, "programa": "Entry Level", "cierreMes": "2026-10"},
           {"id": 8, "prospecto": "Arturo", "closer": "Nick", "fechaAt": "2026-09-12T10:00:00",
            "cashUsd": 1000.0, "programa": "Entry Level", "cierreMes": "2026-10"}]
    b = v._con_cierres_de_sena(_bloque(), dif)
    assert b["cierres"] == 3 and b["cierresDeSena"] == 2
    assert b["cashUsd"] == 8400.0 and b["cashDeSenaUsd"] == 3400.0
    assert b["closeRate"] == 16.7
    assert b["averageSaleUsd"] == 2800.0
    assert [x["nombre"] for x in b["ventasDetalle"][1:]] == ["Dani", "Arturo"]
    cerrado, seguimiento = b["disposiciones"]["tajadas"]
    assert b["disposiciones"]["total"] == 12 and cerrado["n"] == 3 and len(cerrado["leads"]) == 3
    assert cerrado["pct"] == 25.0 and seguimiento["pct"] == 75.0


def test_sin_senas_anteriores_el_bloque_no_cambia():
    b = v._con_cierres_de_sena(_bloque(), [])
    assert b["cierres"] == 1 and b["cashUsd"] == 5000.0 and b["cierresDeSena"] == 0
