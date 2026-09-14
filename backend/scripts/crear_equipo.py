"""
Da de alta el equipo comercial en la base de ATV Ops.

    python scripts/crear_equipo.py                  # muestra lo que va a hacer
    python scripts/crear_equipo.py --aplicar        # lo hace

Son los que trabajan hoy, con las grafías que quedaron en el histórico del CRM. Nick
figura de tres formas distintas y sin juntarlas sus llamadas salen partidas en tres
personas que no existen.

Se puede correr las veces que haga falta: actualiza lo que ya está en vez de duplicarlo.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import init_db  # noqa: E402

EQUIPO = [
    {"nombre": "Nick", "rol": "closer", "username": "nick",
     "alias": ["Nick Xanderz", "Nick Xanders"]},
    {"nombre": "Cris", "rol": "setter", "username": "cris",
     "alias": ["Cris Gonzales", "Cristian"]},
]


def main() -> None:
    aplicar = "--aplicar" in sys.argv
    init_db()
    from src.services import equipo_services

    if not aplicar:
        print("Se daría de alta (agregá --aplicar para hacerlo):\n")
        for m in EQUIPO:
            print(f"  {m['nombre']:<8} {m['rol']:<8} usuario {m['username']:<8} "
                  f"alias: {', '.join(m['alias']) or '—'}")
        print("\nLo que ya está en ATV Ops:")
        for m in equipo_services.listar(incluir_inactivos=True) or [{"nombre": "(nadie)", "rol": "", "activo": ""}]:
            print(f"  {m}")
        return

    for m in EQUIPO:
        r = equipo_services.guardar(m)
        print(f"  {r['nombre']}: {r['rol']}")
    print()
    for m in equipo_services.listar():
        print(f"  {m['nombre']:<8} {m['rol']:<8} alias: {', '.join(m['alias']) or '—'}")


if __name__ == "__main__":
    main()
