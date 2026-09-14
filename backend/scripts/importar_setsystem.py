"""
Trae los pitches que Cris carga en SetSystem a la base de ATV Ops.

    python scripts/importar_setsystem.py              # muestra lo que haría
    python scripts/importar_setsystem.py --aplicar    # lo hace

SetSystem arranca en el pitch: no registra cuántas conversaciones se abrieron, así que la
etapa de chats sigue sin fuente. Lo que sí tiene —y es justo lo que a ATV Ops le falta—
es el link de agenda enviado, que acá es la etapa "Pitches".

Las agendas y los shows NO se importan: ya salen de las reuniones de ATV Ops. Traerlos
también sería contar dos veces lo mismo.

Se puede correr las veces que haga falta: cada pitch entra una sola vez, identificado por
su id de SetSystem.
"""

import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import init_db  # noqa: E402

API = "https://cc-setsystem-api.i-d-a-soluciones-business.workers.dev/api/leads"

# De dónde salió el lead, con los nombres que usa ATV Ops.
CANAL = {"dm": "instagram", "phone": "whatsapp", "hibrido": "hibrido"}


def traer() -> list[dict]:
    # Cloudflare rechaza al cliente de Python sin User-Agent: contesta 403.
    pedido = urllib.request.Request(API, headers={"User-Agent": "atv-ops", "Accept": "application/json"})
    with urllib.request.urlopen(pedido, timeout=40) as r:
        return (json.loads(r.read()) or {}).get("leads") or []


def main() -> None:
    aplicar = "--aplicar" in sys.argv
    init_db()
    from pony.orm import db_session

    from src.models import ConversacionIg

    leads = [l for l in traer() if l.get("pitch_date") and not l.get("deleted_at")]
    print(f"SetSystem: {len(leads)} pitches\n")

    with db_session:
        ya = {c.content_url for c in list(ConversacionIg.select()) if c.content_url.startswith("setsystem:")}

    nuevos = [l for l in leads if f"setsystem:{l['id']}" not in ya]
    print(f"  ya importados: {len(leads) - len(nuevos)}")
    print(f"  a importar:    {len(nuevos)}")
    if nuevos:
        por_mes: dict[str, int] = {}
        for l in nuevos:
            por_mes[l["pitch_date"][:7]] = por_mes.get(l["pitch_date"][:7], 0) + 1
        print("  por mes:      ", ", ".join(f"{k}: {v}" for k, v in sorted(por_mes.items())))

    if not aplicar:
        print("\nAgregá --aplicar para guardarlos.")
        return

    with db_session:
        for l in nuevos:
            try:
                cuando = datetime.fromisoformat(f"{l['pitch_date']}T12:00:00")
            except ValueError:
                continue
            ConversacionIg(
                evento="calendly", at=cuando,
                ig_usuario=str(l.get("username") or "").lstrip("@")[:120],
                nombre=str(l.get("name") or "Sin nombre")[:160],
                keyword="", content_url=f"setsystem:{l['id']}",
                contacto_id="", fuente=CANAL.get(l.get("channel"), "manual"),
                # Del payload solo queda lo que hace falta para auditar el origen del
                # número: el detalle del lead sigue viviendo en SetSystem.
                payload=json.dumps({"origen": "setsystem", "pitch_status": l.get("pitch_status"),
                                    "source": l.get("source")}, ensure_ascii=False),
            )
    print(f"\n  importados: {len(nuevos)}")


if __name__ == "__main__":
    main()
