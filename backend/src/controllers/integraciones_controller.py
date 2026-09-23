"""CRUD de integraciones (requiere sesión)."""

from fastapi import APIRouter, Depends, HTTPException

from src import schemas
from src.controllers.auth_controller import get_current_user
from src.services.integraciones_services import IntegracionesServices

router = APIRouter()
service = IntegracionesServices()

ROLES = frozenset({"admin", "founder", "operaciones", "marketing"})


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ROLES:
        raise HTTPException(status_code=403, detail="No tenés acceso a integraciones.")
    return user


@router.get("")
def listar(user: dict = Depends(_puede)):
    try:
        return {"integraciones": service.listar()}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudieron listar: {e}") from e


@router.get("/panel")
def panel(user: dict = Depends(_puede)):
    """Tracking por webinar + estado Meta/Calendly para la vista de Integraciones."""
    try:
        return service.panel()
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo armar el panel: {e}") from e


@router.post("/asegurar/{webinar_id}")
def asegurar(webinar_id: int, user: dict = Depends(_puede)):
    """Genera (o reusa) el token de tracking de un webinar."""
    try:
        return service.asegurar_para_webinar(webinar_id, user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo asegurar el tracking: {e}") from e


@router.get("/{integracion_id}")
def obtener(integracion_id: int, user: dict = Depends(_puede)):
    try:
        return service.obtener(integracion_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo leer: {e}") from e


@router.post("")
def crear(body: schemas.IntegracionCreate, user: dict = Depends(_puede)):
    try:
        return service.crear(body.model_dump(), user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo crear: {e}") from e


@router.patch("/{integracion_id}")
def actualizar(integracion_id: int, body: schemas.IntegracionUpdate, user: dict = Depends(_puede)):
    try:
        return service.actualizar(integracion_id, body.model_dump(exclude_unset=True))
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo actualizar: {e}") from e


@router.delete("/{integracion_id}")
def borrar(integracion_id: int, user: dict = Depends(_puede)):
    try:
        return service.borrar(integracion_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo borrar: {e}") from e
