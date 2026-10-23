"""
Lo que consume recursos.atvos.io (la landing y la biblioteca). Sin sesión: lo público es solo
lo que puede verse en la página, y el link del documento nunca viaja en el JSON; se llega a él
por /descargar, que lo entrega únicamente si el recurso está en la landing y es de regalo.

La landing no pega acá directo: su nginx reenvía /api/contenido/ a esta ruta, así que para el
navegador es el mismo dominio y no hace falta CORS.
"""

import json

from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse

from src.services import recursos_services as recursos

router = APIRouter()


@router.get("")
def publico(response: Response):
    # Unos segundos de caché alcanzan para un pico de un reel sin que un cambio de marketing tarde.
    response.headers["Cache-Control"] = "public, max-age=15"
    return recursos.publico()


@router.post("/evento", status_code=204)
async def evento(request: Request):
    """Visita, play o cuánto vio. Llega en text/plain (sendBeacon) o JSON: se lee igual."""
    try:
        datos = json.loads((await request.body())[:2000] or b"{}")
    except ValueError:
        return Response(status_code=204)
    if isinstance(datos, dict):
        recursos.registrar(str(datos.get("slug") or ""), str(datos.get("tipo") or ""),
                           str(datos.get("origen") or ""), str(datos.get("sesion") or ""))
    return Response(status_code=204)


@router.get("/{slug}/descargar")
def descargar(slug: str, s: str = "", o: str = "landing"):
    url, tipo = recursos.destino_descarga(slug)
    recursos.registrar(slug, tipo, o, s)
    return RedirectResponse(url, status_code=302, headers={"Cache-Control": "no-store"})


@router.get("/{slug}/whatsapp")
def whatsapp(slug: str, s: str = "", o: str = "biblioteca"):
    url = recursos.destino_whatsapp(slug)
    recursos.registrar(slug, "whatsapp", o, s)
    return RedirectResponse(url, status_code=302, headers={"Cache-Control": "no-store"})
