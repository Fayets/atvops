"""Reporte mensual de producto: upsell, recompras y el estado de los vencidos."""

from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import reportes_producto_services as reportes

router = APIRouter()

# Es un reporte de dirección: lo arma quien maneja la operación, no el área.
ROLES_REPORTE = frozenset({"admin", "founder", "operaciones"})


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ROLES_REPORTE:
        raise HTTPException(status_code=403, detail="No tenés acceso a los reportes de producto.")
    return user


@router.get("")
def listar(_user: dict = Depends(_puede)):
    """Los reportes ya armados, del más nuevo al más viejo."""
    try:
        return {"reportes": reportes.listar()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudieron listar los reportes: {e}") from e


@router.get("/clientes")
def clientes(q: str = "", _user: dict = Depends(_puede)):
    """Busca en la cartera de ATV Clients, para sumar al reporte lo que el CRM no marcó."""
    try:
        return {"clientes": reportes.buscar_clientes(q)}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo buscar: {e}") from e


@router.get("/{periodo}")
def candidatos(periodo: str, _user: dict = Depends(_puede)):
    """Lo que hace falta para armar el mes: clientes con upsell, con recompra y vencidos."""
    try:
        return reportes.candidatos(periodo)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo preparar el reporte: {e}") from e


@router.post("/{periodo}")
def guardar(periodo: str, user: dict = Depends(_puede), payload: dict = Body(default={})):
    """Guarda el reporte del mes. `cerrar` lo marca como el que se entregó."""
    try:
        return reportes.guardar(periodo, (payload or {}).get("datos") or {}, user,
                                cerrar=bool((payload or {}).get("cerrar")))
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el reporte: {e}") from e


@router.post("/cliente/{cliente_id}/nota")
def anotar(cliente_id: int, user: dict = Depends(_puede), payload: dict = Body(default={})):
    """Deja la nota del paso 2 en la ficha del cliente, en ATV Clients."""
    try:
        return reportes.anotar(cliente_id, (payload or {}).get("texto") or "", user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo guardar la nota: {e}") from e
