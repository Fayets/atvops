"""
Crea o actualiza un usuario de ATV Ops.

    python scripts/crear_usuario.py emi emi marketing "Emi"

Si el usuario ya existe le cambia la clave y el rol, así sirve tanto para dar de alta a
alguien como para resetearle el acceso. Los usuarios semilla se crean solos al arrancar,
pero en el servidor solo si su clave está en el .env: este script es la vía directa.

Roles: closer, setter, csm, operaciones, ventas, marketing, founder, admin.
"""

import sys

sys.path.insert(0, ".")

from src.db import init_db  # noqa: E402

init_db()

from pony.orm import db_session, select  # noqa: E402

from src.models import Usuario  # noqa: E402
from src.services.auth_services import ROLES_VALIDOS, _hash_password  # noqa: E402


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__.strip())
        return 1

    username = sys.argv[1].strip().lower()
    password = sys.argv[2]
    rol = sys.argv[3].strip().lower()
    nombre = sys.argv[4].strip() if len(sys.argv) > 4 else username.capitalize()

    if not username or not password:
        print("El usuario y la clave no pueden estar vacíos.")
        return 1
    if rol not in ROLES_VALIDOS:
        print(f"Rol inválido: {rol}. Usá uno de: {', '.join(sorted(ROLES_VALIDOS))}.")
        return 1

    with db_session:
        u = Usuario.get(username=username)
        if u is None:
            Usuario(username=username, password_hash=_hash_password(password), nombre=nombre, rol=rol)
            print(f"  {username}: creado como {rol}")
        else:
            u.password_hash = _hash_password(password)
            u.rol = rol
            u.nombre = nombre or u.nombre
            print(f"  {username}: actualizado, clave nueva y rol {rol}")
        print("usuarios:", ", ".join(f"{x.username} ({x.rol})"
                                     for x in select(x for x in Usuario).order_by(Usuario.id)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
