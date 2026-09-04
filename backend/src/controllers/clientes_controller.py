from fastapi import APIRouter, HTTPException

from src.services.clientes_services import ClientesServices

router = APIRouter()
service = ClientesServices()


@router.get("")
def listar_clientes():
    try:
        return service.listar()
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al listar clientes.")


@router.get("/{cliente_id}")
def obtener_cliente(cliente_id: str):
    try:
        return service.obtener(cliente_id)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al obtener el cliente.")
