from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import ventas_services as ventas

router = APIRouter()


@router.get("")
def resumen(_user: dict = Depends(get_current_user), mes: str | None = None, refrescar: bool = False):
    """Métricas reales de ventas desde el CRM de Marketing."""
    try:
        return ventas.resumen(mes=mes, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al calcular las métricas de ventas.")


@router.get("/estado")
def estado(_user: dict = Depends(get_current_user)):
    return ventas.estado()


@router.get("/programas")
def programas(_user: dict = Depends(get_current_user)):
    """Catálogo de programas con su precio: la facturación de cada venta."""
    try:
        return {"programas": ventas.programas()}
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer los programas.")


@router.put("/programas")
def guardar_programa(user: dict = Depends(get_current_user), payload: dict = Body(...)):
    try:
        return {"programas": ventas.guardar_programa(payload, user)}
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al guardar el programa.")


@router.delete("/programas/{programa_id}")
def borrar_programa(programa_id: int, user: dict = Depends(get_current_user)):
    try:
        return {"programas": ventas.borrar_programa(programa_id, user)}
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al borrar el programa.")


@router.get("/mis-llamadas")
def mis_llamadas(user: dict = Depends(get_current_user), closer: str | None = None):
    """Las llamadas del closer logueado: lo que viene y lo que le falta reportar."""
    try:
        return ventas.mis_llamadas(user, closer=closer)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer tus llamadas.")


@router.get("/mis-reportes")
def mis_reportes(user: dict = Depends(get_current_user), mes: str | None = None, rol: str = "setter"):
    """Los días del mes con y sin reporte cargado."""
    try:
        return ventas.mis_reportes(user, mes=mes, rol=rol if rol in ("setter", "closer") else "setter")
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer tus reportes.")


@router.post("/mis-reportes/{fecha}")
def guardar_reporte(fecha: str, user: dict = Depends(get_current_user), payload: dict = Body(...), rol: str = "setter"):
    """Carga o corrige el reporte de un día."""
    try:
        return ventas.guardar_reporte(fecha, payload, user, rol=rol if rol in ("setter", "closer") else "setter")
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al guardar el reporte.")


@router.post("/llamadas/{lead_id}/resultado")
def registrar_resultado(lead_id: int, user: dict = Depends(get_current_user), payload: dict = Body(...)):
    """El closer marca cómo salió la llamada, qué programa compró y cuánto cash dejó."""
    try:
        return ventas.registrar_resultado(lead_id, payload, user)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al guardar el resultado.")
