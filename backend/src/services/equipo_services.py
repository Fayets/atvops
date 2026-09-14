"""
El equipo comercial, en la base de ATV Ops.

Antes esto salía del `teammember` de atv-mkt, que tiene activos a gente que ya no trabaja
acá y dos cuentas de prueba. Ahora vive acá y se administra desde acá.

El alias no es un lujo: en el histórico del CRM el mismo closer figura como "Nick
Xanderz", "Nick Xanders" y "Nick". Sin juntarlos, sus llamadas salen partidas en tres
personas que no existen.
"""

from __future__ import annotations

import logging
import unicodedata

logger = logging.getLogger("atv_ops.equipo")

ROLES = ("closer", "setter")


def _norm(texto: str) -> str:
    base = unicodedata.normalize("NFD", str(texto or "").strip().lower())
    return "".join(c for c in base if unicodedata.category(c) != "Mn")


def _alias_de(m) -> list[str]:
    return [a.strip() for a in (m.alias or "").split(",") if a.strip()]


def listar(rol: str | None = None, incluir_inactivos: bool = False) -> list[dict]:
    from pony.orm import db_session

    from src.models import MiembroEquipo

    try:
        with db_session:
            filas = list(MiembroEquipo.select())
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo leer el equipo: %s", str(e)[:160])
        return []
    return sorted(
        [{"id": m.id, "nombre": m.nombre, "rol": m.rol, "activo": m.activo,
          "alias": _alias_de(m), "username": m.username or ""}
         for m in filas
         if (incluir_inactivos or m.activo) and (rol is None or m.rol == rol)],
        key=lambda x: (x["rol"], x["nombre"]),
    )


def nombres(rol: str | None = None) -> list[str]:
    """Los nombres canónicos. Es lo que se muestra."""
    return [m["nombre"] for m in listar(rol)]


def todas_las_grafias(rol: str | None = None) -> list[str]:
    """Nombre y alias juntos: con esto se busca en el histórico del CRM."""
    salida: list[str] = []
    for m in listar(rol):
        salida.append(m["nombre"])
        salida.extend(m["alias"])
    return salida


def canonico(nombre: str) -> str:
    """El nombre bueno de quien esté escrito así. Si no se reconoce, se devuelve igual."""
    buscado = _norm(nombre)
    if not buscado:
        return ""
    for m in listar(incluir_inactivos=True):
        if buscado == _norm(m["nombre"]) or any(buscado == _norm(a) for a in m["alias"]):
            return m["nombre"]
    return str(nombre).strip()


def guardar(datos: dict) -> dict:
    """Alta o edición de un miembro. El nombre canónico es la llave."""
    from pony.orm import db_session

    from src.models import MiembroEquipo

    nombre = str(datos.get("nombre") or "").strip()
    rol = str(datos.get("rol") or "").strip().lower()
    if not nombre:
        raise ValueError("El nombre no puede estar vacío.")
    if rol not in ROLES:
        raise ValueError(f"El rol tiene que ser uno de: {', '.join(ROLES)}.")

    alias = datos.get("alias") or []
    if isinstance(alias, str):
        alias = [a.strip() for a in alias.split(",")]
    alias = ", ".join(a for a in (str(x).strip() for x in alias) if a)

    with db_session:
        fila = MiembroEquipo.get(nombre=nombre)
        if fila is None:
            fila = MiembroEquipo(nombre=nombre, rol=rol, alias=alias,
                                 username=str(datos.get("username") or "").strip(),
                                 activo=bool(datos.get("activo", True)))
        else:
            fila.rol = rol
            fila.alias = alias
            fila.activo = bool(datos.get("activo", True))
            if datos.get("username") is not None:
                fila.username = str(datos["username"]).strip()
        return {"id": fila.id, "nombre": fila.nombre, "rol": fila.rol, "activo": fila.activo}


def borrar(nombre: str) -> bool:
    """No se borra: se marca inactivo. El histórico sigue apuntando a ese nombre."""
    from pony.orm import db_session

    from src.models import MiembroEquipo

    with db_session:
        fila = MiembroEquipo.get(nombre=nombre)
        if fila is None:
            return False
        fila.activo = False
        return True
