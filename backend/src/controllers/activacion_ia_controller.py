from fastapi import APIRouter, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import activacion_ia_services as service

router = APIRouter()


@router.get("/estado")
def obtener_estado(_user: dict = Depends(get_current_user)):
    try:
        return service.estado()
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer el estado del análisis.")


@router.post("/ejecutar")
def ejecutar(user: dict = Depends(get_current_user)):
    if user.get("rol") not in ("admin", "founder"):
        raise HTTPException(status_code=403, detail="Solo admin o founder pueden disparar el análisis.")
    try:
        return service.ejecutar(origen="manual")
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al ejecutar el análisis.")
