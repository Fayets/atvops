from fastapi import APIRouter, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import ventas_services as ventas

router = APIRouter()


@router.get("")
def resumen(_user: dict = Depends(get_current_user), mes: str | None = None, refrescar: bool = False):
    """Métricas reales de ventas desde el CRM de Marketing."""
    try:
        return ventas.resumen(mes=mes, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al calcular las métricas de ventas.")


@router.get("/estado")
def estado(_user: dict = Depends(get_current_user)):
    return ventas.estado()
