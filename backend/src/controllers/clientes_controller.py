from fastapi import APIRouter, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services.clientes_services import ClientesServices

router = APIRouter()
service = ClientesServices()


@router.get("")
def listar_clientes(_user: dict = Depends(get_current_user)):
    try:
        return service.listar()
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al listar clientes.")


@router.get("/{cliente_id}")
def obtener_cliente(cliente_id: str, _user: dict = Depends(get_current_user)):
    try:
        return service.obtener(cliente_id)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el cliente.")
