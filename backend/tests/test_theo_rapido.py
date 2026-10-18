"""Theo filtra en SQL las reuniones con reporte: tiene que dar lo mismo que el filtro en Python
de antes (que leía el texto de cada reunión, una consulta por fila)."""

from datetime import datetime, timedelta

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import theo_services as t


@pytest.fixture()
def reuniones():
    if db.provider is None:
        init_db()
    from src.models import ReunionCrm

    ahora = datetime.utcnow()
    casos = {
        "pendiente": dict(reporte_mensaje="Cerró con seña", reporte_at=ahora),
        "enviada": dict(reporte_mensaje="No show", reporte_at=ahora, reporte_enviado_at=ahora),
        "frenada": dict(reporte_mensaje="Reagendó", reporte_at=ahora, reporte_frenado_por="franco"),
        "vacia": dict(reporte_mensaje="   ", reporte_at=ahora),
        "sin_texto": dict(reporte_at=ahora),
        "vieja": dict(reporte_mensaje="Hace dos meses", reporte_at=ahora - timedelta(days=60), reporte_enviado_at=ahora - timedelta(days=60)),
    }
    with db_session:
        for x in list(ReunionCrm.select()):
            if x.evento_id.startswith("prueba_theo_"):
                x.delete()
        for nombre, campos in casos.items():
            ReunionCrm(evento_id=f"prueba_theo_{nombre}", **campos)
    yield
    with db_session:
        for x in list(ReunionCrm.select()):
            if x.evento_id.startswith("prueba_theo_"):
                x.delete()


def _mias(filas):
    return {r.evento_id.removeprefix("prueba_theo_") for r in filas if r.evento_id.startswith("prueba_theo_")}


def test_el_filtro_en_sql_da_lo_mismo_que_el_de_python(reuniones):
    from src.models import ReunionCrm

    desde = datetime.utcnow() - timedelta(days=30)
    with db_session:
        todas = list(ReunionCrm.select())
        viejo_pend = [r for r in todas if (r.reporte_mensaje or "").strip() and r.reporte_enviado_at is None and not r.reporte_frenado_por]
        viejo_env = [r for r in todas if (r.reporte_mensaje or "").strip() and (r.reporte_enviado_at or r.reporte_frenado_por)
                     and (r.reporte_at or datetime.min) >= desde]
        assert _mias(t._reuniones_con_reporte(False)) == _mias(viejo_pend) == {"pendiente"}
        assert _mias(t._reuniones_con_reporte(True, desde)) == _mias(viejo_env) == {"enviada", "frenada"}


def test_el_resumen_cuenta_las_reuniones(reuniones):
    antes_sin = t.resumen()
    assert antes_sin["pendientes"] >= 1 and antes_sin["enviados_hoy"] >= 1
    assert set(antes_sin) == {"pendientes", "enviados_hoy", "fallidos", "envios_activos", "envios"}
