"""Reporte mensual de closing: métricas del mes, laboratorio y conclusiones."""

from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import reportes_closing_services as reportes

router = APIRouter()

# Lo arma dirección, y el closer puede mirar el suyo.
ROLES_REPORTE = frozenset({"admin", "founder", "operaciones", "ventas", "closer"})


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ROLES_REPORTE:
        raise HTTPException(status_code=403, detail="No tenés acceso al reporte de closing.")
    return user


@router.get("")
def listar(_user: dict = Depends(_puede)):
    """Los reportes ya armados, del más nuevo al más viejo."""
    try:
        return {"reportes": reportes.listar()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudieron listar los reportes: {e}") from e


@router.post("/analizar")
def analizar(user: dict = Depends(_puede), payload: dict = Body(default={})):
    """Le pasa una transcripción a la IA y guarda el avatar y la objeción en la llamada."""
    datos = payload or {}
    try:
        campos = reportes.analizar(datos.get("transcripcion") or "", datos.get("contexto") or "")
        if datos.get("eventoId"):
            return reportes.guardar_analisis(datos["eventoId"],
                                             {**campos, "prospecto": datos.get("prospecto")}, user)
        return campos
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo analizar la llamada: {e}") from e


@router.get("/{periodo}")
def armar(periodo: str, closer: str | None = None, user: dict = Depends(_puede)):
    """El mes entero: métricas, laboratorio y las llamadas con su análisis."""
    try:
        return reportes.armar(periodo, closer, user)
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
                                closer=datos.get("closer"), cerrar=bool(datos.get("cerrar")))
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el reporte: {e}") from e
