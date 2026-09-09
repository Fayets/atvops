from fastapi import APIRouter, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import eventos_services as eventos

router = APIRouter()


@router.get("")
def listar(
    _user: dict = Depends(get_current_user),
    cliente: str | None = None,
    tipo: str | None = None,
    tag: str | None = None,
    estado: str | None = None,
    responsable: str | None = None,
    dias: int | None = None,
    abiertosHace: int | None = None,
    limite: int = 200,
):
    """Consulta del log: por cliente, tipo, tag, estado, responsable o antigüedad."""
    try:
        return {
            "eventos": eventos.listar(cliente_id=cliente, tipo=tipo, tag=tag, estado=estado,
                                      responsable=responsable, desde_dias=dias, abiertos_hace=abiertosHace,
                                      limite=max(1, min(limite, 500))),
            "tipos": eventos.tipos(),
            "tags": eventos.tags(),
        }
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer el log.")


@router.get("/resumen")
def resumen(_user: dict = Depends(get_current_user)):
    try:
        return eventos.resumen()
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al resumir el log.")
