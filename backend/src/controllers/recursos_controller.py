from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import recursos_services as recursos

router = APIRouter()

_ROLES = {"admin", "founder", "operaciones", "marketing"}


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if (user.get("rol") or "") not in _ROLES:
        raise HTTPException(status_code=403, detail="Recursos es de marketing.")
    return user


@router.get("")
def listar(dias: int = 30, _user: dict = Depends(_puede)):
    """Cada recurso con su recorrido: comentarios y chats del reel, visitas, play, cuánto vio,
    descargas y pedidos por WhatsApp."""
    return recursos.listar(dias)


@router.post("")
def crear(payload: dict = Body(...), user: dict = Depends(_puede)):
    return recursos.crear(payload or {}, user.get("username"))


@router.post("/importar-reels")
def importar_reels(user: dict = Depends(_puede)):
    """Un recurso por cada reel con palabra que todavía no tenga uno."""
    return recursos.importar_reels(user.get("username"))


@router.put("/ajustes")
def guardar_ajustes(payload: dict = Body(...), user: dict = Depends(_puede)):
    return recursos.guardar_ajustes(payload or {}, user.get("username"))


@router.get("/contenido")
def contenido(_user: dict = Depends(_puede)):
    """Videos de YouTube, reels y secuencias de historias que se pueden poner en la landing."""
    return recursos.contenido_elegible()


@router.get("/landing")
def ver_landing(_user: dict = Depends(_puede)):
    return recursos.landing()


@router.put("/landing")
def guardar_landing(payload: dict = Body(...), user: dict = Depends(_puede)):
    return recursos.guardar_landing(payload or {}, user.get("username"))


@router.put("/{recurso_id}")
def editar(recurso_id: int, payload: dict = Body(...), user: dict = Depends(_puede)):
    return recursos.editar(recurso_id, payload or {}, user.get("username"))


@router.post("/{recurso_id}/destacar")
def destacar(recurso_id: int, payload: dict = Body(default={}), user: dict = Depends(_puede)):
    """Lo pone en la landing; el que estaba vuelve a la biblioteca."""
    return recursos.destacar(recurso_id, payload or {}, user.get("username"))
