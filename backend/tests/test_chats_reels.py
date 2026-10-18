"""
Tests de los chats de reels sin ManyChat.

Lo que se fija acá es cómo se encuentra la palabra de un reel, que es lo que antes había que
cargar a mano en el JSON de ManyChat. Los casos salen de reels reales de la cuenta.
"""

from src.services.chats_reels_services import coincide, detectar_palabra, normalizar


def _n(lista):
    return [normalizar(x) for x in lista]


def test_normaliza_emojis_acentos_y_mayusculas():
    assert normalizar("Clase🔥") == "clase"
    assert normalizar("  ONBOARDING!! ") == "onboarding"
    assert normalizar("Tutoría") == "tutoria"


def test_la_palabra_es_palabra_entera():
    assert coincide("quiero el doc", "doc")
    assert not coincide("doctor", "doc")


def test_usa_la_palabra_que_pide_el_texto():
    caption = 'Este formulario hizo que la gente venga así, comenta la palabra "FORMULARIO" y te lo mando'
    assert detectar_palabra(caption, _n(["FORMULARIO"] * 43)) == "formulario"


def test_si_el_texto_no_la_dice_usa_el_comentario_mas_repetido():
    # 21/09: el texto no nombraba la palabra; 46 de 50 comentaron "clase".
    comentarios = ["clase"] * 46 + ["clase🔥"] * 2 + ["genio", "jaja"]
    assert detectar_palabra("como alterar tu realidad con una sola acción", _n(comentarios)) == "clase"


def test_un_reel_sin_llamada_a_la_accion_no_tiene_palabra():
    comentarios = ["que bueno", "genio", "tal cual", "jaja", "crack", "100%"]
    assert detectar_palabra("una reflexión", _n(comentarios)) is None


def test_pocos_comentarios_iguales_no_alcanzan():
    assert detectar_palabra("sin cta", _n(["hola", "hola", "genio"])) is None


def test_la_pagina_siguiente_sirve_aunque_venga_con_otra_version():
    """Instagram devuelve la página siguiente con su versión (v25.0), no con la de Ops."""
    from src.services.audiencia_services import _ruta_siguiente

    url = "https://graph.facebook.com/v25.0/18081118955701487/comments?limit=50&after=abc"
    assert _ruta_siguiente(url) == "18081118955701487/comments"
    assert _ruta_siguiente("https://graph.instagram.com/v21.0/123/comments?x=1") == "123/comments"
