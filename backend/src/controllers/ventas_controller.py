import logging

from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import cartera_services as cartera
from src.services import instagram_services as instagram
from src.services import marketing_services as marketing
from src.services import onboarding_services as onboarding
from src.services import reporte_semanal_services as reporte
from src.services import ventas_services as ventas

router = APIRouter()
log = logging.getLogger("atv_ops.ventas")


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
def mis_llamadas(user: dict = Depends(get_current_user), closer: str | None = None, mes: str | None = None):
    """Las llamadas del closer logueado: lo que viene y lo que le falta reportar."""
    try:
        return ventas.mis_llamadas(user, closer=closer, mes=mes)
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
def registrar_resultado(lead_id: str, user: dict = Depends(get_current_user), payload: dict = Body(...),
                        mes: str | None = None, lista: bool = True):
    """El closer marca cómo salió la llamada, qué programa compró y cuánto cash dejó."""
    try:
        return ventas.registrar_resultado(lead_id, payload, user, mes=mes, con_lista=lista)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        # Con el motivo a la vista se puede arreglar; el mensaje genérico no decía nada.
        log.exception("Falló guardar el resultado de la llamada %s", lead_id)
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el resultado: {str(e)[:180]}")


@router.post("/llamadas/{lead_id}/descartar")
def descartar_llamada(lead_id: str, user: dict = Depends(get_current_user), recuperar: bool = False,
                      mes: str | None = None, lista: bool = True):
    """Saca la llamada de la lista y de las métricas, o la devuelve con `recuperar=true`."""
    try:
        return ventas.descartar_llamada(lead_id, user, recuperar=recuperar, mes=mes, con_lista=lista)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló borrar la llamada %s", lead_id)
        raise HTTPException(status_code=500, detail=f"No se pudo borrar la llamada: {str(e)[:180]}")


@router.post("/llamadas")
def crear_llamada(user: dict = Depends(get_current_user), payload: dict = Body(...)):
    """Cargar a mano una reunión que nunca pasó por el calendario (un referido, un chat)."""
    try:
        return ventas.crear_llamada_manual(payload, user)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló crear la llamada a mano")
        raise HTTPException(status_code=500, detail=f"No se pudo crear la llamada: {str(e)[:180]}")


@router.get("/instagram")
def instagram_contenido(_user: dict = Depends(get_current_user), mes: str | None = None):
    """Reels y secuencias de historias del mes, con lo que midió Instagram."""
    from datetime import date as _date

    try:
        hoy = _date.today()
        mes = mes or hoy.strftime("%Y-%m")
        anio, m = int(mes[:4]), int(mes[5:7])
        inicio = _date(anio, m, 1)
        fin = _date(anio + (m == 12), (m % 12) + 1, 1)
        return {"mes": mes, **instagram.contenido(inicio, fin), "estado": instagram.estado()}
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló leer el contenido de Instagram")
        raise HTTPException(status_code=500, detail=f"No se pudo leer Instagram: {str(e)[:180]}")


@router.post("/instagram/sincronizar")
def instagram_sincronizar(user: dict = Depends(get_current_user)):
    """Trae ahora lo último de Instagram, sin esperar la pasada de cada tres horas."""
    if user.get("rol") not in {"admin", "operaciones", "founder", "marketing"}:
        raise HTTPException(status_code=403, detail="Tu rol no puede sincronizar Instagram.")
    try:
        return instagram.sincronizar()
    except Exception as e:  # noqa: BLE001
        log.exception("Falló sincronizar Instagram")
        raise HTTPException(status_code=500, detail=f"No se pudo sincronizar: {str(e)[:180]}")


@router.post("/reuniones/{evento_id}/ocultar")
def ocultar_reunion(evento_id: str, user: dict = Depends(get_current_user),
                    payload: dict = Body(default={}), mostrar: bool = False):
    """Saca del calendario una reunión que no es de venta, o la vuelve a mostrar."""
    try:
        return ventas.ocultar_evento(evento_id, payload or {}, user, mostrar=mostrar)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló ocultar la reunión %s", evento_id)
        raise HTTPException(status_code=500, detail=f"No se pudo ocultar la reunión: {str(e)[:180]}")


@router.get("/reuniones")
def reuniones(_user: dict = Depends(get_current_user), desde: str | None = None, hasta: str | None = None):
    """Estado de cada reunión del calendario, para pintarlo y editarlo desde el calendario."""
    from datetime import date as _date, timedelta as _td

    try:
        hoy = _date.today()
        d0 = _date.fromisoformat(desde) if desde else hoy - _td(days=7)
        d1 = _date.fromisoformat(hasta) if hasta else hoy + _td(days=21)
        if d1 < d0:
            d0, d1 = d1, d0
        return ventas.estado_de_las_reuniones(d0, min(d1 + _td(days=1), d0 + _td(days=120)))
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer las reuniones.")


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
