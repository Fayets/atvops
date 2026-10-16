from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import audiencia_services as audiencia

router = APIRouter()

_ROLES = {"admin", "founder", "operaciones", "marketing", "ventas", "setter"}


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if (user.get("rol") or "") not in _ROLES:
        raise HTTPException(status_code=403, detail="Audiencia no es de este rol.")
    return user


@router.get("")
def listar(_user: dict = Depends(_puede)):
    """Los leads con su perfil y veredicto, el conteo y el estado de los permisos."""
    return audiencia.listar()


@router.post("/correr")
def correr(fondo: BackgroundTasks, _user: dict = Depends(_puede)):
    """Comentarios nuevos → perfiles → IA. Corre en segundo plano: tarda minutos."""
    fondo.add_task(_correr_seguro)
    return {"ok": True, "detalle": "Analizando. Recargá en un par de minutos."}


def _correr_seguro():
    try:
        audiencia.correr()
    except HTTPException:
        pass


@router.post("/cargar")
def cargar(fondo: BackgroundTasks, payload: dict = Body(...), user: dict = Depends(_puede)):
    """Usuarios pegados a mano. Se leen sus perfiles y se analizan en segundo plano."""
    r = audiencia.cargar_a_mano(str((payload or {}).get("texto") or ""), user)
    fondo.add_task(_correr_seguro)
    return r


@router.get("/criterio")
def ver_criterio(_user: dict = Depends(_puede)):
    return audiencia.criterio()


@router.put("/criterio")
def guardar_criterio(payload: dict = Body(...), user: dict = Depends(_puede)):
    return audiencia.guardar_criterio(str((payload or {}).get("texto") or ""), user)


@router.post("/{lead_id}/reanalizar")
def reanalizar(lead_id: int, _user: dict = Depends(_puede)):
    return audiencia.analizar(reanalizar_ids=[lead_id])


@router.post("/{lead_id}/estado")
def marcar(lead_id: int, payload: dict = Body(...), _user: dict = Depends(_puede)):
    return audiencia.marcar(lead_id, str((payload or {}).get("estado") or ""))
