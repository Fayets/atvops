"""Endpoints públicos de tracking: sin sesión, autenticados por token de integración.

Script único para todos los clientes. Lo que cambia es el token (webinar vinculado).
Eventos: pageview (landing), optin, thank_you, whatsapp.
"""

import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response

from src.services.integraciones_services import IntegracionesServices

logger = logging.getLogger("atv_ops.track")
router = APIRouter()
service = IntegracionesServices()

_PIXEL = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01"
    b"\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)

# data-page: landing | ty  ·  data-auto="off" carga sin contar la visita
# window.AtvOps.track('optin' | 'whatsapp' | 'thank_you' | 'pageview')
_SDK_JS = r"""(function () {
  try {
    var s = document.currentScript;
    if (!s) return;
    var token = s.getAttribute("data-token");
    if (!token) return;
    var src = s.src || "";
    var base = src.replace(/\/sdk\.js(\?.*)?$/, "");
    var page = (s.getAttribute("data-page") || "landing").toLowerCase();
    var sidKey = "atv_ops_sid";
    var sid = null;
    try {
      sid = localStorage.getItem(sidKey);
      if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(sidKey, sid);
      }
    } catch (e) {}

    function send(tipo) {
      var body = JSON.stringify({
        token: token,
        tipo: tipo,
        url: location.href,
        referrer: document.referrer || "",
        sessionId: sid || ""
      });
      var endpoint = base + "/event";
      // text/plain a propósito, en los dos caminos. Con application/json el navegador
      // pide antes un preflight, y el preflight de un sendBeacon viaja en modo
      // credenciales: ahí el comodín "*" lo rechaza y el evento no sale nunca. El
      // servidor parsea el cuerpo con json.loads, que no mira el content-type.
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }));
          return;
        }
      } catch (e) {}
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: body,
        mode: "cors",
        keepalive: true
      }).catch(function () {});
    }

    // data-auto="off" carga el SDK sin anunciar nada: window.AtvOps queda listo
    // para los eventos a mano, pero la carga no cuenta como visita. Es para una
    // visita repetida que ya se contó, o para una ruta interna que no se mide.
    if (s.getAttribute("data-auto") !== "off") {
      send(page === "ty" || page === "thank_you" ? "thank_you" : "pageview");
    }

    window.AtvOps = window.AtvOps || {};
    window.AtvOps.track = send;
    window.AtvOps.trackOptin = function () { send("optin"); };
    window.AtvOps.trackWhatsapp = function () { send("whatsapp"); };
    window.AtvOps.trackThankYou = function () { send("thank_you"); };
  } catch (e) {}
})();
"""


def _cors(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Max-Age"] = "86400"
    return response


def _leer_body(raw: dict) -> dict:
    if not isinstance(raw, dict):
        return {}
    return raw


@router.options("/{path:path}")
def options_any(path: str = ""):
    return _cors(Response(status_code=204))


@router.get("/sdk.js")
def sdk_js():
    return _cors(Response(
        content=_SDK_JS,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "public, max-age=60"},
    ))


async def _registrar_desde_request(request: Request, tipo_default: str = "pageview"):
    try:
        raw = _leer_body(await request.json())
    except Exception:  # noqa: BLE001
        raw = {}
    tipo = str(raw.get("tipo") or raw.get("event") or tipo_default)
    try:
        result = service.registrar_evento(
            str(raw.get("token") or ""),
            tipo,
            url=raw.get("url"),
            referrer=raw.get("referrer"),
            session_id=raw.get("sessionId") or raw.get("session_id"),
        )
        return _cors(JSONResponse(result))
    except HTTPException as e:
        return _cors(JSONResponse({"detail": e.detail}, status_code=e.status_code))


@router.post("/event")
async def event(request: Request):
    """Endpoint genérico: pageview | optin | thank_you | whatsapp."""
    return await _registrar_desde_request(request, "pageview")


@router.post("/pageview")
async def pageview(request: Request):
    """Alias legacy del SDK v1."""
    return await _registrar_desde_request(request, "pageview")


@router.get("/pixel.gif")
def pixel(
    t: str = Query("", description="Token"),
    e: str = Query("pageview", description="Evento: pageview|optin|thank_you|whatsapp|ty"),
):
    """Pixel 1×1. Usar e=ty en la thank you page."""
    try:
        service.registrar_evento(t, e)
    except HTTPException:
        pass
    return _cors(Response(
        content=_PIXEL,
        media_type="image/gif",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    ))


@router.post("/webinar-dia")
async def webinar_dia(request: Request):
    """SoftWebinar manda vivos, pico de concurrentes y retenidos al pitch (datos de Zoom)."""
    try:
        raw = _leer_body(await request.json())
    except Exception:  # noqa: BLE001
        raw = {}
    try:
        result = service.registrar_dia_webinar(str(raw.get("token") or ""), raw)
        return _cors(JSONResponse(result))
    except HTTPException as e:
        return _cors(JSONResponse({"detail": e.detail}, status_code=e.status_code))


@router.post("/zoom")
async def zoom_webhook(request: Request):
    """Los avisos de Zoom cuando alguien entra o sale del webinar.

    Es la vía al tiempo real sin plan Business: la API de métricas en vivo lo pide, los
    webhooks no. Va acá, en el router público, porque Zoom no manda sesión de usuario;
    lo que autentica el aviso es la firma con el secret token de la app.

    Zoom espera respuesta en tres segundos o reintenta, así que se guarda y se contesta:
    cualquier cuenta se hace después, al leer.
    """
    from src.services import zoom_services

    crudo = await request.body()
    try:
        cuerpo = json.loads(crudo.decode("utf-8") or "{}")
    except ValueError:
        return JSONResponse({"detail": "cuerpo ilegible"}, status_code=400)

    # El apretón de manos de la URL: Zoom manda un token y espera verlo firmado. Llega
    # sin firma propia, así que se contesta antes de validarla.
    if cuerpo.get("event") == "endpoint.url_validation":
        plain = str(((cuerpo.get("payload") or {}).get("plainToken")) or "")
        try:
            return JSONResponse(zoom_services.respuesta_de_validacion(plain))
        except HTTPException as e:
            return JSONResponse({"detail": e.detail}, status_code=e.status_code)

    if not zoom_services.firma_valida(
        crudo,
        request.headers.get("x-zm-signature") or "",
        request.headers.get("x-zm-request-timestamp") or "",
    ):
        return JSONResponse({"detail": "firma inválida"}, status_code=401)

    try:
        return JSONResponse(zoom_services.registrar_evento(cuerpo))
    except Exception as e:  # noqa: BLE001 — un error acá haría que Zoom reintente en loop
        logger.info("Webhook de Zoom: %s", str(e)[:200])
        return JSONResponse({"ok": False})
