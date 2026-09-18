"""
Deja escritas en ATV Ops todas las llamadas de ventas.

    python scripts/sincronizar_llamadas.py                      # los últimos 45 días y los próximos 90
    python scripts/sincronizar_llamadas.py --desde 2026-01-01   # desde una fecha
    python scripts/sincronizar_llamadas.py --todo                # desde la primera llamada del CRM

Se corre una vez al migrar y después no hace falta: la app sincroniza sola cada diez
minutos. Es idempotente —cada llamada entra una sola vez, identificada por su evento del
calendario— y nunca pisa lo que el equipo cargó: resultado, programa, cash y nota quedan
como están.
"""

import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import init_db  # noqa: E402


def _arg(nombre: str) -> str | None:
    for a in sys.argv:
        if a.startswith(f"--{nombre}="):
            return a.split("=", 1)[1]
    if f"--{nombre}" in sys.argv:
        i = sys.argv.index(f"--{nombre}")
        if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith("--"):
            return sys.argv[i + 1]
    return None


def main() -> None:
    init_db()
    from src.services import llamadas_services as llamadas
    from src.services import ventas_services as ventas

    hoy = date.today()
    if "--todo" in sys.argv:
        filas = ventas.crm_db.consultar("SELECT min(l.call) AS primera FROM lead l WHERE l.call IS NOT NULL")
        primera = (filas[0]["primera"] if filas else None) or datetime.combine(hoy, datetime.min.time())
        desde = primera.date() if isinstance(primera, datetime) else primera
    else:
        desde = date.fromisoformat(_arg("desde")) if _arg("desde") else hoy - timedelta(days=llamadas.DIAS_ATRAS)
    hasta = date.fromisoformat(_arg("hasta")) if _arg("hasta") else hoy + timedelta(days=llamadas.DIAS_ADELANTE)

    print(f"Sincronizando las llamadas del {desde} al {hasta}…")
    # Se va de a un mes: un rango largo de una vez le pide demasiado a Google y al CRM.
    total = {"nuevas": 0, "actualizadas": 0}
    corte = desde
    while corte < hasta:
        fin = min(date(corte.year + (corte.month == 12), (corte.month % 12) + 1, 1), hasta)
        r = llamadas.sincronizar(corte, fin)
        total["nuevas"] += r["nuevas"]
        total["actualizadas"] += r["actualizadas"]
        print(f"  {corte} → {fin}: {r['nuevas']} nuevas, {r['actualizadas']} actualizadas")
        corte = fin

    print(f"\nListo: {total['nuevas']} llamadas nuevas, {total['actualizadas']} actualizadas.")


if __name__ == "__main__":
    main()
