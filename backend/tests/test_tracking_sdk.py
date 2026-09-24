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


def test_el_beacon_no_va_como_json():
    """
    sendBeacon manda en modo credenciales. Con content-type application/json el
    navegador exige un preflight, y un preflight con credenciales contra un
    Allow-Origin "*" lo rechaza antes de despachar: el evento se pierde entero y en
    silencio. text/plain es safelisted, así que no hay preflight. El servidor parsea
    el cuerpo con json.loads, que no mira el header.
    """
    codigo = "\n".join(
        linea for linea in _SDK_JS.splitlines() if not linea.lstrip().startswith("//")
    )
    assert "application/json" not in codigo
    assert 'new Blob([body], { type: "text/plain" })' in codigo


def test_el_cors_devuelve_el_origen_pedido():
    """
    El comodín rompe cualquier pedido con credenciales, y sendBeacon lo es.

    Se prueba el middleware y no el `_cors` del controlador a propósito: el middleware
    pisa lo que el controlador haya puesto, así que es el único que decide. Un arreglo
    hecho en el controlador se ve bien en el código y no llega al navegador.
    """
    import asyncio
    from types import SimpleNamespace

    from fastapi.responses import Response

    from main import TrackCorsMiddleware

    async def responder(_request):
        return Response()

    def pedir(path, origen):
        mid = TrackCorsMiddleware(app=None)
        pedido = SimpleNamespace(
            url=SimpleNamespace(path=path),
            method="POST",
            headers={"origin": origen} if origen else {},
        )
        return asyncio.run(mid.dispatch(pedido, responder))

    con = pedir("/api/track/event", "https://landing-del-cliente.com")
    assert con.headers["Access-Control-Allow-Origin"] == "https://landing-del-cliente.com"
    assert con.headers["Access-Control-Allow-Credentials"] == "true"
    assert con.headers["Vary"] == "Origin"

    # Sin Origin —el <img> del pixel, un curl— el comodín alcanza y no hay credenciales.
    sin = pedir("/api/track/pixel.gif", None)
    assert sin.headers["Access-Control-Allow-Origin"] == "*"
    assert "Access-Control-Allow-Credentials" not in sin.headers

    # Fuera de /api/track el middleware no toca nada: ese CORS es el de la app.
    otro = pedir("/api/ventas/resumen", "https://landing-del-cliente.com")
    assert "Access-Control-Allow-Origin" not in otro.headers
