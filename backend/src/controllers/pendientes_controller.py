from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from src.controllers.auth_controller import get_current_user
from src.services import pedidos_services as pedidos
from src.services import pendientes_services as senal

router = APIRouter()
ROLES_RONDA = {"admin", "founder", "csm", "operaciones"}


@router.get("")
def listar(_user: dict = Depends(get_current_user)):
    """Pedidos abiertos (registro que mantiene Claude) + señal en vivo de canales sin respuesta."""
    try:
        est = pedidos.estado()
        try:
            vivo = senal.calcular_pendientes()
            est["sinRespuesta"] = {"total": vivo["total"], "pendientes": vivo["pendientes"][:50], "metricasRespuesta": vivo["metricas"]}
        except Exception:  # noqa: BLE001
            est["sinRespuesta"] = None
        return est
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer los pedidos.")


@router.post("/ronda")
def ronda(user: dict = Depends(get_current_user)):
    if user.get("rol") not in ROLES_RONDA:
        raise HTTPException(status_code=403, detail="Tu rol no puede disparar una ronda.")
    try:
        return pedidos.iniciar_ronda_en_fondo(origen="manual")
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al correr la ronda.")


@router.post("/update")
def confirmar_update(user: dict = Depends(get_current_user), payload: dict = Body(...)):
    if user.get("rol") not in ROLES_RONDA:
        raise HTTPException(status_code=403, detail="Tu rol no puede confirmar el update.")
    try:
        return pedidos.confirmar_update(payload.get("texto", ""), user)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al guardar el update.")


@router.get("/progreso")
def progreso(_user: dict = Depends(get_current_user)):
    return pedidos.progreso()


@router.get("/update-texto", response_class=PlainTextResponse)
def update_texto(_user: dict = Depends(get_current_user)):
    try:
        return pedidos.texto_update(pedidos.estado())
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al armar el update.")
