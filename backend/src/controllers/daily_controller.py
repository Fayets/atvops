"""Daily, semana por rol, Backbone y el chequeo de Theo de las 23:00."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from src.controllers.auth_controller import get_current_user
from src.controllers.webhooks_controller import _agente
from src.services import daily_services as svc

router = APIRouter()


class TareaNueva(BaseModel):
    semana: str
    texto: str
    tipo: str = "desplazamiento"
    dia: int | None = None  # 0=lunes … 4=viernes; sin día = abierta en la semana


class TareaEdicion(BaseModel):
    texto: str | None = None
    tipo: str | None = None


class Marca(BaseModel):
    tarea_id: int
    estado: str | None = None
    motivo: str | None = None


class DiaGuardado(BaseModel):
    fecha: str
    marcas: list[Marca]


class TareaRolIn(BaseModel):
    id: int | None = None
    texto: str
    frecuencia: str
    dia: int | None = None
    destinatario: str | None = None


class PersonaEdicion(BaseModel):
    nombre: str | None = None
    cargo: str | None = None
    area: str | None = None
    jefe: str | None = None
    daily: bool | None = None
    emails: list[str] | None = None


def _ve_backbone(user: dict) -> dict:
    if user.get("rol") not in svc.ROLES_BACKBONE:
        raise HTTPException(status_code=403, detail="Backbone es de dirección.")
    return user


def _admin(user: dict) -> dict:
    if user.get("rol") != "admin":
        raise HTTPException(status_code=403, detail="Solo un admin edita el equipo.")
    return user


# ---------------------------------------------------------------- mi daily


@router.get("/semana")
def mi_semana(semana: str | None = None, user: dict = Depends(get_current_user)):
    return svc.ver_semana(user["username"], svc._parse_fecha(semana, "semana"))


@router.post("/tareas")
def agregar(body: TareaNueva, user: dict = Depends(get_current_user)):
    return svc.agregar_tarea(user["username"], svc._parse_fecha(body.semana, "semana"), body.texto, body.tipo, body.dia)


@router.patch("/tareas/{tarea_id}")
def editar(tarea_id: int, body: TareaEdicion, user: dict = Depends(get_current_user)):
    return svc.editar_tarea(user["username"], tarea_id, body.texto, body.tipo)


@router.delete("/tareas/{tarea_id}")
def borrar(tarea_id: int, user: dict = Depends(get_current_user)):
    svc.borrar_tarea(user["username"], tarea_id)
    return {"ok": True}


@router.put("/dia")
def guardar_dia(body: DiaGuardado, user: dict = Depends(get_current_user)):
    return svc.guardar_dia(user["username"], svc._parse_fecha(body.fecha), [m.model_dump() for m in body.marcas])


# ---------------------------------------------------------------- Backbone


@router.get("/backbone")
def backbone(semana: str | None = None, user: dict = Depends(get_current_user)):
    _ve_backbone(user)
    return svc.backbone(svc._parse_fecha(semana, "semana"))


@router.get("/equipo")
def equipo(user: dict = Depends(get_current_user)):
    _ve_backbone(user)
    return svc.listar_equipo()


@router.patch("/equipo/{username}")
def editar_persona(username: str, body: PersonaEdicion, user: dict = Depends(get_current_user)):
    _admin(user)
    return svc.actualizar_persona(username, body.model_dump(exclude_unset=True))


@router.get("/equipo/{username}/rol")
def ver_rol(username: str, user: dict = Depends(get_current_user)):
    _ve_backbone(user)
    return svc.tareas_rol(username)


@router.put("/equipo/{username}/rol")
def guardar_rol(username: str, body: list[TareaRolIn], user: dict = Depends(get_current_user)):
    _admin(user)
    return svc.guardar_tareas_rol(username, [t.model_dump() for t in body])


# ---------------------------------------------------------------- Theo


@router.get("/theo")
def theo(request: Request, fecha: str | None = None):
    """Theo (X-Agent-Key) a las 23:00: quién guardó su daily hoy y el mensaje ya armado."""
    _agente(request)
    return svc.theo(svc._parse_fecha(fecha))
