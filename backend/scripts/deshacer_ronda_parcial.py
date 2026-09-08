"""
Deshace lo que la primera ronda (versión vieja, que escribía canal por canal) dejó
a medias en producción: borra los pedidos que creó Claude, vuelve a "esperando al
equipo" los pedidos del update manual que marcó resueltos y borra los ledgers para
que la próxima ronda relea todos los canales. La semilla del update manual se conserva.

Uso: docker compose exec backend python scripts/deshacer_ronda_parcial.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pony.orm import db_session  # noqa: E402

from src.db import init_db  # noqa: E402
from src.models import LedgerCanal, PedidoAbierto, RondaPendientes  # noqa: E402


def main() -> None:
    init_db()
    with db_session:
        creados_por_claude = [p for p in PedidoAbierto.select() if p.clave_ia]
        for p in creados_por_claude:
            p.delete()
        restaurados = 0
        for p in PedidoAbierto.select():
            if p.estado == "resuelto" or p.resuelto_at is not None:
                p.estado = "esperando_equipo"
                p.resuelto_at = None
                restaurados += 1
        ledgers = LedgerCanal.select().count()
        LedgerCanal.select().delete(bulk=True)
        rondas = RondaPendientes.select().count()
        RondaPendientes.select().delete(bulk=True)
        quedan = PedidoAbierto.select().count()
    print(f"Borrados {len(creados_por_claude)} pedidos creados por Claude, {restaurados} restaurados a esperando_equipo, "
          f"{ledgers} ledgers y {rondas} rondas borrados. Quedan {quedan} pedidos (la semilla del update manual).")


if __name__ == "__main__":
    main()
