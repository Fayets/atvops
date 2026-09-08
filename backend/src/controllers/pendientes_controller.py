from fastapi import APIRouter, Depends, HTTPException
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
        return pedidos.ejecutar_ronda(origen="manual")
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al correr la ronda.")


@router.get("/update-texto", response_class=PlainTextResponse)
def update_texto(_user: dict = Depends(get_current_user)):
    try:
        return pedidos.texto_update(pedidos.estado())
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al armar el update.")
