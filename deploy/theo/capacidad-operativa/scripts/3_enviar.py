#!/usr/bin/env python3
"""
Parte 3 — Mandar la foto al grupo.

    python3 scripts/3_enviar.py              # manda salida/capacidad.png
    python3 scripts/3_enviar.py --simulacro  # dice qué mandaría y no manda

Va por el CLI de OpenClaw, el mismo WhatsApp de Theo. El grupo sale de config.json.
"""

import subprocess
import sys

from comun import FOTO, config, salir


def main() -> None:
    grupo = (config().get("grupo") or "").strip()
    if not grupo:
        salir('Falta "grupo" en config.json: el ID del grupo Capacidad Operativa ATV (…@g.us).')
    if not FOTO.exists():
        salir(f"No está {FOTO}: corré antes la parte 2.")

    comando = ["openclaw", "message", "send", "--channel", "whatsapp",
               "--target", grupo, "--media", str(FOTO)]
    if "--simulacro" in sys.argv:
        print("Simulacro:", " ".join(comando))
        return
    try:
        r = subprocess.run(comando, capture_output=True, text=True, timeout=120)
    except Exception as e:  # noqa: BLE001
        salir(f"No se pudo ejecutar openclaw: {str(e)[:160]}")
    if r.returncode != 0:
        salir(f"openclaw devolvió {r.returncode}: {(r.stderr or r.stdout)[:300]}")
    print(f"Foto enviada a {grupo}.")


if __name__ == "__main__":
    main()
