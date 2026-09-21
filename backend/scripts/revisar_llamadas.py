"""
Revisa que el registro de llamadas esté sano.

    python scripts/revisar_llamadas.py              # el mes en curso
    python scripts/revisar_llamadas.py 2026-09      # un mes puntual

No escribe nada: solo mira. Sirve para contestar rápido "¿el calendario está bien?" sin
tener que abrirlo y contar a ojo. Lo que busca es lo que se rompía antes: reuniones
duplicadas, números de agenda que saltan y llamadas del calendario sin resolver.
"""

import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import init_db  # noqa: E402


def main() -> None:
    init_db()
    from collections import Counter

    from pony.orm import db_session

    from src.models import ReunionCrm
    from src.services import ventas_services as ventas
    from src.services.transcripts_services import AR_TZ

    # `strftime("%B")` sale en inglés salvo que el server tenga el locale puesto.
    MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre")

    mes = next((a for a in sys.argv[1:] if not a.startswith("--")), None)
    hoy = date.today()
    anio, m = (int(mes[:4]), int(mes[5:7])) if mes else (hoy.year, hoy.month)
    desde = date(anio, m, 1)
    hasta = date(anio + (m == 12), (m % 12) + 1, 1)

    with db_session:
        todas = list(ReunionCrm.select())
        repetidos = {k: n for k, n in Counter(r.lead_id for r in todas if r.lead_id).items() if n > 1}
        print(f"Llamadas guardadas: {len(todas)}")
        print(f"  con lead del CRM:      {sum(1 for r in todas if r.lead_id)}")
        print(f"  solo del calendario:   {sum(1 for r in todas if not r.lead_id and r.fuente == 'calendario')}")
        print(f"  cargadas a mano:       {sum(1 for r in todas if r.fuente == 'manual')}")
        print(f"  con resultado cargado: {sum(1 for r in todas if (r.resultado or '').strip())}")
        # `sincronizado_at` se guarda en UTC (datetime.utcnow()): sin convertirlo,
        # la línea se lee 3 horas adelantada y parece que el sync corrió en el futuro.
        sincro = [r.sincronizado_at for r in todas if r.sincronizado_at]
        if sincro:
            ultimo = max(sincro).replace(tzinfo=timezone.utc).astimezone(AR_TZ)
            minutos = round((datetime.now(AR_TZ) - ultimo).total_seconds() / 60)
            cuando = "recién" if minutos < 1 else f"hace {minutos} min" if minutos < 120 else f"hace {minutos // 60} h"
            print(f"  último sync:           {ultimo:%Y-%m-%d %H:%M} ART ({cuando})")
        else:
            print("  último sync:           nunca")
        if repetidos:
            print(f"\n  OJO: {len(repetidos)} lead(s) con más de una reunión guardada:")
            for lead in list(repetidos)[:10]:
                suyas = [r for r in todas if r.lead_id == lead]
                print(f"    lead {lead}: " + ", ".join(f"{r.evento_id[:14]} ({r.inicio_at})" for r in suyas))
            print("    (es normal si son una 1ra y una 2da reunión; no lo es si están a la misma hora)")

    est = ventas.estado_de_las_reuniones(desde, hasta)
    por_evento = est.get("porEvento") or {}
    numeros = sorted(x["numeroAgenda"] for x in por_evento.values() if x.get("numeroAgenda"))
    tope = max(numeros) if numeros else 0
    saltos = [n for n in range(1, tope + 1) if n not in numeros]
    repes = sorted({n for n in numeros if numeros.count(n) > 1})

    print(f"\n{MESES[m - 1].capitalize()} {anio}: {len(por_evento)} reuniones, {len(numeros)} numeradas (1 a {tope})")
    print(f"  saltos en la numeración: {saltos or 'ninguno'}")
    print(f"  números repetidos:       {repes or 'ninguno'}")

    sin_cargar = [x for x in por_evento.values() if not (x.get("resultado") or "").strip()]
    print(f"  sin resultado cargado:   {len(sin_cargar)}")
    if saltos or repes:
        print("\n  Algo quedó mal. Corré `python scripts/sincronizar_llamadas.py` y volvé a revisar.")
    else:
        print("\n  El registro está sano.")


if __name__ == "__main__":
    main()
