from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from src import schemas
from src.controllers.auth_controller import get_current_user
from src.services.integrantes_services import IntegrantesServices

router = APIRouter()
service = IntegrantesServices()


@router.get("", response_model=list[schemas.IntegranteResponse])
def listar(_user=Depends(get_current_user)):
    try:
        return service.listar()
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al listar integrantes.")


@router.post("", response_model=schemas.IntegranteResponse)
def crear(body: schemas.IntegranteCreate, _user=Depends(get_current_user)):
    try:
        return service.crear(body.nombre)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al crear el integrante.")


@router.post("/{integrante_id}/foto", response_model=schemas.IntegranteResponse)
async def subir_foto(
    integrante_id: int,
    archivo: UploadFile = File(...),
    _user=Depends(get_current_user),
):
    try:
        contenido = await archivo.read()
        return service.guardar_foto(integrante_id, archivo.filename, archivo.content_type, contenido)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al guardar la foto.")


@router.delete("/{integrante_id}", response_model=schemas.IntegranteResponse)
def borrar(integrante_id: int, _user=Depends(get_current_user)):
    try:
        return service.borrar(integrante_id)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al borrar el integrante.")
