"""La línea de pagos de los clientes (la de Mauri): datos en vivo de Clients y sus notas."""

from fastapi import APIRouter, Body, Depends, HTTPException, Response

from src.controllers.auth_controller import get_current_user
from src.services import linea_pagos_notas_services as notas

router = APIRouter()

# Es de fulfillment: el CSM y dirección. Ventas y marketing no ven la cartera.
ROLES = frozenset({"csm", "admin", "founder", "operaciones"})


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ROLES:
        raise HTTPException(status_code=403, detail="La línea de pagos es de fulfillment y dirección.")
    return user


@router.get("")
def datos(_user: dict = Depends(_puede)):
    from src.services import linea_pagos_services

    try:
        return linea_pagos_services.datos()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo armar la línea de pagos: {e}") from e


@router.get("/{coleccion}")
def listar(coleccion: str, _user: dict = Depends(_puede)):
    try:
        return notas.listar(coleccion)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/{coleccion}/{doc_id}", status_code=204)
def guardar(coleccion: str, doc_id: str, user: dict = Depends(_puede), payload: dict = Body(...)):
    try:
        notas.guardar(coleccion, doc_id, payload, user.get("username"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return Response(status_code=204)


@router.delete("/{coleccion}/{doc_id}", status_code=204)
def borrar(coleccion: str, doc_id: str, _user: dict = Depends(_puede)):
    try:
        notas.borrar(coleccion, doc_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return Response(status_code=204)
