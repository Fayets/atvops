"""Webinars: listado, alta, edición, duplicado y baja."""

from fastapi import APIRouter, Body, Depends, HTTPException

from src import schemas
from src.controllers.auth_controller import get_current_user
from src.services.webinars_services import WebinarsServices

router = APIRouter()
service = WebinarsServices()

ROLES_WEBINAR = frozenset({"admin", "founder", "operaciones", "marketing", "ventas"})


def _puede_webinars(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ROLES_WEBINAR:
        raise HTTPException(status_code=403, detail="No tenés acceso a webinars.")
    return user


@router.get("")
def listar(user: dict = Depends(_puede_webinars)):
    try:
        return {"webinars": service.listar()}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudieron listar los webinars: {e}") from e


@router.get("/{webinar_id}")
def obtener(webinar_id: int, user: dict = Depends(_puede_webinars)):
    try:
        return service.obtener(webinar_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo leer el webinar: {e}") from e


@router.post("")
def crear(body: schemas.WebinarCreate, user: dict = Depends(_puede_webinars)):
    try:
        return service.crear(body.model_dump(), user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo crear el webinar: {e}") from e


@router.patch("/{webinar_id}")
def actualizar(webinar_id: int, body: schemas.WebinarUpdate, user: dict = Depends(_puede_webinars)):
    try:
        datos = body.model_dump(exclude_unset=True)
        return service.actualizar(webinar_id, datos, user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo actualizar el webinar: {e}") from e


@router.post("/{webinar_id}/duplicar")
def duplicar(webinar_id: int, body: schemas.WebinarDuplicar | None = Body(None),
             user: dict = Depends(_puede_webinars)):
    try:
        return service.duplicar(webinar_id, user, (body.model_dump(exclude_unset=True) if body else {}))
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo duplicar el webinar: {e}") from e


@router.delete("/{webinar_id}")
def borrar(webinar_id: int, user: dict = Depends(_puede_webinars)):
    try:
        return service.borrar(webinar_id, user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo borrar el webinar: {e}") from e
