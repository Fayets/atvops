"""
Tests del SDK de tracking que se sirve a las landings.

El SDK es JavaScript dentro de un string de Python, así que no lo corre nadie acá: lo
que se fija es el contrato que las landings dan por sentado. El que más importa es
data-auto="off" — una landing que rutea por pathname lo usa para tener window.AtvOps
disponible en una visita repetida sin volver a contarla, y si alguien saca el envío
automático de adentro del `if`, esa visita se cuenta dos veces y nadie se entera.
"""

from src.controllers.track_controller import _SDK_JS


def test_el_envio_automatico_vive_adentro_del_guard():
    guard = 's.getAttribute("data-auto") !== "off"'
    assert guard in _SDK_JS
    cuerpo = _SDK_JS.split(guard, 1)[1].split("}", 1)[0]
    assert "send(" in cuerpo, "el envío automático se salió del guard de data-auto"
    # Fuera del guard no puede quedar ninguna llamada suelta: las otras son
    # definiciones (window.AtvOps.track = send) o llamadas adentro de una función.
    antes = _SDK_JS.split(guard, 1)[0]
    assert "send(" not in antes.replace("function send(", "")


def test_track_queda_expuesto_aunque_no_se_cuente_la_visita():
    """El guard corta el aviso de carga, no la API para los eventos a mano."""
    despues = _SDK_JS.split('s.getAttribute("data-auto")', 1)[1]
    for metodo in ("window.AtvOps.track", "trackOptin", "trackWhatsapp", "trackThankYou"):
        assert metodo in despues


def test_la_thank_you_manda_thank_you_y_el_resto_pageview():
    assert 'page === "ty" || page === "thank_you" ? "thank_you" : "pageview"' in _SDK_JS
