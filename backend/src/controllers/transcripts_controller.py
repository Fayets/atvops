from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from src import schemas
from src.controllers.auth_controller import get_current_user
from src.services.transcripts_services import TranscriptsServices

router = APIRouter()
service = TranscriptsServices()


@router.get("", response_model=schemas.TranscriptsListResponse)
def listar_transcripts(_user: dict = Depends(get_current_user)):
    try:
        return service.listar()
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al listar los transcripts.")


@router.get("/{categoria}/{canal}", response_model=schemas.CanalDetalleResponse)
def obtener_canal(categoria: str, canal: str, _user: dict = Depends(get_current_user)):
    try:
        return service.obtener_canal(categoria, canal)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer el transcript.")


@router.get("/{categoria}/{canal}/adjuntos/{archivo}")
def obtener_adjunto(categoria: str, canal: str, archivo: str, _user: dict = Depends(get_current_user)):
    try:
        return FileResponse(service.ruta_adjunto(categoria, canal, archivo))
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer el adjunto.")
