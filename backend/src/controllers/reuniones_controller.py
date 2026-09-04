from fastapi import APIRouter, Depends, HTTPException, Query

from src import schemas
from src.controllers.auth_controller import get_current_user
from src.services.reuniones_services import ReunionesServices

router = APIRouter()
service = ReunionesServices()


@router.get("", response_model=schemas.ReunionesMesResponse)
def listar_mes(
    anio: int = Query(..., ge=2000, le=2100),
    mes: int = Query(..., ge=1, le=12),
    _user=Depends(get_current_user),
):
    try:
        return service.listar_mes(anio, mes)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al listar las reuniones.")


@router.post("", response_model=schemas.ReunionResponse)
def crear(body: schemas.ReunionCreate, _user=Depends(get_current_user)):
    try:
        return service.crear(body.titulo, body.fecha, body.hora, body.notas, body.integrante_ids)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al crear la reunión.")


@router.delete("/{reunion_id}", response_model=schemas.ReunionResponse)
def borrar(reunion_id: int, _user=Depends(get_current_user)):
    try:
        return service.borrar(reunion_id)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al borrar la reunión.")
