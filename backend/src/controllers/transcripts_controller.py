from fastapi import APIRouter, HTTPException

from src import schemas
from src.services.transcripts_services import TranscriptsServices

router = APIRouter()
service = TranscriptsServices()


@router.get("", response_model=schemas.TranscriptsListResponse)
def listar_transcripts():
    try:
        return service.listar()
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al listar los transcripts.")


@router.get("/{categoria}/{canal}", response_model=schemas.CanalDetalleResponse)
def obtener_canal(categoria: str, canal: str):
    try:
        return service.obtener_canal(categoria, canal)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer el transcript.")
