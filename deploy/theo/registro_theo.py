"""
Anota en ATV Ops (vista Theo) lo que un script del VPS mandó directo por WhatsApp.

Es de mejor esfuerzo a propósito: si Ops no contesta, el aviso ya salió igual y no se
reintenta nada. Solo se pierde la línea en el registro.
"""

import json
import urllib.request
from pathlib import Path

OPS = "http://127.0.0.1:8012"
ENV_OPS = Path("/opt/atv-ops/backend/.env")


def _clave() -> str | None:
    try:
        for linea in ENV_OPS.read_text().splitlines():
            if linea.startswith("AGENT_KEY="):
                return linea.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        return None
    return None


def anotar(envio: str, texto: str, ok: bool = True, error: str | None = None) -> None:
    clave = _clave()
    if not clave:
        return
    cuerpo = json.dumps({"envio": envio, "texto": texto, "ok": ok, "error": error}).encode()
    pedido = urllib.request.Request(f"{OPS}/api/theo/registro", data=cuerpo, method="POST",
                                    headers={"X-Agent-Key": clave, "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(pedido, timeout=10).read()
    except Exception:  # noqa: BLE001
        pass
