"""
Tests del reporte automático de llamadas.

Lo que se prueba es lo que duele si se rompe: que la firma del webhook no se pueda
falsificar, que un estado inventado por la IA no entre al sistema, y que el reporte
no pise lo que ya cargó el closer a mano.
"""

import base64
import contextlib
import hashlib
import hmac
import json
from datetime import datetime, timezone

import pytest

from src.services import fathom_services as f

SECRETO_B64 = base64.b64encode(b"un-secreto-de-prueba").decode()
ESTADOS = ("Cerrado", "Seña", "Seguimiento", "No show", "Descalificado", "Cancelada",
           "Re-agenda", "Agendado", "Descartada")
PLANES = ["Mentoría", "Boost"]


class Cabeceras(dict):
    """Starlette normaliza los nombres; el dict de test hace lo mismo."""

    def get(self, k, default=None):
        return super().get(k.lower(), default)


def _firmar(cuerpo: bytes, wid="msg_1", ts=None, secreto=SECRETO_B64):
    ts = ts or str(int(datetime.now(timezone.utc).timestamp()))
    firmado = f"{wid}.{ts}.".encode() + cuerpo
    firma = base64.b64encode(hmac.new(base64.b64decode(secreto), firmado, hashlib.sha256).digest()).decode()
    return Cabeceras({"webhook-id": wid, "webhook-timestamp": ts, "webhook-signature": f"v1,{firma}"})


@pytest.fixture(autouse=True)
def _con_secreto(monkeypatch):
    monkeypatch.setattr(f, "SECRETO", f"whsec_{SECRETO_B64}")


# ------------------------------------------------------------------ firma

def test_una_firma_valida_pasa():
    cuerpo = b'{"title":"Llamada"}'
    f.verificar_firma(cuerpo, _firmar(cuerpo))  # no levanta


def test_un_cuerpo_cambiado_no_pasa():
    """Sin esto, cualquiera puede mandarnos un cierre de US$ 5.000 que no existió."""
    cabeceras = _firmar(b'{"title":"Llamada"}')
    with pytest.raises(f.AvisoNoAutorizado):
        f.verificar_firma(b'{"title":"Otra"}', cabeceras)


def test_un_aviso_viejo_no_pasa():
    """Ventana de 5 min: un pedido capturado no se puede repetir mañana."""
    cuerpo = b'{"a":1}'
    viejo = str(int(datetime.now(timezone.utc).timestamp()) - 3600)
    with pytest.raises(f.AvisoNoAutorizado):
        f.verificar_firma(cuerpo, _firmar(cuerpo, ts=viejo))


def test_sin_secreto_configurado_no_pasa_nada(monkeypatch):
    monkeypatch.setattr(f, "SECRETO", "")
    cuerpo = b'{"a":1}'
    with pytest.raises(f.AvisoNoAutorizado):
        f.verificar_firma(cuerpo, _firmar(cuerpo))


# ------------------------------------------------------------------ validación

def test_un_estado_inventado_queda_vacio():
    """Claude tiene que elegir de la lista; 'Casi cerrado' no es un estado del sistema."""
    campos = f._validar({"estado": "Casi cerrado", "plan": "Mentoria Premium"}, ESTADOS, PLANES)
    assert campos["estado"] is None
    assert campos["plan"] is None


def test_el_estado_entra_sin_importar_mayusculas():
    assert f._validar({"estado": "seguimiento"}, ESTADOS, PLANES)["estado"] == "Seguimiento"


@pytest.mark.parametrize("escrito, esperado", [
    (2000, 2000.0),
    ("2000", 2000.0),
    # El punto es ambiguo: acá es de miles, no decimal. Antes "US$ 1.500" entraba
    # como 1,5 dólares — un error que nadie iba a mirar.
    ("US$ 1.500", 1500.0),
    ("1.500", 1500.0),
    ("1.5", 1.5),
    ("US$ 1,500.50", 1500.5),
    ("1.500,75", 1500.75),
    (None, None),
    ("", None),
    ("no dijo", None),
])
def test_el_cash_acepta_lo_que_manda_claude(escrito, esperado):
    assert f._validar({"cash_usd": escrito}, ESTADOS, PLANES)["cashUsd"] == esperado


def test_el_json_sale_aunque_venga_envuelto_en_backticks():
    assert f._json_de('```json\n{"estado":"Cerrado"}\n```')["estado"] == "Cerrado"
    assert f._json_de('Acá va:\n{"estado":"Seña"}')["estado"] == "Seña"


# ------------------------------------------------------------------ lectura del aviso

def test_la_transcripcion_se_arma_venga_como_venga():
    """Fathom la manda como texto o como lista de intervenciones."""
    plano = f.datos_de({"transcript": "Nick: hola\nLead: hola"})
    assert "Nick: hola" in plano["transcripcion"]

    lista = f.datos_de({"transcript": [
        {"speaker": {"display_name": "Nick"}, "text": "hola"},
        {"speaker": "Lead", "text": "qué tal"},
    ]})
    assert lista["transcripcion"] == "Nick: hola\nLead: qué tal"


def test_se_distingue_al_prospecto_del_equipo():
    datos = f.datos_de({"invitees": [
        {"name": "Nick", "email": "nick@atv.com", "is_external": False},
        {"name": "Ana", "email": "ana@gmail.com", "is_external": True},
    ]})
    assert f._emails_externos(datos) == {"ana@gmail.com"}


# ------------------------------------------------------------------ no pisar

class ReunionFalsa:
    def __init__(self, **kw):
        self.resultado = self.programa = self.nota = ""
        self.cash_usd = None
        self.actualizado_por = self.actualizado_at = None
        self.reporte_ia = self.reporte_mensaje = self.reporte_at = self.fathom_url = None
        self.__dict__.update(kw)


CAMPOS = {"lead": "Ana", "estado": "Cerrado", "plan": "Boost", "cashUsd": 2000.0,
          "encajePuntaje": None, "encaje": None, "encajeMotivo": None,
          "nota": "Cerró en la llamada, manda el resto el lunes.",
          "resumen": "Coach de fitness en Córdoba, facturando 3k. Cerró porque ya venía siguiendo a Juan.",
          "saldoUsd": None, "proximoPaso": "manda el pago el lunes", "objecion": None}


def test_completa_la_llamada_que_estaba_vacia():
    r = ReunionFalsa()
    f._guardar(r, {"url": "https://fathom.video/x"}, CAMPOS)
    assert r.resultado == "Cerrado"
    assert r.programa == "Boost"
    assert r.cash_usd == 2000.0
    assert r.actualizado_por == "fathom"


def test_no_pisa_lo_que_cargo_el_closer():
    """La regla que sostiene todo: si la IA corrige a una persona, deja de confiarse."""
    r = ReunionFalsa(resultado="Seguimiento", programa="Mentoría", cash_usd=500.0, nota="lo habló conmigo")
    resultado = f._guardar(r, {"url": ""}, CAMPOS)
    assert r.resultado == "Seguimiento"
    assert r.programa == "Mentoría"
    assert r.cash_usd == 500.0
    assert r.nota == "lo habló conmigo"
    assert resultado["completados"] == []
    # El reporte igual queda guardado al lado, para poder comparar.
    assert json.loads(r.reporte_ia)["estado"] == "Cerrado"


def test_el_reporte_queda_guardado_aunque_no_complete_nada():
    r = ReunionFalsa(resultado="Cerrado")
    f._guardar(r, {"url": "https://fathom.video/x"}, CAMPOS)
    assert r.reporte_at is not None
    assert r.fathom_url == "https://fathom.video/x"


# ------------------------------------------------------------------ el mensaje

def test_el_mensaje_calca_los_campos_del_formulario():
    """Arriba van Resultado, Programa y Cash cobrado, en ese orden: cargar es copiar."""
    texto = f.mensaje({"inicio": datetime(2026, 9, 21, 15, 0), "titulo": "", "url": ""}, CAMPOS, ReunionFalsa())
    assert "Ana" in texto
    assert texto.index("*Resultado:* Cerrado") < texto.index("*Programa:* Boost") < texto.index("*Cash cobrado:*")
    assert "2,000" in texto


def test_el_mensaje_muestra_lo_que_cargo_el_equipo_no_lo_que_leyo_la_ia():
    """Dos versiones distintas del mismo número en el grupo es peor que ninguna."""
    r = ReunionFalsa(resultado="Seña", programa="Mentoría", cash_usd=50.0)
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""}, CAMPOS, r)
    assert "*Resultado:* Seña" in texto
    assert "*Cash cobrado:* US$ 50" in texto
    assert "2,000" not in texto


def test_el_programa_es_solo_el_nombre_de_la_oferta_que_cerro():
    """Es la excepción a "lo cargado manda": el grupo necesita ver qué se vendió de
    verdad, no el nombre viejo que alguien eligió de una lista. Sin precio ni aclaración
    al lado: el renglón tiene que leerse de un vistazo."""
    r = ReunionFalsa(resultado="Seña", programa="Mentoría")
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""}, CAMPOS, r)
    assert "*Programa:* Boost\n" in texto
    assert "cargado como" not in texto
    assert "US$ 20" not in texto


def test_si_la_ia_no_supo_el_programa_se_usa_el_cargado():
    r = ReunionFalsa(resultado="Seña", programa="Mentoría")
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""}, CAMPOS | {"plan": None}, r)
    assert "*Programa:* Mentoría" in texto
    assert "cargado como" not in texto


def test_sin_cash_cobrado_la_linea_queda_igual():
    """El campo va siempre: un renglón faltante se lee como que nadie lo miró."""
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""}, CAMPOS | {"cashUsd": None}, ReunionFalsa())
    assert "*Cash cobrado:* —" in texto


def test_avisa_cuando_no_encontro_la_llamada_en_el_calendario():
    """Si no se apareó, el reporte no quedó cargado en ningún lado: hay que decirlo."""
    texto = f.mensaje({"inicio": None, "titulo": "Llamada", "url": ""}, CAMPOS, None)
    assert "No la encontré en el calendario" in texto


def test_avisa_cuando_no_pudo_determinar_el_estado():
    campos = CAMPOS | {"estado": None}
    texto = f.mensaje({"inicio": None, "titulo": "Llamada", "url": ""}, campos, ReunionFalsa())
    assert "no se pudo determinar" in texto


def test_la_nota_y_el_resumen_llegan_como_dos_frases():
    """Pedir "máximo 200 caracteres" no funciona: Haiku devuelve el párrafo igual y el
    recorte lo corta a mitad de idea. Una restricción de estructura sí la respeta."""
    campos = f._validar({
        "nota": ["Pagó $50 de seña.", "Primer pago el 30/11."],
        "resumen": ["Storymaker en transición.", "Cerró por la charla con Cris."],
    }, ESTADOS, PLANES)
    assert campos["nota"] == "Pagó $50 de seña. Primer pago el 30/11."
    assert campos["resumen"] == "Storymaker en transición. Cerró por la charla con Cris."


def test_una_tercera_frase_se_descarta():
    """Dos, no tres: si se dejan crecer vuelve el párrafo que Franco pidió sacar."""
    campos = f._validar({"nota": ["Una.", "Dos.", "Tres.", "Cuatro."]}, ESTADOS, PLANES)
    assert campos["nota"] == "Una. Dos."


def test_si_manda_un_string_igual_se_usa():
    """El modelo a veces ignora la estructura: mejor usar lo que mandó que perderlo."""
    assert f._validar({"nota": "Una nota suelta."}, ESTADOS, PLANES)["nota"] == "Una nota suelta."


def test_una_frase_larguisima_se_corta_igual():
    """La red de seguridad sigue: una sola frase de mil caracteres se acota."""
    largo = "palabra " * 200
    corto = f._validar({"nota": [largo]}, ESTADOS, PLANES)["nota"]
    assert len(corto) <= 126
    assert corto.endswith("…")


@pytest.mark.parametrize("campo, tope", [("nota", 125), ("resumen", 125)])
def test_nunca_se_corta_a_mitad_de_una_palabra(campo, tope):
    """En el grupo se leyó "...para e": parecía un mensaje roto, no uno resumido."""
    largo = "Claudio y Dylan tienen una agencia de marketing y automatizaciones " * 20
    corto = f._validar({campo: [largo]}, ESTADOS, PLANES)[campo]
    assert corto.endswith("…")
    assert len(corto) <= tope + 1
    # Lo que queda antes de los puntos suspensivos son palabras enteras.
    assert largo.startswith(corto[:-1])
    assert corto[-2] != " "


def test_el_resumen_va_entre_la_nota_y_el_link():
    texto = f.mensaje({"inicio": None, "titulo": "", "url": "https://fathom.video/share/x"},
                      CAMPOS, ReunionFalsa())
    assert texto.index(CAMPOS["nota"]) < texto.index("*Resumen:*") < texto.index("https://")


def test_el_encabezado_no_lleva_emoji():
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""}, CAMPOS, ReunionFalsa())
    assert texto.splitlines()[0].startswith("*")


def test_el_mensaje_entra_en_una_pantalla():
    """Franco lo pidió corto: si no se lee de un vistazo, nadie lo usa para cargar."""
    texto = f.mensaje({"inicio": datetime(2026, 9, 21, 15, 0), "titulo": "",
                       "url": "https://fathom.video/share/x"}, CAMPOS, ReunionFalsa())
    assert len(texto.splitlines()) <= 11


def test_un_reintento_de_fathom_no_vuelve_a_encolar(monkeypatch):
    """Fathom reintenta los avisos que fallan: sin esto el grupo ve la misma
    llamada dos o tres veces."""
    import src.services.fathom_services as fs
    ya_enviada = ReunionFalsa(resultado="Seña", evento_id="ev1")
    ya_enviada.reporte_enviado_at = datetime(2026, 9, 21, 12, 0)

    monkeypatch.setattr(fs, "verificar_firma", lambda *a, **k: None)
    monkeypatch.setattr(fs, "extraer", lambda datos: CAMPOS)
    monkeypatch.setattr(fs, "buscar_reunion", lambda *a, **k: ya_enviada)
    monkeypatch.setattr(fs, "db_session", contextlib.nullcontext())

    cuerpo = json.dumps({"title": "x", "transcript": "Nick: hola"}).encode()
    fs.recibir(cuerpo, Cabeceras({}))
    assert ya_enviada.reporte_enviado_at == datetime(2026, 9, 21, 12, 0)


# ------------------------------------------------- encaje de la venta

def test_el_encaje_se_ve_siempre_que_hubo_venta():
    """Si solo apareciera el aviso malo, nadie sabría que la validación existe ni
    confiaría en ella el día que salta. Lo que cambia es el signo, no la presencia."""
    base = {"inicio": None, "titulo": "", "url": ""}
    ok = f.mensaje(base, CAMPOS | {"encaje": "ok", "encajePuntaje": 9, "encajeMotivo": "15-20k/mes, equipo de 5"}, ReunionFalsa())
    assert "*Encaje:* 9/10 · 15-20k/mes, equipo de 5" in ok

    mal = f.mensaje(base, CAMPOS | {"encaje": "no", "encajePuntaje": 3, "encajeMotivo": "factura $600/mes y la cuota es $1.800"}, ReunionFalsa())
    assert "*Encaje:* 3/10 · factura $600/mes y la cuota es $1.800" in mal

    dudoso = f.mensaje(base, CAMPOS | {"encaje": "dudoso", "encajePuntaje": 6, "encajeMotivo": "factura $9k y compró Mid"}, ReunionFalsa())
    assert "*Encaje:* 6/10" in dudoso


def test_un_encaje_sin_motivo_igual_dice_algo():
    """Un "⚠️" pelado es una alarma muda: no dice qué mirar."""
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""},
                      CAMPOS | {"encaje": "no", "encajePuntaje": 2, "encajeMotivo": None}, ReunionFalsa())
    assert "*Encaje:* 2/10 · la oferta no le cierra a esta persona" in texto


def test_sin_venta_no_se_valida_el_encaje():
    """En un no show o un seguimiento no se vendió nada: no hay nada que validar."""
    campos = CAMPOS | {"estado": "Seguimiento", "encaje": "ok"}
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""}, campos, ReunionFalsa(resultado="Seguimiento"))
    assert "Encaje" not in texto


@pytest.mark.parametrize("puntaje, esperado", [
    (10, "ok"), (9, "ok"), (8, "ok"),
    (7, "dudoso"), (5, "dudoso"),
    (4, "no"), (1, "no"),
])
def test_el_signo_sale_del_puntaje(puntaje, esperado):
    """Una sola fuente: pedirle al modelo el número Y el veredicto invita a que se
    contradigan, y después hay que decidir cuál gana."""
    assert f._validar({"encaje_puntaje": puntaje}, ESTADOS, PLANES)["encaje"] == esperado


@pytest.mark.parametrize("crudo", [0, 11, -3, "muy bueno", None, ""])
def test_un_puntaje_fuera_de_escala_se_descarta(crudo):
    """Un 12 o un 0 dicen que no estaba usando la escala: quedarse con el número sería
    fingir que sí."""
    campos = f._validar({"encaje_puntaje": crudo}, ESTADOS, PLANES)
    assert campos["encajePuntaje"] is None
    assert campos["encaje"] is None


def test_la_facturacion_se_lee_como_numero():
    assert f._validar({"facturacion_usd": "US$ 15.000"}, ESTADOS, PLANES)["facturacionUsd"] == 15000.0
    assert f._validar({"facturacion_usd": None}, ESTADOS, PLANES)["facturacionUsd"] is None


def test_reencolar_es_la_marcha_atras_del_marcado(monkeypatch):
    """El aviso repetido de Fathom ya no reencola, así que hace falta una forma
    explícita de pedir que un reporte vuelva a salir: cambió el formato del mensaje,
    o se corrigió el resultado."""
    import src.services.fathom_services as fs
    enviada = ReunionFalsa(reporte_mensaje="el reporte")
    enviada.reporte_enviado_at = datetime(2026, 9, 22, 12, 0)

    monkeypatch.setattr(fs, "db_session", lambda f: f)
    monkeypatch.setattr(fs.ReunionCrm, "get", staticmethod(lambda **kw: enviada))
    assert fs.reencolar(["ev1"]) == 1
    assert enviada.reporte_enviado_at is None


def test_no_se_reencola_un_reporte_que_no_existe(monkeypatch):
    """Sin mensaje armado no hay nada que mandar: reencolarlo dejaría una fila muda
    trabada en la cola para siempre."""
    import src.services.fathom_services as fs
    vacia = ReunionFalsa(reporte_mensaje="")
    monkeypatch.setattr(fs, "db_session", lambda f: f)
    monkeypatch.setattr(fs.ReunionCrm, "get", staticmethod(lambda **kw: vacia))
    assert fs.reencolar(["ev1"]) == 0


def test_avisa_cuando_el_closer_describio_mal_la_oferta():
    """Es más caro que un mal encaje: el cliente entra esperando algo que no compró y
    el problema aparece en fulfillment, con la venta ya cobrada."""
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""},
                      CAMPOS | {"desvioOferta": "le dijo 6 meses y Mid Level dura 4"}, ReunionFalsa())
    assert "*Ojo:* le dijo 6 meses y Mid Level dura 4" in texto


def test_sin_desvio_no_aparece_la_linea():
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""},
                      CAMPOS | {"desvioOferta": None}, ReunionFalsa())
    assert "*Ojo:*" not in texto



def test_el_mensaje_no_lleva_emojis():
    """Los saca Franco: el puntaje ya dice lo que decía el signo, y un tablero lleno de
    íconos se lee peor, no mejor."""
    texto = f.mensaje({"inicio": None, "titulo": "", "url": "https://fathom.video/x"},
                      CAMPOS | {"encaje": "no", "encajePuntaje": 2,
                                "encajeMotivo": "factura $600/mes",
                                "desvioOferta": "le dijo 6 meses"}, ReunionFalsa())
    assert not any(ord(c) > 0x2100 for c in texto), [c for c in texto if ord(c) > 0x2100]


# ------------------------------------------------- decisiones que no son del modelo

@pytest.mark.parametrize("factura, nivel", [
    (600, "Entry Level"), (9_999, "Entry Level"),
    (10_000, "Mid Level"), (15_000, "Mid Level"), (29_999, "Mid Level"),
    (30_000, "High Level"), (80_000, "High Level"),
    (None, None), (0, None),
])
def test_el_nivel_sale_de_la_banda_no_del_modelo(factura, nivel):
    """Haiku eligió High para alguien de 15-20k tres veces seguidas y después inventó
    que estaba "en el borde" de una banda en la que no entra. Una comparación numérica
    no se racionaliza."""
    assert f._nivel_por_banda(factura) == nivel


def test_la_banda_pisa_lo_que_eligio_el_modelo():
    campos = f._decidir_en_codigo({"plan": "High Level", "facturacion_usd": 15_000}, [])
    assert campos["plan"] == "Mid Level"


def test_un_programa_viejo_no_se_pisa():
    """Puede ser un cliente que ya estaba adentro: reclasificarlo lo sacaría de su
    programa."""
    campos = f._decidir_en_codigo({"plan": "Mentoria", "facturacion_usd": 15_000}, [])
    assert campos["plan"] == "Mentoria"


def test_sin_facturacion_se_respeta_lo_que_dijo_el_modelo():
    campos = f._decidir_en_codigo({"plan": "High Level", "facturacion_usd": None}, [])
    assert campos["plan"] == "High Level"


@pytest.mark.parametrize("estructura, estado", [
    ("total", "Cerrado"),
    ("cuotas", "Cerrado"),
    ("reserva", "Seña"),
])
def test_el_estado_sale_de_la_estructura_de_pago(estructura, estado):
    """Leonel pagó la primera de dos cuotas acordadas y salía "Seña" tres corridas
    seguidas. Es un mapeo de tres casos: no hace falta un modelo para eso."""
    campos = f._decidir_en_codigo({"estado": "Seña", "estructura_pago": estructura}, [])
    assert campos["estado"] == estado


def test_sin_estructura_de_pago_no_se_toca_el_estado():
    """Un no show o un seguimiento no tienen estructura de pago y no son una venta."""
    campos = f._decidir_en_codigo({"estado": "No show", "estructura_pago": None}, [])
    assert campos["estado"] == "No show"
