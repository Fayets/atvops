"""
Los avisos que entran de afuera. No llevan sesión: se validan con su propio token.

Hoy hay uno solo, el de ManyChat, y respeta el mismo contrato que atv-mkt para que en el
flujo alcance con duplicar el bloque y cambiarle la URL.
"""

import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from src.services import conversaciones_services as conversaciones
from src.services import instagram_mensajes_services as ig_mensajes

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


@router.get("/instagram", response_class=PlainTextResponse)
def instagram_alta(
    modo: str = Query("", alias="hub.mode"),
    token: str = Query("", alias="hub.verify_token"),
    desafio: str = Query("", alias="hub.challenge"),
):
    """Meta da de alta la URL pidiéndole que le devuelva su propio desafío."""
    try:
        return ig_mensajes.verificar_alta(modo, token, desafio)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/instagram")
async def instagram_mensaje(request: Request):
    """Un mensaje directo entró o salió de la cuenta."""
    crudo = await request.body()
    if not ig_mensajes.firma_valida(crudo, request.headers.get("X-Hub-Signature-256", "")):
        raise HTTPException(status_code=401, detail="La firma del aviso no es de Meta.")
    try:
        cuerpo = json.loads(crudo or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="El cuerpo del aviso no es JSON.")
    try:
        # Meta reintenta si no contesta rápido: se procesa y se responde, nada más.
        return ig_mensajes.procesar(cuerpo if isinstance(cuerpo, dict) else {})
    except Exception as e:  # noqa: BLE001
        log.exception("Falló procesar un mensaje de Instagram")
        raise HTTPException(status_code=500, detail=f"No se pudo procesar: {str(e)[:180]}")
