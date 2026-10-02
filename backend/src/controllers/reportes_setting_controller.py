"""Reporte mensual de setting: métricas del mes, laboratorio y conclusiones."""

from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import reportes_setting_services as reportes

router = APIRouter()

# Lo arma dirección, y el setter puede mirar el suyo.
ROLES_REPORTE = frozenset({"admin", "founder", "operaciones", "ventas", "setter"})


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ROLES_REPORTE:
        raise HTTPException(status_code=403, detail="No tenés acceso al reporte de setting.")
    return user


@router.get("")
def listar(_user: dict = Depends(_puede)):
    """Los reportes ya armados, del más nuevo al más viejo."""
    try:
        return {"reportes": reportes.listar()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudieron listar los reportes: {e}") from e


@router.get("/{periodo}")
def armar(periodo: str, setter: str | None = None, user: dict = Depends(_puede)):
    """El mes entero: métricas, laboratorio y los pitches que lo componen."""
    try:
        return reportes.armar(periodo, setter, user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo armar el reporte: {e}") from e


@router.post("/{periodo}")
def guardar(periodo: str, user: dict = Depends(_puede), payload: dict = Body(default={})):
    """Guarda el reporte del mes. `cerrar` lo marca como el que se entregó."""
    datos = payload or {}
    try:
        return reportes.guardar(periodo, datos.get("datos") or {}, user,
                                setter=datos.get("setter"), cerrar=bool(datos.get("cerrar")))
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el reporte: {e}") from e
