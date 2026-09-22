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


# ------------------------------------------------- de qué se componen los chats

from datetime import date  # noqa: E402


def _chats_con(secuencias, del_crm, monkeypatch):
    """Corre el cálculo con estas historias y este CRM, sin tocar la red ni la base."""
    from src.services import instagram_services, marketing_services

    monkeypatch.setattr(instagram_services, "contenido",
                        lambda desde, hasta: {"secuencias": secuencias, "reels": [], "conectado": True})
    monkeypatch.setattr(marketing_services, "_conversaciones_del_bot",
                        lambda desde, hasta: {"total": del_crm})
    return c.chats(date(2026, 9, 1), date(2026, 10, 1))


def _parte(resultado, clave):
    return next(p["cuantos"] for p in resultado["partes"] if p["clave"] == clave)


def test_solo_las_secuencias_con_cta_entran_en_la_parte_de_historias(monkeypatch):
    """Un día de historias sin CTA también junta respuestas, y esas no son leads.

    Si contáramos todo, el techo del embudo se llenaría de gente que contestó un chiste y
    la tasa a pitch quedaría en el piso sin motivo.
    """
    secuencias = [
        {"fecha": "2026-09-03", "piezas": 4, "respuestas": 18, "cta": True, "historias": [{}]},
        {"fecha": "2026-09-05", "piezas": 3, "respuestas": 40, "cta": False, "historias": [{}]},
        {"fecha": "2026-09-09", "piezas": 5, "respuestas": 7, "cta": True, "historias": [{}]},
    ]
    r = _chats_con(secuencias, del_crm=106, monkeypatch=monkeypatch)

    assert _parte(r, "historias") == 25, "solo las dos marcadas: 18 + 7"
    assert _parte(r, "reels") == 106
    assert r["total"] == 131, "las puertas se suman, no compiten"
    assert r["secuenciasDelPeriodo"] == 3
    assert r["secuenciasConCta"] == 2
    # El detalle tiene que mostrar lo que suma, no todo lo que se publicó.
    assert len(r["detalle"]) == 2


def test_sin_ninguna_marcada_la_parte_de_historias_es_cero(monkeypatch):
    """Cero marcadas es cero por historias, y los reels siguen contando aparte."""
    secuencias = [
        {"fecha": "2026-09-03", "piezas": 4, "respuestas": 18, "cta": False, "historias": [{}]},
        {"fecha": "2026-09-05", "piezas": 3, "respuestas": 40, "cta": False, "historias": [{}]},
    ]
    r = _chats_con(secuencias, del_crm=106, monkeypatch=monkeypatch)

    assert _parte(r, "historias") == 0
    assert r["total"] == 106
    assert r["secuenciasConCta"] == 0


def test_una_secuencia_vieja_sin_el_campo_cta_no_suma(monkeypatch):
    """El estado por defecto es "no suma": lo que no tiene marca, no entra."""
    secuencias = [{"fecha": "2026-09-03", "piezas": 4, "respuestas": 18, "historias": [{}]}]
    assert _parte(_chats_con(secuencias, 0, monkeypatch), "historias") == 0


def test_sin_historias_ni_crm_el_total_es_cero(monkeypatch):
    """Un mes de verdad vacío tiene que dar cero, no un error ni un número prestado."""
    r = _chats_con([], del_crm=0, monkeypatch=monkeypatch)
    assert r["total"] == 0
    assert [p["cuantos"] for p in r["partes"]] == [0, 0, 0]


def test_cada_puerta_trae_sus_filas(monkeypatch):
    """El total tiene que poder abrirse: de qué secuencia y de qué palabra vino cada chat.

    Un número que no se puede auditar se discute en vez de usarse.
    """
    secuencias = [
        {"fecha": "2026-09-01", "piezas": 4, "respuestas": 407, "cta": True,
         "historias": [{"thumbnail": "/uploads/ig/a.jpg"}]},
        {"fecha": "2026-09-08", "piezas": 2, "respuestas": 120, "cta": True, "historias": [{}]},
        {"fecha": "2026-09-05", "piezas": 3, "respuestas": 40, "cta": False, "historias": [{}]},
    ]
    from src.services import instagram_services, marketing_services

    monkeypatch.setattr(instagram_services, "contenido",
                        lambda desde, hasta: {"secuencias": secuencias, "reels": [], "conectado": True})
    monkeypatch.setattr(marketing_services, "_conversaciones_del_bot",
                        lambda desde, hasta: {"total": 106, "porPalabra": {"documento": 40, "info": 8}})
    r = c.chats(date(2026, 9, 1), date(2026, 10, 1))

    historias = next(p for p in r["partes"] if p["clave"] == "historias")
    assert [f["cuando"] for f in historias["filas"]] == ["2026-09-08", "2026-09-01"], "la más nueva arriba"
    assert historias["filas"][1]["cuantos"] == 407
    assert historias["filas"][1]["foto"] == "/uploads/ig/a.jpg"
    assert sum(f["cuantos"] for f in historias["filas"]) == historias["cuantos"]

    reels = next(p for p in r["partes"] if p["clave"] == "reels")
    # 106 del CRM contra 48 con palabra: el resto no se esconde, se nombra.
    assert [f["quien"] for f in reels["filas"]] == ["(sin palabra)", "documento", "info"]
    assert sum(f["cuantos"] for f in reels["filas"]) == 106, "las filas tienen que cerrar con el total"
