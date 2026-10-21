"""El nombre que el equipo corrige en el editor no lo pisa el título de Google.

Pasó el 21-10-2026: Franco cambiaba el nombre con doble click, se guardaba, y la
sincronización de cada 10 minutos lo devolvía al del calendario.
"""

from datetime import datetime

import pytest
from pony.orm import db_session

from src.db import db, init_db
from src.services import llamadas_services as ll
from src.services import ventas_services as v

EVENTO = "prueba-nombre-evento"


@pytest.fixture()
def reunion(monkeypatch):
    if db.provider is None:
        init_db()
    from src.models import ReunionCrm

    def limpiar():
        with db_session:
            for r in list(ReunionCrm.select()):
                if r.evento_id == EVENTO:
                    r.delete()

    limpiar()
    fila = {"eventoId": EVENTO, "id": 0, "nombre": "Juan martin", "call": datetime(2026, 10, 21, 15, 0)}
    monkeypatch.setattr(v, "_armar_desde_las_fuentes", lambda desde, hasta: [dict(fila)])
    ll.sincronizar()
    yield ReunionCrm
    limpiar()


def _nombre(ReunionCrm):
    with db_session:
        return ReunionCrm.get(evento_id=EVENTO).prospecto


def test_el_sync_no_pisa_el_nombre_que_corrigio_una_persona(reunion):
    with db_session:
        r = reunion.get(evento_id=EVENTO)
        r.prospecto, r.actualizado_por = "Juan Martín Pérez", "nick"
    ll.sincronizar()
    assert _nombre(reunion) == "Juan Martín Pérez"


def test_sin_correccion_manda_el_calendario(reunion):
    assert _nombre(reunion) == "Juan martin"
    with db_session:
        reunion.get(evento_id=EVENTO).actualizado_por = "fathom"
    ll.sincronizar()
    assert _nombre(reunion) == "Juan martin"
