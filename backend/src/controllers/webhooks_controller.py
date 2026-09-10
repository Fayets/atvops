"""
Los avisos que entran de afuera. No llevan sesión: se validan con su propio token.

Hoy hay uno solo, el de ManyChat, y respeta el mismo contrato que atv-mkt para que en el
flujo alcance con duplicar el bloque y cambiarle la URL.
"""

import logging

from fastapi import APIRouter, HTTPException, Request

from src.services import conversaciones_services as conversaciones

log = logging.getLogger("atv_ops.webhooks")
router = APIRouter()


@router.post("/manychat")
async def manychat(request: Request):
    """El bot avisa que abrió una conversación o que mandó el link de Calendly."""
    try:
        cuerpo = await request.json()
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="El cuerpo del aviso no es JSON.")
    payload = cuerpo if isinstance(cuerpo, dict) else {}
    token = (request.query_params.get("token") or request.headers.get("X-Webhook-Token") or "").strip()
    try:
        return conversaciones.registrar(payload, token)
    except conversaciones.WebhookNoAutorizado as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:  # noqa: BLE001
        log.exception("Falló registrar un aviso de ManyChat")
        raise HTTPException(status_code=500, detail=f"No se pudo registrar: {str(e)[:180]}")


@router.get("/manychat")
def manychat_verificar():
    """ManyChat prueba la URL con un GET antes de guardarla."""
    return {"status": "ok", "servicio": "ATV Ops"}
