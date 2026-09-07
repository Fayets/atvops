from fastapi import APIRouter, Depends, HTTPException, Query

from src.controllers.auth_controller import get_current_user
from src.services.mkt_services import MktServices

router = APIRouter()
service = MktServices()


@router.get("/resumen")
def resumen_mkt(
    month: str | None = Query(default=None, description="Mes YYYY-MM"),
    _user=Depends(get_current_user),
):
    try:
        return service.resumen(month)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer ATV MKT.")
