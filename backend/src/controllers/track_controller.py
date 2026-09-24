"""Endpoints públicos de tracking: sin sesión, autenticados por token de integración.

Script único para todos los clientes. Lo que cambia es el token (webinar vinculado).
Eventos: pageview (landing), optin, thank_you, whatsapp.
"""

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response

from src.services.integraciones_services import IntegracionesServices

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
      // manda antes un preflight, y el preflight de un sendBeacon viaja en modo
      // credenciales: contra un Allow-Origin "*" el pedido no sale nunca. El servidor
      // parsea el cuerpo igual, no mira el content-type.
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


def _cors(response: Response, origen: str | None = None) -> Response:
    """CORS abierto: la landing de cada cliente vive en su propio dominio.

    Se devuelve el origen que pidió en vez de "*" porque sendBeacon manda en modo
    credenciales, y ahí el navegador rechaza el comodín. Abierto es abierto igual:
    lo que autoriza a escribir es el token, no el dominio.
    """
    response.headers["Access-Control-Allow-Origin"] = origen or "*"
    if origen:
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Max-Age"] = "86400"
    return response


def _leer_body(raw: dict) -> dict:
    if not isinstance(raw, dict):
        return {}
    return raw


@router.options("/{path:path}")
def options_any(request: Request, path: str = ""):
    return _cors(Response(status_code=204), request.headers.get("origin"))


@router.get("/sdk.js")
def sdk_js():
    return _cors(Response(
        content=_SDK_JS,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "public, max-age=60"},
    ))


async def _registrar_desde_request(request: Request, tipo_default: str = "pageview"):
    origen = request.headers.get("origin")
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
        return _cors(JSONResponse(result), origen)
    except HTTPException as e:
        return _cors(JSONResponse({"detail": e.detail}, status_code=e.status_code), origen)


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
