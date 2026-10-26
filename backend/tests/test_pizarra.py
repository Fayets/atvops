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


def test_de_una_llamada_salen_hasta_5_ideas_sin_repetir_frase_ni_colar_inventadas():
    segs = p.segmentos(FATHOM)
    buena = _idea("un servicio es malo hasta cuando das un sobreservicio")
    otra = {**_idea("el servicio bueno es el servicio que está adecuado para la persona"),
            "titulo": "qué le tenés que dar al osito chiquito"}
    inventada = _idea("el sobreservicio es lo peor que le podés hacer a un cliente")
    ideas = p.validar_generales({"ideas": [buena, inventada, buena, otra]}, segs)
    # El título se escribe como titula Juan (no tiene que estar dicho tal cual); si está en la
    # llamada, queda con sus palabras exactas.
    assert [i["titulo"] for i in ideas] == ["Al osito no le das una ballena",
                                            "¿qué le tenés que dar al osito chiquito?"]
    # Sin título usable, sale del arranque de la frase de Juan.
    sin_titulo = {**buena, "titulo": ""}
    assert p.validar_generales({"ideas": [sin_titulo]}, segs) == []  # sin título no hay idea
    largo = {**buena, "titulo": " ".join(["palabra"] * 20)}
    assert p.validar_generales({"ideas": [largo]}, segs)[0]["titulo"] == \
        "un servicio es malo hasta cuando das un sobreservicio"
    assert len(p.validar_generales({"ideas": [buena] * 3 + [otra] * 3}, segs)) == 2
    assert p.validar_generales({"ideas": []}, segs) == []


def test_los_bocetos_aceptan_las_flechas_marcas_y_graficos_de_juan():
    data = {"secuencias": {"corta": [[
        {"tipo": "texto", "tamano": "n", "texto": "responde [[ACCESO]] en {{1 día}}"},
        {"tipo": "flecha", "color": "roja", "texto": "a la palabra"},
        {"tipo": "flecha", "color": "violeta"},
        {"tipo": "imagen", "texto": "captura de la bio", "marcas": ["autoridad", "promesa", 3, ""]},
        {"tipo": "diagrama", "texto": "curiosidad → chats → agendas → ventas", "ciclo": True},
        {"tipo": "diagrama", "texto": "un solo paso"},
        {"tipo": "grafico", "forma": "barras", "datos": [{"etiqueta": "90%", "valor": "90%"}, {"etiqueta": "10%", "valor": 10}], "texto": "tu esfuerzo"},
        {"tipo": "grafico", "texto": "dos barras dibujadas a mano: una enorme y una chica"},
    ]]}}
    corta = p.validar_secuencias(data)["corta"][0]
    assert [b["tipo"] for b in corta] == ["texto", "flecha", "flecha", "imagen", "diagrama", "grafico"]
    assert corta[2]["color"] == "roja"  # un color que no es de Juan vuelve al rojo
    assert corta[3]["marcas"] == ["autoridad", "promesa"]
    assert corta[4] == {"tipo": "diagrama", "texto": "curiosidad → chats → agendas → ventas", "ciclo": True}
    assert corta[5] == {"tipo": "grafico", "forma": "barras", "texto": "tu esfuerzo",
                        "datos": [{"etiqueta": "90%", "valor": 90.0}, {"etiqueta": "10%", "valor": 10.0}]}
    assert len(corta) == 6  # el gráfico descripto en texto, sin datos, no entra


def test_el_titulo_de_una_idea_de_historias_no_repite_el_nombre_de_la_estructura():
    est = {"te-lo-dibujo": {"nombre": "Te lo dibujo"}}
    v = p.validar_variantes({"story": [{"titulo": "Te lo dibujo: de los chats al cash collected", "detalle": "x", "estructura": "te-lo-dibujo"},
                                       {"titulo": "ojo: esto no es ads", "detalle": "x", "estructura": "te-lo-dibujo"}]}, est)
    assert [i["titulo"] for i in v["story"]] == ["de los chats al cash collected", "ojo: esto no es ads"]


def test_una_historia_puede_usar_un_dibujo_real_de_la_llamada_y_no_uno_inventado():
    data = {"secuencias": {"corta": [[
        {"tipo": "imagen", "dibujo": 7, "texto": "el embudo de la clase"},
        {"tipo": "imagen", "dibujo": 99, "texto": "un dibujo que no existe"},
        {"tipo": "imagen", "dibujo": "7"},
    ]]}}
    corta = p.validar_secuencias(data, {7: "/uploads/pizarra/dibujos/1/2283.jpg"})["corta"][0]
    assert corta[0]["src"] == "/uploads/pizarra/dibujos/1/2283.jpg" and corta[0]["dibujo"] == 7
    assert "src" not in corta[1]  # queda como hueco a buscar
    assert corta[2]["src"].endswith("2283.jpg")


ZOOM = """[00:10:00] Aumenta Tu Valor (aumentatuvalorx@gmail.com): primero va la narrativa y después los anuncios que la acompañan
[00:10:20] Alan Klein: a mí me bajó un montón el alcance con tantos testimonios
"""


def test_en_las_clases_juan_figura_como_la_cuenta_de_zoom_y_el_alumno_no_pasa_por_juan():
    segs = p.segmentos(ZOOM)
    assert p.validar_general(_idea("primero va la narrativa y después los anuncios que la acompañan"), segs) is not None
    assert p.validar_general(_idea("me bajó un montón el alcance con tantos testimonios"), segs) is None


def test_si_nadie_en_la_transcripcion_es_juan_no_entra_ninguna_frase():
    segs = p.segmentos("[00:01:00] Ana: el contenido no me trae clientes de verdad nunca\n[00:02:00] Pedro: a mí tampoco me pasa eso")
    assert p.validar_general(_idea("el contenido no me trae clientes de verdad nunca"), segs) is None
    assert p.quienes_hablan(segs) == ["Ana", "Pedro"]


EMBUDO = {"id": 3, "src": "/uploads/pizarra/dibujos/5/2283.jpg", "minuto": "38:03",
          "descripcion": "embudo en rojo: 2000 → 1000 R → 1600 chats → 1000 conversaciones → 30 agendas → 20 cierres",
          "dicho": "si quieren hacer 30k cuántas conversaciones tienen que abrir este mes"}
PLANTA = {"id": 4, "src": "/uploads/pizarra/dibujos/5/1893.jpg", "minuto": "31:33",
          "descripcion": "una planta: la idea = 21k, semillas en la maceta", "dicho": "las semillas son ideas que se riegan"}
IDEA = "tu facturación es consecuencia de números: cuántas conversaciones y chats abrís por semana"


def test_si_el_dibujo_de_juan_tiene_que_ver_va_en_cada_secuencia_en_lugar_del_diagrama_inventado():
    sec = {"corta": [[{"tipo": "texto", "tamano": "g", "texto": "tu orgánico no es predecible"}],
                     [{"tipo": "texto", "tamano": "n", "texto": "armé el cálculo de chats"}, {"tipo": "imagen", "texto": "mockup del cálculo de chats"}]],
           "media": [[{"tipo": "texto", "tamano": "n", "texto": "agarrá tu mejor mes"},
                      {"tipo": "diagrama", "texto": "cash collected → llamadas → agendas → conversaciones → chats", "ciclo": False}]],
           "larga": [[{"tipo": "texto", "tamano": "n", "texto": "Gianluca"}, {"tipo": "imagen", "texto": "x", "dibujo": 3, "src": "y"}]]}
    out = p.asegurar_dibujos(sec, [EMBUDO, PLANTA], IDEA)
    assert out["media"][0][1]["dibujo"] == 3                     # reemplazó el diagrama que lo imitaba
    assert out["corta"][1][1]["dibujo"] == 3                     # fue al hueco de la historia del cálculo
    assert [b.get("dibujo") for b in out["larga"][0]] == [None, 3]  # la que ya tenía uno queda igual


def test_un_dibujo_que_no_tiene_que_ver_con_la_idea_no_se_fuerza():
    sec = {"corta": [[{"tipo": "texto", "tamano": "g", "texto": "algo"}]], "media": [], "larga": []}
    assert p.asegurar_dibujos(sec, [PLANTA], IDEA)["corta"] == [[{"tipo": "texto", "tamano": "g", "texto": "algo"}]]


def test_el_dibujo_que_juan_hizo_cerca_de_la_frase_de_la_idea_es_de_esa_idea_aunque_no_compartan_palabras():
    otra_idea = "la regla 90-10: potenciá lo que ya vende y testeá al costado"
    planta = {**PLANTA, "segundo": 1893}
    assert p.dibujos_de_la_idea([planta], otra_idea, cerca_de=1600) == [planta]   # a 5 minutos
    assert p.dibujos_de_la_idea([planta], otra_idea, cerca_de=4200) == []         # a 38 minutos
    sec = {"corta": [[{"tipo": "texto", "tamano": "g", "texto": "algo"}, {"tipo": "imagen", "texto": "foto de noche"}]], "media": [], "larga": []}
    assert p.asegurar_dibujos(sec, [planta], otra_idea, cerca_de=1600)["corta"][0][1]["dibujo"] == 4


# ------------------------------------------------------------------ sin llamada

def test_cada_origen_dice_de_donde_arranca_la_idea():
    titulo, material = p._material("dolor", "  Subo contenido todos los días  y no vendo. ")
    assert titulo == "Dolor · Subo contenido todos los días y no vendo."
    assert "un dolor de la audiencia" in material
    titulo, material = p._material("tema", "contratan un closer antes de tener oferta")
    assert titulo == "Tema · contratan un closer antes de tener oferta"
    assert "el tema que quiere contar Juan" in material


def test_copiar_una_secuencia_es_copiarle_la_forma_y_no_el_tema():
    """Si no se le dice, vuelve a contar lo mismo que ese día y la idea "nueva" es la vieja."""
    titulo, material = p.material_de_secuencia("2026-10-14", "gancho personal → preguntas de clientes → CTA", "Me preguntaron")
    assert titulo == "Como la del 14-10-2026"
    assert "Estructura: Me preguntaron" in material
    assert "la FORMA, no el tema" in material
    assert "temas distintos al de ese día" in material


def test_sin_de_donde_arrancar_no_se_arma_nada():
    import pytest
    from fastapi import HTTPException

    for origen, valor in (("dolor", ""), ("tema", "   "), ("secuencia", "")):
        with pytest.raises(HTTPException):
            p._material(origen, valor)


def test_un_origen_que_no_existe_no_entra():
    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        p.crear_sin_llamada("lo-que-se-me-ocurra", "algo", "franco")
    assert e.value.status_code == 422


def test_una_idea_de_secuencia_sin_estructura_real_de_juan_no_llega_a_la_pantalla():
    """Sin llamada no hay cita que verificar: la estructura es la única red que queda."""
    claves = {"por-que-no-vendes": {"nombre": "Te digo por qué no vendés"}, "te-lo-dibujo": {"nombre": "Te lo dibujo"}}
    crudo = {"story": [
        {"titulo": "subís todos los días y no vende nada", "detalle": "x", "estructura": "por-que-no-vendes"},
        {"titulo": "una idea linda", "detalle": "x", "estructura": "la-que-se-le-ocurrio"},
        {"titulo": "Te lo dibujo: por dónde se escapa la gente", "detalle": "x", "estructura": "te-lo-dibujo"},
        {"titulo": "sin estructura ninguna", "detalle": "x"},
    ]}
    salida = p.validar_variantes(crudo, claves)["story"]
    assert [v["estructura"] for v in salida] == ["por-que-no-vendes", "te-lo-dibujo"]
    # El nombre de la estructura ya se ve en su etiqueta: no va también en el título.
    assert salida[1]["titulo"] == "por dónde se escapa la gente"


def test_el_pedido_le_prohibe_escribir_una_frase_de_juan():
    """Sin transcripción el código no puede verificar una cita, así que la salida es no
    tenerla: si Claude igual escribe una, nadie la va a poder desmentir."""
    assert "NO hay frase de Juan" in p.SYSTEM_IDEAS_STORY
    assert "No inventes cifras" in p.SYSTEM_IDEAS_STORY
