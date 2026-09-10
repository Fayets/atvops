from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user, solo_interno
from src.services import datos_cliente_services as datos
from src.services.clientes_services import ClientesServices

# Cobranza y la cartera de clientes no son datos de marketing: se cierra el router
# entero, no cada endpoint, para que lo que se agregue mañana nazca cerrado.
router = APIRouter(dependencies=[Depends(solo_interno)])
service = ClientesServices()
ROLES_EDITAR = {"admin", "founder", "csm", "operaciones"}


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


@router.put("/{cliente_id}/datos")
def guardar_datos(cliente_id: str, user: dict = Depends(get_current_user), payload: dict = Body(...)):
    """Objetivo, ICP, contacto y equipo del cliente. El contrato y los pagos son de ATV Clients."""
    if user.get("rol") not in ROLES_EDITAR:
        raise HTTPException(status_code=403, detail="Tu rol no puede editar los datos del cliente.")
    try:
        cliente = service.obtener(cliente_id)["cliente"]
        guardado = datos.guardar(cliente_id, cliente.get("canalId") or "", payload, user)
        try:
            from src.services.pedidos_services import exportar_cerebro
            exportar_cerebro()
        except Exception:  # noqa: BLE001 — el cerebro se rearma en la próxima ronda
            pass
        return guardado
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al guardar los datos.")
