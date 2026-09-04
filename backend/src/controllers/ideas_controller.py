from fastapi import APIRouter, Depends, HTTPException

from src import schemas
from src.controllers.auth_controller import get_current_user
from src.services.ideas_services import IdeasServices

router = APIRouter()
service = IdeasServices()


@router.get("", response_model=list[schemas.IdeaResponse])
def listar(_user=Depends(get_current_user)):
    try:
        return service.listar()
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al listar ideas.")


@router.post("", response_model=schemas.IdeaResponse)
def crear(body: schemas.IdeaCreate, user=Depends(get_current_user)):
    try:
        quien = body.quien or user.get("nombre") or user.get("username") or "Franco"
        return service.crear(body.texto, quien)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al crear la idea.")


@router.patch("/{idea_id}", response_model=schemas.IdeaResponse)
def actualizar(idea_id: int, body: schemas.IdeaUpdate, _user=Depends(get_current_user)):
    try:
        return service.actualizar(
            idea_id,
            texto=body.texto,
            asignada=body.asignada,
            estado=body.estado,
            tocar_asignada="asignada" in body.model_fields_set,
        )
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al actualizar la idea.")


@router.delete("/{idea_id}", response_model=schemas.IdeaResponse)
def borrar(idea_id: int, _user=Depends(get_current_user)):
    try:
        return service.borrar(idea_id)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al borrar la idea.")
