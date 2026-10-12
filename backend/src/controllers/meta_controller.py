from fastapi import APIRouter, Depends, HTTPException, Query

from src.controllers.auth_controller import get_current_user
from src.services.meta_services import MetaServices

router = APIRouter()
service = MetaServices()


@router.get("/ads")
def meta_ads(
    month: str | None = Query(default=None, description="Mes YYYY-MM"),
    todas: bool = Query(default=False, description="Incluir las que todavía no gastaron"),
    refrescar: bool = Query(default=False, description="Saltear el caché y pedirle a Meta"),
    _user=Depends(get_current_user),
):
    try:
        return service.ads_resumen(month, incluir_sin_gasto=todas, refrescar=refrescar)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer Meta Ads.")


@router.get("/instagram")
def meta_instagram(
    month: str | None = Query(default=None, description="Mes YYYY-MM"),
    refrescar: bool = Query(default=False, description="Saltear el caché y pedirle a Meta"),
    _user=Depends(get_current_user),
):
    try:
        return service.ig_contenido(month, refrescar=refrescar)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer Instagram.")


@router.get("/resumen")
def meta_resumen(
    month: str | None = Query(default=None, description="Mes YYYY-MM"),
    _user=Depends(get_current_user),
):
    try:
        return service.resumen(month)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer Meta.")
