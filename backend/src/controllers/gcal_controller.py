from fastapi import APIRouter, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import gcal_services as gcal

router = APIRouter()


@router.get("")
def agenda(_user: dict = Depends(get_current_user), dias: int = 14, diasAtras: int = 1,
           refrescar: bool = False, desde: str | None = None, hasta: str | None = None):
    """Agenda real del Google Calendar de ATV. Con `desde`/`hasta` trae ese rango exacto."""
    try:
        return gcal.agenda(dias=dias, dias_atras=diasAtras, refrescar=refrescar,
                           desde_iso=desde, hasta_iso=hasta)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer el calendario.")


@router.get("/estado")
def estado(_user: dict = Depends(get_current_user)):
    return gcal.estado()
