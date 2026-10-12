from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import reporte_services as reporte

router = APIRouter()

_ROLES = {"admin", "founder", "operaciones", "ventas"}


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if (user.get("rol") or "") not in _ROLES:
        raise HTTPException(status_code=403, detail="El reporte de dirección no es de este rol.")
    return user


@router.get("/areas")
def areas(_user: dict = Depends(_puede)):
    """Las áreas que se pueden elegir, con una línea de qué trae cada una."""
    return reporte.AREAS


@router.post("/armar")
def armar(payload: dict = Body(...), _user: dict = Depends(_puede)):
    """Arma la hoja para un período y unas áreas. `lecturas: true` pide además el texto
    propuesto por la IA para cada sección."""
    try:
        hoja = reporte.armar(str((payload or {}).get("desde") or ""), str((payload or {}).get("hasta") or ""),
                             list((payload or {}).get("areas") or []))
        if (payload or {}).get("lecturas"):
            for clave, texto in reporte.proponer_lecturas(hoja).items():
                hoja["secciones"][clave]["lectura"] = texto
        return hoja
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo armar el reporte: {e}") from e


@router.post("/lecturas")
def lecturas(payload: dict = Body(...), _user: dict = Depends(_puede)):
    """Solo las lecturas, para volver a pedirlas sobre una hoja ya armada."""
    return reporte.proponer_lecturas((payload or {}).get("hoja") or {})


@router.get("")
def listar(_user: dict = Depends(_puede)):
    return reporte.listar()


@router.get("/{reporte_id}")
def obtener(reporte_id: int, _user: dict = Depends(_puede)):
    return reporte.obtener(reporte_id)


@router.post("")
def guardar(payload: dict = Body(...), user: dict = Depends(_puede)):
    try:
        return reporte.guardar(payload or {}, user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el reporte: {e}") from e
