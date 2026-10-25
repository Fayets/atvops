"""Por qué una llamada no aparece en Ventas → Llamadas.

Compara, en un rango de fechas, lo que hay en el Google Calendar de ATV contra lo que hay
en el registro de llamadas de Ops. No escribe nada: solo mira y explica.

Una reunión entra al registro cuando pasa dos filtros, y acá se ve cuál la frenó:
  1. Está en el calendario que lee Ops (el de la cuenta de ATV, uno solo). Si se agendó en
     el calendario personal de alguien, Ops no la ve nunca.
  2. El título dice "Aumenta Tu Valor" —la marca que pone Calendly—. Una reunión cargada a
     mano como "Llamada Gabriel" está en el calendario pero Ops la saltea.

La lista "CASI ENTRAN" es la que importa revisar: títulos que hablan de la marca y aun así
quedan afuera. Así apareció que "Aúmenta" y "Aumento" se estaban perdiendo llamadas
enteras sin que nada lo dijera.

    docker exec atv-ops-backend python scripts/revisar_llamadas.py --desde 2026-09-29
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from datetime import date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pony.orm import db_session  # noqa: E402

from src.db import init_db  # noqa: E402
from src.models import ReunionCrm  # noqa: E402
from src.services import gcal_services as gcal  # noqa: E402
from src.services.transcripts_services import AR_TZ  # noqa: E402


def _clave(texto: str) -> str:
    t = unicodedata.normalize("NFKD", (texto or "").strip()).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def main() -> int:
    hoy = date.today()
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--desde", default=(hoy - timedelta(days=45)).isoformat())
    p.add_argument("--hasta", default=(hoy + timedelta(days=1)).isoformat())
    a = p.parse_args()
    desde, hasta = date.fromisoformat(a.desde), date.fromisoformat(a.hasta)
    init_db()

    # Los dos lados tienen que cortar en el mismo instante. Cuando el calendario llegaba
    # al final del último día y el registro al principio, las llamadas de ese día salían
    # listadas como faltantes aunque estuvieran guardadas.
    arranca = datetime.combine(desde, time.min)
    termina = datetime.combine(hasta, time.max)

    cred = gcal.credenciales()
    # Google quiere el rango con huso horario: sin él contesta 400.
    eventos = gcal._traer(cred["calendar_id"], cred["service_account_json"],
                          arranca.replace(tzinfo=AR_TZ), termina.replace(tzinfo=AR_TZ))
    print(f"Calendario: {cred['calendar_id']} ({cred.get('origen', '?')})")
    print(f"Rango: {desde} a {hasta} — {len(eventos)} eventos\n")

    with db_session:
        filas = list(ReunionCrm.select(
            lambda r: r.inicio_at >= arranca and r.inicio_at <= termina))
        por_evento = {r.evento_id: r for r in filas if r.evento_id}
        por_nombre = {_clave(r.prospecto): r for r in filas if r.prospecto}

        sin_marca, fuera, dentro = [], [], []
        for e in eventos:
            fecha = e["inicioAt"][:10]
            titulo = e["titulo"]
            if not gcal._MARCA.search(titulo):
                sin_marca.append((fecha, titulo))
            elif e["id"] in por_evento:
                dentro.append((fecha, titulo))
            else:
                fuera.append((fecha, titulo, _clave(gcal._prospecto(titulo)[0]) in por_nombre))

        print(f"--- EN EL REGISTRO: {len(dentro)}")
        print(f"--- EN EL CALENDARIO Y NO EN EL REGISTRO: {len(fuera)}")
        for f, t, por_nom in fuera:
            print(f"  {f}  {t}" + ("   (hay una fila con ese nombre, sin el id del evento)" if por_nom else ""))
        # Lo que dice "valor" y aun así no entra: o es una variante nueva mal tipeada, o
        # es una reunión interna. Vale la pena mirarlo de a una.
        casi = [(f, t) for f, t in sin_marca if "valor" in _clave(t)]
        print(f"\n--- CASI ENTRAN (dicen \"valor\" y Ops igual las saltea): {len(casi)}")
        for f, t in casi:
            print(f"  {f}  {t}")
        print(f"\n--- EN EL CALENDARIO SIN LA MARCA \"Aumenta Tu Valor\": {len(sin_marca)}")
        print("    (Ops no las lee: son las que se agendaron a mano o con otro link)")
        for f, t in sin_marca:
            print(f"  {f}  {t}")

        solo_ops = [r for r in filas if not r.evento_id or r.evento_id not in {e["id"] for e in eventos}]
        print(f"\n--- EN EL REGISTRO Y NO EN EL CALENDARIO: {len(solo_ops)}")
        print("    (cargadas a mano en Ops, o el evento se borró del calendario)")
        for r in sorted(solo_ops, key=lambda x: x.inicio_at):
            print(f"  {r.inicio_at.date()}  {r.prospecto}  closer={r.closer or '—'}  id={r.evento_id or '(sin evento)'}")

        print(f"\n--- POR CLOSER en el registro ({len(filas)} llamadas)")
        por_closer: dict[str, int] = {}
        for r in filas:
            por_closer[r.closer or "(sin closer)"] = por_closer.get(r.closer or "(sin closer)", 0) + 1
        for nombre, n in sorted(por_closer.items(), key=lambda x: -x[1]):
            print(f"  {n:>4}  {nombre}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
