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
    assert "*Programa:* Mentoría" in texto
    assert "*Cash cobrado:* US$ 50" in texto
    assert "2,000" not in texto


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


def test_el_resumen_se_corta_en_dos_renglones():
    """Si se lo deja crecer vuelve a ser el párrafo largo que Franco pidió sacar."""
    largo = "palabra " * 200
    corto = f._validar({"resumen": largo}, ESTADOS, PLANES)["resumen"]
    assert len(corto) <= 201
    assert corto.endswith("…")


@pytest.mark.parametrize("campo, tope", [("nota", 260), ("resumen", 200)])
def test_nunca_se_corta_a_mitad_de_una_palabra(campo, tope):
    """En el grupo se leyó "...para e": parecía un mensaje roto, no uno resumido."""
    largo = "Claudio y Dylan tienen una agencia de marketing y automatizaciones " * 20
    corto = f._validar({campo: largo}, ESTADOS, PLANES)[campo]
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

def test_el_aviso_de_encaje_sale_solo_cuando_algo_no_cierra():
    """Un '✅ avatar correcto' en cada llamada es ruido: a la semana nadie lo lee, y el
    día que aparezca el aviso de verdad va a estar enterrado."""
    base = {"inicio": None, "titulo": "", "url": ""}
    ok = f.mensaje(base, CAMPOS | {"encaje": "ok", "encajeMotivo": None}, ReunionFalsa())
    assert "Encaje" not in ok

    mal = f.mensaje(base, CAMPOS | {"encaje": "no", "encajeMotivo": "factura $600/mes y la cuota es $1.800"}, ReunionFalsa())
    assert "⚠️ *Encaje:* factura $600/mes y la cuota es $1.800" in mal

    dudoso = f.mensaje(base, CAMPOS | {"encaje": "dudoso", "encajeMotivo": "factura $9k y compró Mid"}, ReunionFalsa())
    assert "🔸 *Encaje:*" in dudoso


def test_sin_motivo_no_se_avisa_nada():
    """Un aviso sin el dato concreto no sirve para actuar: es solo una alarma vaga."""
    texto = f.mensaje({"inicio": None, "titulo": "", "url": ""},
                      CAMPOS | {"encaje": "no", "encajeMotivo": None}, ReunionFalsa())
    assert "Encaje" not in texto


def test_un_encaje_inventado_se_descarta():
    campos = f._validar({"encaje": "más o menos"}, ESTADOS, PLANES)
    assert campos["encaje"] is None


def test_la_facturacion_se_lee_como_numero():
    assert f._validar({"facturacion_usd": "US$ 15.000"}, ESTADOS, PLANES)["facturacionUsd"] == 15000.0
    assert f._validar({"facturacion_usd": None}, ESTADOS, PLANES)["facturacionUsd"] is None
