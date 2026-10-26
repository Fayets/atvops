"""Con qué mail entra cada uno a ATV Ops.

El equipo entra con Google, y el ingreso busca al usuario por el mail: el que no tiene
ninguno cargado no puede entrar aunque exista. Este script lo muestra y no escribe nada.

    docker exec atv-ops-backend python scripts/mails_equipo.py
"""

import sys

sys.path.insert(0, ".")

from src.db import init_db  # noqa: E402

init_db()

from pony.orm import db_session  # noqa: E402

from src.models import Usuario  # noqa: E402
from src.services.daily_services import _emails  # noqa: E402


def main() -> int:
    with db_session:
        usuarios = sorted(list(Usuario.select()), key=lambda u: (u.orden, u.username))
        sin_mail = []
        print(f"{'usuario':<12} {'nombre':<16} {'rol':<12} {'daily':<6} mails")
        for u in usuarios:
            mails = _emails(u)
            if not mails:
                sin_mail.append(u.username)
            print(f"{u.username:<12} {(u.nombre or ''):<16} {u.rol:<12} "
                  f"{('sí' if u.daily else 'no'):<6} {' · '.join(mails) or '— NO PUEDE ENTRAR —'}")
        print(f"\n{len(usuarios)} usuarios")
        if sin_mail:
            print(f"Sin mail, no entran con Google: {', '.join(sin_mail)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
