from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import cartera_services as cartera
from src.services import marketing_services as marketing
from src.services import onboarding_services as onboarding
from src.services import reporte_semanal_services as reporte
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


@router.get("/mi-setting")
def mi_setting(user: dict = Depends(get_current_user), mes: str | None = None):
    """Los números del setter: hoy, el mes y las llamadas que agendó."""
    try:
        return ventas.mi_setting(user, mes=mes)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer tu setting.")


@router.get("/marketing")
def marketing_real(_user: dict = Depends(get_current_user), mes: str | None = None, refrescar: bool = False):
    """Ads, contenido, historias y setting del mes, del CRM de Marketing."""
    try:
        return marketing.resumen(mes=mes, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer marketing.")


@router.get("/cobranza")
def cobranza_real(_user: dict = Depends(get_current_user), mes: str | None = None, refrescar: bool = False):
    """Cuotas y deuda de la cartera, del esquema clients."""
    try:
        return cartera.resumen(mes=mes, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer cobranza.")


@router.get("/cartera-ops")
def cartera_ops(_user: dict = Depends(get_current_user), mes: str | None = None):
    """Altas, bajas, vencimientos y plata de la cartera para la vista OPS."""
    try:
        return cartera.ops(mes=mes)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer la cartera.")


@router.get("/reporte-semanal")
def reporte_semanal(_user: dict = Depends(get_current_user), semana: str | None = None, refrescar: bool = False):
    """Todo lo que pasó en una semana: marketing, ventas, cartera y ads."""
    try:
        return reporte.reporte(semana=semana, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al armar el reporte semanal.")


@router.get("/onboarding")
def onboarding_real(_user: dict = Depends(get_current_user), mes: str | None = None, refrescar: bool = False):
    """Los onboardings que llegaron por ATV Onboarding."""
    try:
        return onboarding.resumen(mes=mes, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer los onboardings.")


@router.get("/fuentes")
def fuentes(_user: dict = Depends(get_current_user)):
    """Qué fuentes están conectadas: lo que no lo esté, se muestra en cero."""
    return {"crm": ventas.estado(), "marketing": marketing.estado(), "cobranza": cartera.estado(),
            "onboarding": onboarding.estado()}
