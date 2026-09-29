"""Lo que comparten las tres partes: dónde está todo y cómo se sale con error."""

import json
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
CONFIG = SKILL / "config.json"
SALIDA = SKILL / "salida"
AGENDA = SALIDA / "agenda.json"
FOTO = SALIDA / "capacidad.png"
FUENTES = SKILL / "fuentes"

OPS = "http://127.0.0.1:8012"
ENV_OPS = Path("/opt/atv-ops/backend/.env")


def salir(motivo: str, codigo: int = 1):
    print(motivo, file=sys.stderr)
    raise SystemExit(codigo)


def config() -> dict:
    try:
        return json.loads(CONFIG.read_text())
    except (OSError, ValueError) as e:
        salir(f"No se pudo leer {CONFIG}: {e}")
