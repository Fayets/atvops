from fastapi import APIRouter, Depends, HTTPException

from src import schemas
from src.controllers.auth_controller import get_current_user
from src.services import asistente_services as service

router = APIRouter()

def es_va(user: dict) -> bool:
    """ATV AI es del VA (Mauri), nadie más (Franco, 19-10-2026)."""
    return (user.get("cargo") or "").strip().upper() == "VA"


@router.post("/preguntar", response_model=schemas.AsistenteRespuesta)
def preguntar(body: schemas.AsistentePregunta, user: dict = Depends(get_current_user)):
    if not es_va(user):
        raise HTTPException(status_code=403, detail="ATV AI es del VA.")
    try:
        return service.preguntar(body.pregunta, [t.model_dump() for t in body.historial], user)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"El asistente falló: {str(e)[:200]}")
