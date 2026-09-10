from fastapi import APIRouter, Depends, HTTPException, Query

from src.controllers.auth_controller import get_current_user, solo_interno
from src.services.cobranza_services import CobranzaServices

# Cobranza y la cartera de clientes no son datos de marketing: se cierra el router
# entero, no cada endpoint, para que lo que se agregue mañana nazca cerrado.
router = APIRouter(dependencies=[Depends(solo_interno)])
service = CobranzaServices()


@router.get("")
def resumen_cobranza(
    month: str | None = Query(default=None, description="Mes YYYY-MM (default: mes AR actual)"),
    _user=Depends(get_current_user),
):
    try:
        return service.resumen(month)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer cobranza.")
