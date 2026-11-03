from fastapi import APIRouter, Depends, HTTPException, Query

from src.controllers.auth_controller import get_current_user
from src.services.campanias_services import CampaniasServices
from src.services.meta_services import MetaServices

router = APIRouter()
service = MetaServices()
campanias = CampaniasServices()


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


@router.get("/anuncios")
def meta_anuncios(
    month: str | None = Query(default=None, description="Mes YYYY-MM"),
    refrescar: bool = Query(default=False, description="Saltear el caché y pedirle a Meta"),
    _user=Depends(get_current_user),
):
    """Cada anuncio de la cuenta, primero los que corren, con lo que hizo en el mes."""
    try:
        return service.anuncios(month, refrescar=refrescar)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer los anuncios de Meta.")


@router.get("/anuncios/{ad_id}")
def meta_anuncio(
    ad_id: str,
    month: str | None = Query(default=None, description="Mes YYYY-MM"),
    _user=Depends(get_current_user),
):
    """El detalle de un anuncio: texto, números del mes, día por día y de toda su vida."""
    try:
        return service.anuncio(ad_id, month)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer el anuncio.")


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


@router.get("/campanias")
def meta_campanias(
    refrescar: bool = Query(default=False, description="Saltear el caché y pedirle a Meta"),
    _user=Depends(get_current_user),
):
    """Las campañas de la cuenta, primero las que corren."""
    try:
        return campanias.campanias(refrescar=refrescar)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer las campañas de Meta.")


@router.get("/campanias/{campania_id}")
def meta_campania(
    campania_id: str,
    refrescar: bool = Query(default=False, description="Saltear el caché y pedirle a Meta"),
    _user=Depends(get_current_user),
):
    """Una campaña de punta a punta: lo que gastó, sus creativos con veredicto, los seguidores
    día por día y quiénes de los que comentaron califican."""
    try:
        return campanias.campania(campania_id, refrescar=refrescar)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer la campaña.")
