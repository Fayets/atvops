"""La vista Theo: lo que manda Theo por WhatsApp. La ven admin y operaciones."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from src.controllers.auth_controller import get_current_user
from src.controllers.webhooks_controller import _agente
from src.services import theo_services as svc

router = APIRouter()


class Edicion(BaseModel):
    texto: str


class EnvioEdicion(BaseModel):
    activo: bool | None = None
    plantilla: str | None = None
    grupo: str | None = None
    grupo_jid: str | None = None


class Resultado(BaseModel):
    ok: bool
    texto: str | None = None
    error: str | None = None


class Registro(BaseModel):
    envio: str
    texto: str
    ok: bool = True
    error: str | None = None


def _sistemas(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in svc.ROLES:
        raise HTTPException(status_code=403, detail="La vista Theo es de sistemas y operaciones.")
    return user


@router.get("/mensajes")
def mensajes(vista: str = "pendientes", envio: str | None = None, q: str | None = None, user: dict = Depends(_sistemas)):
    if vista not in ("pendientes", "enviados"):
        raise HTTPException(status_code=400, detail="vista es pendientes o enviados.")
    return svc.listar(vista, envio, q)


@router.patch("/mensajes/{ident}")
def editar(ident: str, body: Edicion, user: dict = Depends(_sistemas)):
    return svc.editar(ident, body.texto, user["username"])


@router.post("/mensajes/{ident}/frenar")
def frenar(ident: str, user: dict = Depends(_sistemas)):
    return svc.frenar(ident, user["username"])


@router.post("/mensajes/{ident}/volver")
def volver(ident: str, user: dict = Depends(_sistemas)):
    return svc.volver_a_la_cola(ident)


@router.post("/mensajes/{ident}/ahora")
def ahora(ident: str, user: dict = Depends(_sistemas)):
    return svc.mandar_ahora(ident)


@router.get("/semana")
def semana(desde: str | None = None, user: dict = Depends(_sistemas)):
    """La grilla de domingo a sábado: qué automatización salió cada día."""
    from src.services.daily_services import _parse_fecha

    return svc.semana(_parse_fecha(desde))


@router.get("/envios")
def envios(user: dict = Depends(_sistemas)):
    return svc.listar_envios()


@router.patch("/envios/{clave}")
def editar_envio(clave: str, body: EnvioEdicion, user: dict = Depends(_sistemas)):
    return svc.actualizar_envio(clave, body.model_dump(), user["username"])


# ---------------------------------------------------------------- el VPS (X-Agent-Key)


@router.get("/cola")
def cola(request: Request):
    """Lo que hay que mandar ahora. Lo pide deploy/theo/theo-cola.py cada minuto."""
    _agente(request)
    return {"mensajes": svc.cola()}


@router.post("/cola/{mensaje_id}/resultado")
def resultado(mensaje_id: int, body: Resultado, request: Request):
    _agente(request)
    return svc.resultado(mensaje_id, body.ok, body.texto, body.error)


@router.post("/registro")
def registro(body: Registro, request: Request):
    """Otros scripts del VPS anotan lo que mandaron directo (landing caída, Capacidad Operativa)."""
    _agente(request)
    return svc.registrar(body.envio, body.texto, body.ok, body.error)
