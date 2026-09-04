"""
Resolución del directorio de transcripts.

ATV Ops NO se conecta a Discord: lee la salida que ya escribe el bot de
ATV Clients (un .txt acumulativo por canal). La conexión a Discord, los intents
y el scheduler siguen viviendo allá; acá solo se consume el resultado.

Layout esperado:  <base>/<categoria>/<canal>/<canal>.txt
"""

from __future__ import annotations

from pathlib import Path

from decouple import config

# Ruta canónica en el server (el volumen que monta docker-compose de atv-clients).
CANONICAL_BASE = Path("/opt/atv-clients/transcripts")

# Fallbacks para desarrollo local, en orden de preferencia.
FALLBACKS = (
    Path.home() / "Desktop" / "ATV" / "atv-clients" / "backend" / "transcripts",
)


def get_transcripts_base() -> Path:
    """Directorio base de transcripts. Configurable por TRANSCRIPTS_BASE_PATH."""
    raw = config("TRANSCRIPTS_BASE_PATH", default="").strip()
    if raw:
        path = Path(raw).expanduser()
        return path if path.is_absolute() else Path.cwd() / path

    if CANONICAL_BASE.is_dir():
        return CANONICAL_BASE

    for candidate in FALLBACKS:
        if candidate.is_dir():
            return candidate

    return CANONICAL_BASE


def base_disponible() -> bool:
    return get_transcripts_base().is_dir()
