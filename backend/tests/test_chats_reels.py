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


def test_la_palabra_entre_comillas_vale_sola():
    """Como la escribe Juan: entre comillas tipográficas y muchas veces en minúscula.
    Vale aunque Instagram no devuelva ningún comentario, que es lo que pasa seguido."""
    assert detectar_palabra('comenta \u201cinfo\u201d y te paso el prompt + mi IA', []) == "info"
    assert detectar_palabra('Comenta \u201cDOC\u201d y te mando el análisis completo', []) == "doc"
    assert detectar_palabra("comenta 'clase' y te mando +40min de video", []) == "clase"
    assert detectar_palabra('comenta la palabra \u201cFORMULARIO\u201d y te lo mando', []) == "formulario"


def test_entre_comillas_no_cuenta_si_no_es_una_llamada_a_la_accion():
    assert detectar_palabra('me dijeron \u201cgracias\u201d toda la semana', []) is None
    assert detectar_palabra('comenta \u201cabajo\u201d lo que pensas', []) is None
    assert detectar_palabra('mandame un \u201cDM\u201d', []) is None


def test_si_el_texto_no_la_dice_usa_el_comentario_mas_repetido():
    # 21/09: el texto no nombraba la palabra; 46 de 50 comentaron "clase".
    comentarios = ["clase"] * 46 + ["clase🔥"] * 2 + ["genio", "jaja"]
    assert detectar_palabra("como alterar tu realidad con una sola acción", _n(comentarios)) == "clase"


def test_un_reel_sin_llamada_a_la_accion_no_tiene_palabra():
    comentarios = ["que bueno", "genio", "tal cual", "jaja", "crack", "100%"]
    assert detectar_palabra("una reflexión", _n(comentarios)) is None


def test_pocos_comentarios_iguales_no_alcanzan():
    assert detectar_palabra("sin cta", _n(["hola", "hola", "genio"])) is None


def test_un_reel_con_la_palabra_en_el_texto_tiene_cta_aunque_no_haya_chats():
    """Instagram oculta por spam justo los comentarios que escriben la palabra: el reel del
    19-10 pedía \u201cinfo\u201d y devolvió 0 de 45 comentarios. Tiene CTA igual."""
    from datetime import datetime

    from pony.orm import db_session

    from src.db import db, init_db
    from src.services.chats_reels_services import estado

    if db.provider is None:
        init_db()
    from src.models import PublicacionIg

    with db_session:
        for x in list(PublicacionIg.select()):
            if x.ig_id.startswith("reel_prueba_"):
                x.delete()
        PublicacionIg(ig_id="reel_prueba_cta", tipo="reel", publicado_at=datetime.utcnow(),
                      caption='tu tiempo es un problema.\n\ncomenta \u201cinfo\u201d y te paso el prompt')
        PublicacionIg(ig_id="reel_prueba_sin", tipo="reel", publicado_at=datetime.utcnow(),
                      caption="un reel que no pide nada, solo cuenta algo")
    try:
        e = estado()
        assert e["reel_prueba_cta"] == {"origen": "auto", "esCta": True, "palabra": "info", "chats": 0}
        assert "reel_prueba_sin" not in e
    finally:
        with db_session:
            for x in list(PublicacionIg.select()):
                if x.ig_id.startswith("reel_prueba_"):
                    x.delete()


def test_la_pagina_siguiente_sirve_aunque_venga_con_otra_version():
    """Instagram devuelve la página siguiente con su versión (v25.0), no con la de Ops."""
    from src.services.audiencia_services import _ruta_siguiente

    url = "https://graph.facebook.com/v25.0/18081118955701487/comments?limit=50&after=abc"
    assert _ruta_siguiente(url) == "18081118955701487/comments"
    assert _ruta_siguiente("https://graph.instagram.com/v21.0/123/comments?x=1") == "123/comments"
