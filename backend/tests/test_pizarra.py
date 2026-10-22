"""
Tests de la pizarra de contenido.

Lo que duele si se rompe: que entre una idea con una frase que Juan nunca dijo, o con
una frase del cliente presentada como de Juan.
"""

from src.services import pizarra_services as p

FATHOM = """Meeting: Sesion 1 a 1 - Bases de negocio Luis
Date: 2025-11-04T16:15:55Z
URL: https://fathom.video/calls/461676587

--- TRANSCRIPT ---
[00:14:09] Juan Cruz Carrizo: Entonces, ¿qué le tenés que dar al osito chiquito?
[00:14:11] Juan Cruz Carrizo: Entonces, un servicio es malo hasta cuando das un sobreservicio.
[00:14:15] Juan Cruz Carrizo: Entonces, el servicio bueno es el servicio que está adecuado para la persona.
[00:14:20] luisgaruiz: El problema más grande es que todavía no he acotado al avatar ideal o al cliente ideal.
"""

COPIADO = """0:00 - Juan Cruz Carrizo
Bueno, arrancamos con la parte de contenido que es la que más importa hoy.
1:05 - Ana Scheffer
Yo nunca supe cómo hacer que el contenido me traiga clientes de verdad.
"""


def _idea(cita):
    return {"titulo": "Al osito no le das una ballena", "detalle": "x", "dolor": "Clientes que consumen tiempo", "cita": cita}


def test_segmentos_lee_el_formato_de_fathom():
    segs = p.segmentos(FATHOM)
    assert segs[1] == {"ts": "14:11", "quien": "Juan Cruz Carrizo",
                       "texto": "Entonces, un servicio es malo hasta cuando das un sobreservicio."}
    assert p._cabecera(FATHOM)["url"] == "https://fathom.video/calls/461676587"


def test_segmentos_lee_el_formato_de_copiar_transcripcion():
    segs = p.segmentos(COPIADO)
    assert segs[0]["quien"] == "Juan Cruz Carrizo" and segs[0]["ts"] == "0:00"
    assert segs[1]["quien"] == "Ana Scheffer"


def test_la_cita_textual_entra_con_su_minuto_aunque_cambien_tildes_y_puntuacion():
    idea = p.validar_general(_idea("un servicio es malo hasta cuando das un SOBRESERVICIO"), p.segmentos(FATHOM))
    assert idea["minuto"] == "14:11"


def test_la_cita_puede_cruzar_dos_frases_seguidas_de_juan():
    cita = "das un sobreservicio. Entonces, el servicio bueno es el servicio que está adecuado"
    assert p.validar_general(_idea(cita), p.segmentos(FATHOM)) is not None


def test_una_cita_inventada_no_entra():
    assert p.validar_general(_idea("el sobreservicio es lo peor que le podés hacer a un cliente"), p.segmentos(FATHOM)) is None


def test_una_frase_del_cliente_no_se_presenta_como_de_juan():
    assert p.validar_general(_idea("todavía no he acotado al avatar ideal o al cliente ideal"), p.segmentos(FATHOM)) is None


def test_las_variantes_solo_salen_en_los_canales_fijos():
    v = p.validar_variantes({"yt": [{"titulo": "Uno"}, {"detalle": "sin título"}], "tiktok": [{"titulo": "No va"}], "story": "mal"})
    assert v == {"yt": [{"titulo": "Uno", "detalle": None}], "reel": [], "story": []}


def test_el_token_de_fathom_sale_solo_de_un_link_de_compartir():
    assert p._token_fathom("https://fathom.video/share/abcDEF123_xyz") == "abcDEF123_xyz"
    assert p._token_fathom("https://evil.com/?u=fathom.video/calls/1") is None


def test_las_secuencias_respetan_el_largo_y_los_bloques_fijos():
    h = [{"tipo": "texto", "tamano": "g", "texto": "le vendés lo mismo"}, {"tipo": "imagen", "texto": "mockup del doc"},
         {"tipo": "video", "tamano": "xl", "texto": "raro"}, {"tipo": "texto", "texto": "  "}]
    s = p.validar_secuencias({"secuencias": {"corta": [h] * 6, "media": [h, "no", []], "larga": None}})
    assert len(s["corta"]) == 4                      # más larga que su rango: se corta
    assert len(s["media"]) == 1 and s["larga"] == []
    assert s["corta"][0] == [{"tipo": "texto", "tamano": "g", "texto": "le vendés lo mismo"},
                             {"tipo": "imagen", "texto": "mockup del doc"},
                             {"tipo": "texto", "tamano": "n", "texto": "raro"}]


VTT = """WEBVTT

1
00:14:11.000 --> 00:14:15.000
Juan Carrizo: Entonces, un servicio es malo hasta cuando das un sobreservicio.

2
00:14:20.500 --> 00:14:24.000
Luis Garcia: El problema más grande es que todavía no he acotado al avatar ideal.
"""

LINK_ZOOM = ("https://us06web.zoom.us/rec/play/9RMPd9V2?accessLevel=meeting&startTime=1792421049000"
             "&originRequestUrl=https%3A%2F%2Fus06web.zoom.us%2Frec%2Fshare%2FpXos%3FstartTime%3D1792421049000")


def test_la_transcripcion_de_zoom_se_lee_como_la_de_fathom():
    texto = p.vtt_a_texto(VTT)
    assert texto.splitlines()[0] == "[00:14:11] Juan Carrizo: Entonces, un servicio es malo hasta cuando das un sobreservicio."
    idea = p.validar_general(_idea("un servicio es malo hasta cuando das un sobreservicio"), p.segmentos(texto))
    assert idea["minuto"] == "14:11"


def test_el_link_de_zoom_trae_la_hora_de_la_grabacion():
    assert p._inicio_zoom(LINK_ZOOM).isoformat() == "2026-10-19T14:44:09"
    assert p._inicio_zoom("https://us06web.zoom.us/rec/share/abc") is None


def test_se_elige_la_grabacion_que_arranco_a_esa_hora():
    inicio = p._inicio_zoom(LINK_ZOOM)
    otra = {"topic": "otra", "start_time": "2026-10-19T12:00:00Z", "recording_files": []}
    esta = {"topic": "1 a 1", "start_time": "2026-10-19T14:40:00Z",
            "recording_files": [{"recording_start": "2026-10-19T14:44:10Z", "file_type": "TRANSCRIPT"}]}
    assert p.elegir_grabacion([otra, esta], inicio)["topic"] == "1 a 1"
    assert p.elegir_grabacion([otra], inicio) is None


LARGA = """[00:20:01] Juan Cruz Carrizo: Mirá, eh, lo que pasa es que vos estás vendiendo horas y no estás vendiendo la implementación del sistema completo.
[00:20:09] Cliente: Claro, tiene sentido.
"""


def test_la_cita_casi_textual_entra_con_las_palabras_de_la_llamada():
    idea = p.validar_general(_idea("lo que pasa es que vos estás vendiendo horas y no estás vendiendo la implementación del sistema"), p.segmentos(LARGA))
    assert idea is not None and idea["minuto"] == "20:01"
    idea = p.validar_general(_idea("Mirá, lo que pasa es que estás vendiendo horas y no estás vendiendo la implementación del sistema completo"), p.segmentos(LARGA))
    assert idea["cita"] == "Mirá, eh, lo que pasa es que vos estás vendiendo horas y no estás vendiendo la implementación del sistema completo."


def test_una_cita_parecida_en_el_tema_pero_inventada_no_entra():
    assert p.validar_general(_idea("vos no tenés que vender horas, tenés que vender la implementación completa de un sistema"), p.segmentos(LARGA)) is None
