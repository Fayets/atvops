"""
Los avisos que entran de afuera. No llevan sesión: se validan con su propio token.

Hoy hay uno solo, el de ManyChat, y respeta el mismo contrato que atv-mkt para que en el
flujo alcance con duplicar el bloque y cambiarle la URL.
"""

import json
import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from decouple import config

from src.services import conversaciones_services as conversaciones
from src.services import fathom_services
from src.services import instagram_mensajes_services as ig_mensajes

log = logging.getLogger("atv_ops.webhooks")
router = APIRouter()

# Theo (OpenClaw) se identifica con la misma clave que usa contra atv-backbone.
AGENT_KEY = config("AGENT_KEY", default="")


def _agente(request: Request) -> None:
    """Deja pasar solo a los agentes. No es una sesión de usuario: es clave fija."""
    if not AGENT_KEY:
        raise HTTPException(status_code=503, detail="Falta AGENT_KEY: el agente no puede identificarse.")
    if (request.headers.get("X-Agent-Key") or "").strip() != AGENT_KEY:
        raise HTTPException(status_code=401, detail="X-Agent-Key inválida o ausente.")


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


@router.post("/fathom")
async def fathom(request: Request):
    """Fathom avisa que terminó de procesar una llamada y manda la transcripción.

    Se contesta rápido y siempre 200 salvo que la firma falle: Fathom reintenta, y un
    500 por un transcript raro haría que el mismo aviso vuelva tres veces.
    """
    crudo = await request.body()
    try:
        return fathom_services.recibir(crudo, request.headers)
    except fathom_services.AvisoNoAutorizado as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:  # noqa: BLE001
        log.exception("Falló procesar una llamada de Fathom")
        return {"ok": False, "motivo": f"No se pudo procesar: {str(e)[:180]}"}


@router.get("/fathom/pendientes")
def fathom_pendientes(request: Request):
    """Los reportes que todavía no salieron al grupo. Es el aviso por llamada."""
    _agente(request)
    return {"reportes": fathom_services.pendientes()}


@router.get("/fathom/dia")
def fathom_del_dia(request: Request, fecha: str = Query("")):
    """Las llamadas del día con su reporte. Es la lista que Theo manda al grupo."""
    _agente(request)
    try:
        dia = date.fromisoformat(fecha) if fecha else None
    except ValueError:
        raise HTTPException(status_code=400, detail="fecha tiene que ser AAAA-MM-DD.")
    return fathom_services.del_dia(dia)


@router.post("/fathom/enviados")
async def fathom_enviados(request: Request):
    """Theo avisa qué reportes mandó, para que no vuelvan a salir."""
    _agente(request)
    cuerpo = await request.json()
    ids = (cuerpo or {}).get("eventoIds") or []
    if not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="eventoIds tiene que ser una lista.")
    return {"marcados": fathom_services.marcar_enviados([str(i) for i in ids])}
