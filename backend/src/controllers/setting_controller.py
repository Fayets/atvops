"""
El sistema del setter: pitches, métricas, sesiones de notas y respaldo.

Es SetSystem adentro de ATV Ops. Todo lo que hay acá lo carga el setter y lo ve
dirección; marketing no entra.
"""

import logging

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from src.controllers.auth_controller import solo_interno
from src.services import notas_services as notas
from src.services import setting_services as setting

log = logging.getLogger("atv_ops.setting")
router = APIRouter()


def _error(e: Exception, que: str) -> HTTPException:
    if isinstance(e, LookupError):
        return HTTPException(status_code=404, detail=str(e))
    if isinstance(e, ValueError):
        return HTTPException(status_code=400, detail=str(e))
    log.exception("Falló %s", que)
    return HTTPException(status_code=500, detail=f"No se pudo {que}: {str(e)[:180]}")


# ------------------------------------------------------------------ pitches

@router.get("/pitches")
def pitches(user: dict = Depends(solo_interno)):
    try:
        return {"pitches": setting.listar(user), "hoy": setting.hoy_ar().isoformat()}
    except Exception as e:  # noqa: BLE001
        raise _error(e, "leer los pitches")


@router.post("/pitches")
def crear_pitch(user: dict = Depends(solo_interno), payload: dict = Body(...)):
    try:
        return setting.crear(payload, user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "crear el pitch")


@router.patch("/pitches/{pitch_id}")
def actualizar_pitch(pitch_id: int, user: dict = Depends(solo_interno), payload: dict = Body(...)):
    try:
        return setting.actualizar(pitch_id, payload, user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "guardar el pitch")


@router.delete("/pitches/{pitch_id}")
def borrar_pitch(pitch_id: int, user: dict = Depends(solo_interno)):
    try:
        return setting.borrar(pitch_id, user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "borrar el pitch")


@router.delete("/pitches")
def borrar_todos(user: dict = Depends(solo_interno), confirmar: str = ""):
    if confirmar != "todo":
        raise HTTPException(status_code=400, detail="Falta la confirmación.")
    try:
        return setting.borrar_todo(user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "borrar los pitches")


@router.get("/metricas")
def metricas(user: dict = Depends(solo_interno), desde: str | None = None, hasta: str | None = None,
             canal: str | None = None):
    try:
        return setting.metricas(user, desde=desde, hasta=hasta, canal=canal)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "calcular las métricas")


# ------------------------------------------------------------------ respaldo

@router.get("/respaldo")
def respaldo(user: dict = Depends(solo_interno)):
    try:
        return setting.exportar(user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "armar el respaldo")


@router.post("/respaldo")
def restaurar(user: dict = Depends(solo_interno), payload: dict = Body(...)):
    try:
        return setting.importar(payload, user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "restaurar el respaldo")


# ------------------------------------------------------------------ sesiones de notas

@router.get("/sesiones")
def sesiones(user: dict = Depends(solo_interno)):
    try:
        return {"sesiones": notas.listar(user), "motor": notas.estado_motor()}
    except Exception as e:  # noqa: BLE001
        raise _error(e, "leer las sesiones")


@router.post("/sesiones")
def crear_sesion(user: dict = Depends(solo_interno), payload: dict = Body(...)):
    try:
        return notas.crear(payload, user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "crear la sesión")


@router.get("/sesiones/{sesion_id}")
def sesion(sesion_id: int, user: dict = Depends(solo_interno)):
    try:
        return notas.detalle(sesion_id, user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "leer la sesión")


@router.patch("/sesiones/{sesion_id}")
def actualizar_sesion(sesion_id: int, user: dict = Depends(solo_interno), payload: dict = Body(...)):
    try:
        return notas.actualizar(sesion_id, payload, user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "guardar la sesión")


@router.delete("/sesiones/{sesion_id}")
def borrar_sesion(sesion_id: int, user: dict = Depends(solo_interno)):
    try:
        return notas.borrar(sesion_id, user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "borrar la sesión")


@router.put("/sesiones/{sesion_id}/audio")
async def subir_audio(sesion_id: int, request: Request, user: dict = Depends(solo_interno),
                      pista: str = "", nombre: str = ""):
    """El audio va crudo en el cuerpo, como lo manda el grabador del navegador."""
    cuerpo = await request.body()
    try:
        return notas.guardar_audio(sesion_id, cuerpo, request.headers.get("content-type", ""), user,
                                   pista=pista, nombre=nombre)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "guardar el audio")


@router.get("/sesiones/{sesion_id}/audio")
def bajar_audio(sesion_id: int, user: dict = Depends(solo_interno), pista: str = ""):
    try:
        ruta = notas.ruta_audio(sesion_id, user, pista)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "leer el audio")
    return FileResponse(str(ruta), filename=ruta.name)


@router.post("/sesiones/{sesion_id}/procesar")
def procesar_sesion(sesion_id: int, user: dict = Depends(solo_interno), notas_tambien: bool = True):
    """Transcribe si falta y redacta las notas. Devuelve enseguida; la sesión cuenta cómo va."""
    try:
        return notas.procesar(sesion_id, user, con_notas=notas_tambien)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "procesar la sesión")


@router.post("/sesiones/{sesion_id}/refinar")
def refinar_sesion(sesion_id: int, user: dict = Depends(solo_interno), payload: dict = Body(...)):
    try:
        return notas.refinar(sesion_id, str(payload.get("pedido") or ""), user)
    except Exception as e:  # noqa: BLE001
        raise _error(e, "ajustar las notas")
