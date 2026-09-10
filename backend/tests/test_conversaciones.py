"""
Tests del aviso de ManyChat: qué hecho es cada payload y qué llega limpio.

No tocan la base: lo que se prueba es la lectura del payload, que es donde se decide si
una conversación cuenta como conversación o como Calendly enviado.
"""

import pytest

from src.services import conversaciones_services as c


@pytest.mark.parametrize("payload, esperado", [
    ({"keyword": "DOCUMENTO"}, "conversacion"),
    ({"event": "calendly_enviado"}, "calendly"),
    ({"event": "link_enviado"}, "calendly"),
    ({"event": "respondio_auto"}, "respuesta"),
    # Si el flujo manda el texto del mensaje, el link alcanza para reconocerlo.
    ({"mensaje": "Agendá acá https://calendly.com/atv/llamada"}, "calendly"),
    ({"texto": "te paso el CALENDLY.COM/atv"}, "calendly"),
    ({"mensaje": "hola, cómo va?"}, "conversacion"),
])
def test_clasificar_el_aviso(payload, esperado):
    assert c._clasificar(payload) == esperado


def test_manychat_manda_la_variable_sin_resolver():
    """Cuando el campo no se resuelve llega `{{ig_username}}` literal: eso no es un usuario."""
    assert c._limpiar("{{ig_username}}") == ""
    assert c._limpiar("  @anaperez ") == "@anaperez"
    assert c._limpiar(None) == ""
