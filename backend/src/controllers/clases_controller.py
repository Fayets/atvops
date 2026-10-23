"""Las series de clases que muestra recursos.atvos.io: cargarlas, editarlas y ver quién las abrió."""

from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import clases_services as clases

router = APIRouter()

_ROLES = {"admin", "founder", "operaciones", "marketing"}


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if (user.get("rol") or "") not in _ROLES:
        raise HTTPException(status_code=403, detail="Las clases son de marketing.")
    return user


@router.get("")
def listar(dias: int = 30, _user: dict = Depends(_puede)):
    """Cada serie con sus recursos y cuánta gente abrió cada uno en el período."""
    return clases.listar(dias)


@router.put("/pagina")
def guardar_pagina(payload: dict = Body(...), user: dict = Depends(_puede)):
    return clases.guardar_pagina(payload or {}, user.get("username"))


@router.post("/sembrar")
def sembrar(user: dict = Depends(_puede)):
    """Carga las series con las que arrancó la página; no hace nada si ya hay alguna."""
    return clases.sembrar(user.get("username"))


@router.post("/series")
def crear_serie(payload: dict = Body(...), user: dict = Depends(_puede)):
    return clases.crear_serie(payload or {}, user.get("username"))


@router.put("/series/{serie_id}")
def editar_serie(serie_id: int, payload: dict = Body(...), user: dict = Depends(_puede)):
    return clases.editar_serie(serie_id, payload or {}, user.get("username"))


@router.delete("/series/{serie_id}")
def borrar_serie(serie_id: int, _user: dict = Depends(_puede)):
    return clases.borrar_serie(serie_id)


@router.post("/recursos")
def crear_recurso(payload: dict = Body(...), user: dict = Depends(_puede)):
    return clases.crear_recurso(payload or {}, user.get("username"))


@router.put("/recursos/{recurso_id}")
def editar_recurso(recurso_id: int, payload: dict = Body(...), user: dict = Depends(_puede)):
    return clases.editar_recurso(recurso_id, payload or {}, user.get("username"))


@router.delete("/recursos/{recurso_id}")
def borrar_recurso(recurso_id: int, _user: dict = Depends(_puede)):
    return clases.borrar_recurso(recurso_id)
