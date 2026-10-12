from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import FileResponse, Response

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


@router.post("/zip")
def bajar_zip(payload: dict = Body(...), _user: dict = Depends(get_current_user)):
    """Los .txt de varios canales en un .zip. `canales`: lista de "categoria/canal"."""
    ids = [str(x) for x in ((payload or {}).get("canales") or []) if x]
    if not ids:
        raise HTTPException(status_code=400, detail="No se eligió ningún canal.")
    try:
        datos = service.zip_de(ids)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="No se pudo armar el .zip.")
    return Response(datos, media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="canales.zip"'})


@router.get("/{categoria}/{canal}/txt")
def bajar_txt(categoria: str, canal: str, _user: dict = Depends(get_current_user)):
    """El transcript entero del canal como archivo, para bajarlo."""
    try:
        ruta = service.ruta_txt(categoria, canal)
        return FileResponse(ruta, media_type="text/plain; charset=utf-8", filename=f"{canal}.txt")
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
