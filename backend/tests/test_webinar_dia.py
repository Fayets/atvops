"""
Tests del endpoint que usa SoftWebinar para cargar los números del día del webinar.

La validación corre antes de tocar la base: un número que no es número, o un cuerpo
sin ninguno de los tres campos, se corta con 400 sin buscar el token.
"""

import pytest
from fastapi import HTTPException

from src.services.integraciones_services import CAMPOS_DIA_WEBINAR, IntegracionesServices


def test_solo_escribe_los_tres_campos_del_dia():
    assert CAMPOS_DIA_WEBINAR == ("vivos", "picoConcurrentes", "retenidosPitch")


def test_sin_numeros_del_dia_es_400():
    with pytest.raises(HTTPException) as e:
        IntegracionesServices().registrar_dia_webinar("tok", {"booked": 4})
    assert e.value.status_code == 400


def test_un_valor_que_no_es_numero_es_400():
    with pytest.raises(HTTPException) as e:
        IntegracionesServices().registrar_dia_webinar("tok", {"vivos": "muchos"})
    assert e.value.status_code == 400
