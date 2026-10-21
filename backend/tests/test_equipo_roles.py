"""Una persona del equipo de ventas puede tener varios roles: desde oct-2026 Cris es setter
y también cierra. Lo asigna el director desde Ventas → Equipo."""

import pytest

from src.db import db, init_db
from src.services import equipo_services as eq


@pytest.fixture()
def cris():
    if db.provider is None:
        init_db()
    antes = eq.roles_de_usuario("cris")
    if not antes:
        pytest.skip("la base local no tiene a Cris en el equipo")
    yield
    eq.asignar("cris", antes)


def test_cris_puede_ser_setter_y_closer(cris):
    eq.asignar("cris", ["setter", "closer"])
    assert eq.roles_de_usuario("cris") == ["closer", "setter"]
    assert "Cris" in eq.nombres("closer") and "Cris" in eq.nombres("setter")
    # No se duplica la fila: sigue siendo una persona.
    assert sum(1 for m in eq.listar() if m["username"] == "cris") == 1


def test_el_rol_principal_no_se_saca_desde_ventas(cris):
    eq.asignar("cris", [])          # Cris entra como setter: eso queda
    assert eq.roles_de_usuario("cris") == ["setter"]


def test_un_rol_desconocido_no_se_guarda(cris):
    with pytest.raises(ValueError):
        eq.asignar("cris", ["closer", "jefe"])
