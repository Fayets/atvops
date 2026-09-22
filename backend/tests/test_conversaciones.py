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


# ------------------------------------------------- mensajes directos de Instagram

from src.services import instagram_mensajes_services as ig  # noqa: E402


def test_solo_los_mensajes_nuestros_pueden_llevar_el_calendly():
    """`is_echo` marca lo que salió de la cuenta: ahí va el link, no en lo que entra."""
    entrante = {"message": {"text": "hola https://calendly.com/atv"}}
    saliente = {"message": {"text": "hola https://calendly.com/atv", "is_echo": True}}
    assert not entrante["message"].get("is_echo")
    assert saliente["message"].get("is_echo")
    assert ig._CALENDLY.search(saliente["message"]["text"])
    assert ig._CALENDLY.search("te paso el link CALENDLY.COM/atv/llamada")
    assert not ig._CALENDLY.search("te escribo por el calendario")


def test_la_firma_se_valida_contra_la_clave_de_la_app(monkeypatch):
    import hashlib
    import hmac

    cuerpo = b'{"object":"instagram"}'
    monkeypatch.setattr(ig, "_credenciales", lambda: {"app_secret": "secreto"})
    buena = "sha256=" + hmac.new(b"secreto", cuerpo, hashlib.sha256).hexdigest()
    assert ig.firma_valida(cuerpo, buena)
    assert not ig.firma_valida(cuerpo, "sha256=otracosa")
    assert not ig.firma_valida(cuerpo, "")
    # Sin clave cargada no se puede validar: se acepta y queda el aviso en el log.
    monkeypatch.setattr(ig, "_credenciales", lambda: {})
    assert ig.firma_valida(cuerpo, "")


def test_el_alta_del_webhook_exige_el_token(monkeypatch):
    import pytest as _pytest

    monkeypatch.setattr(ig, "_credenciales", lambda: {"webhook_verify_token": "abc"})
    assert ig.verificar_alta("subscribe", "abc", "1234") == "1234"
    with _pytest.raises(PermissionError):
        ig.verificar_alta("subscribe", "otro", "1234")
    with _pytest.raises(PermissionError):
        ig.verificar_alta("unsubscribe", "abc", "1234")


# ------------------------------------------------- el CTA de una secuencia de historias

from datetime import date  # noqa: E402


def _embudo_con(secuencias, monkeypatch):
    """Corre el embudo con estas secuencias y sin ninguna conversación en la base."""
    from src.services import instagram_services

    monkeypatch.setattr(c, "_canal", c._canal)
    monkeypatch.setattr(instagram_services, "contenido",
                        lambda desde, hasta: {"secuencias": secuencias, "reels": [], "conectado": True})
    return c.embudo(date(2026, 9, 1), date(2026, 10, 1))


def test_solo_las_secuencias_con_cta_suman_chats(monkeypatch):
    """Un día de historias sin CTA también junta respuestas, y esas no son leads.

    Es la regla entera del botón: si contáramos todo, el techo del embudo se llenaría de
    gente que contestó un chiste y la tasa a pitch quedaría en el piso sin motivo.
    """
    secuencias = [
        {"fecha": "2026-09-03", "piezas": 4, "respuestas": 18, "cta": True, "historias": [{}]},
        {"fecha": "2026-09-05", "piezas": 3, "respuestas": 40, "cta": False, "historias": [{}]},
        {"fecha": "2026-09-09", "piezas": 5, "respuestas": 7, "cta": True, "historias": [{}]},
    ]
    e = _embudo_con(secuencias, monkeypatch)

    assert e["chats"] == 25, "solo las dos marcadas: 18 + 7"
    assert e["chatsFuente"] == "historias"
    assert e["secuenciasDelPeriodo"] == 3
    assert e["secuenciasConCta"] == 2
    # El detalle tiene que mostrar lo que suma, no todo lo que se publicó.
    assert len(e["detalle"]["chats"]) == 2


def test_sin_ninguna_marcada_el_embudo_no_inventa_chats(monkeypatch):
    """Cero marcadas es cero chats, y el tablero tiene con qué explicar por qué."""
    secuencias = [
        {"fecha": "2026-09-03", "piezas": 4, "respuestas": 18, "cta": False, "historias": [{}]},
        {"fecha": "2026-09-05", "piezas": 3, "respuestas": 40, "cta": False, "historias": [{}]},
    ]
    e = _embudo_con(secuencias, monkeypatch)

    assert e["chats"] == 0
    assert e["chatsFuente"] == ""
    assert e["secuenciasDelPeriodo"] == 2
    assert e["secuenciasConCta"] == 0


def test_una_secuencia_vieja_sin_el_campo_cta_no_suma(monkeypatch):
    """El estado por defecto es "no suma": lo que no tiene marca, no entra."""
    secuencias = [{"fecha": "2026-09-03", "piezas": 4, "respuestas": 18, "historias": [{}]}]
    assert _embudo_con(secuencias, monkeypatch)["chats"] == 0
