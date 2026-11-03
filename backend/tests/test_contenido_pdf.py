"""El PDF del contenido del mes: que salga un PDF de verdad y no se caiga con lo que falta."""

from src.services import contenido_pdf_services as pdf

REEL = {"id": "1", "titulo": "cómo usar tu tiempo.", "fecha": "2026-10-26T18:00:00",
        "thumbnail": "/uploads/ig/no_existe.jpg", "views": 11920, "reach": 6843, "likes": 401,
        "comments": 83, "shares": 97, "saved": 206, "total_interactions": 792, "chats": 47,
        "keyword": "calendario", "cta": {"esCta": True, "palabra": "calendario"},
        "audiencia": {"personas": 57, "analizados": 57, "calificados": 13, "pct": 22.8}}
SEC = {"fecha": "2026-10-20", "piezas": 2, "vistas": 31495, "alcance": 24616, "respuestas": 357,
       "cta": True, "historias": [{"thumbnail": None, "views": 9260},
                                  {"thumbnail": "/uploads/ig/no_existe.jpg", "views": 8234}]}


def test_el_pdf_de_reels_sale_aunque_falte_la_miniatura():
    b = pdf.reels_pdf([("2026-10", [REEL] * 9)])   # más de una hoja
    assert b[:5] == b"%PDF-" and len(b) > 1000


def test_el_pdf_de_historias_sale_con_varios_meses_y_piezas_sin_foto():
    b = pdf.historias_pdf([("2026-10", [SEC] * 6), ("2026-09", [SEC] * 2)])
    assert b[:5] == b"%PDF-" and len(b) > 1000


def test_un_reel_sin_analizar_no_rompe_la_banda_de_calificados():
    sin = {**REEL, "audiencia": None, "cta": {"esCta": False}, "chats": 0}
    assert pdf.reels_pdf([("2026-10", [sin])])[:5] == b"%PDF-"


def test_los_numeros_van_con_punto_de_miles_como_en_la_pantalla():
    assert pdf._n(45725) == "45.725" and pdf._n(None) == "0"
    assert pdf._pct(22.8) == "22,8%" and pdf._pct(None) == "—"
    assert pdf._dia("2026-10-26T18:00:00") == "26 de octubre"
