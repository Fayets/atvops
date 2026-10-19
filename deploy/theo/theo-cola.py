#!/usr/bin/env python3
"""
Manda por WhatsApp lo que ATV Ops tenga en la cola de Theo y avisa cómo le fue.

    /opt/atv-ops/deploy/theo/theo-cola.py            # manda lo que vence
    /opt/atv-ops/deploy/theo/theo-cola.py --simulacro # muestra y no manda

Cron (cada minuto):
    * * * * * /usr/bin/python3 /opt/atv-ops/deploy/theo/theo-cola.py >> /var/log/theo-cola.log 2>&1

También anota en Ops lo que mandan las tareas programadas de OpenClaw (caja y recordatorio
de llamadas): cada una escribe su mensaje en /tmp/theo_<tarea>.txt justo antes de mandarlo,
y acá se lee el archivo cuando cambia. Así la grilla de Theo sabe que salió y qué dijo.

Igual que avisar-llamadas.py: no usa ningún modelo. Ops arma el texto (la daily se arma
a las 23:00 con lo que haya, salvo que alguien lo haya editado en la vista Theo) y acá
solo se mueve. Lo que no se entrega queda como fallido y Ops lo vuelve a ofrecer en la
próxima corrida, hasta tres veces o hasta que se vence.
"""

import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

OPS = "http://127.0.0.1:8012"
# tarea de OpenClaw → envío de Ops
TAREAS = {
    "caja-buenos-dias": "caja_manana",
    "caja-cierre-noche": "caja",
    "closer-llamadas-diarias": "recordatorio_llamadas",
}
ESTADO = Path("/root/.theo-cola-tareas.json")  # la última versión de cada archivo ya anotada
ENV_OPS = Path("/opt/atv-ops/backend/.env")


def salir(motivo: str, codigo: int = 1):
    print(motivo, file=sys.stderr)
    raise SystemExit(codigo)


def agent_key() -> str:
    try:
        for linea in ENV_OPS.read_text().splitlines():
            if linea.startswith("AGENT_KEY="):
                return linea.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError as e:
        salir(f"No se pudo leer {ENV_OPS}: {e}")
    salir(f"Falta AGENT_KEY en {ENV_OPS}.")


def pedir(ruta: str, clave: str, cuerpo: dict | None = None) -> dict:
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    pedido = urllib.request.Request(
        f"{OPS}{ruta}", data=datos, method="POST" if datos else "GET",
        headers={"X-Agent-Key": clave, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(pedido, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        salir(f"{ruta} respondió {e.code}: {e.read()[:200].decode(errors='replace')}")
    except Exception as e:  # noqa: BLE001
        salir(f"No se pudo hablar con ATV Ops en {ruta}: {str(e)[:160]}")


def mandar(jid: str, texto: str) -> str | None:
    """Devuelve None si se entregó, o el motivo si no."""
    try:
        r = subprocess.run(
            ["openclaw", "message", "send", "--channel", "whatsapp", "--target", jid, "--message", texto],
            capture_output=True, text=True, timeout=120,
        )
    except Exception as e:  # noqa: BLE001
        return f"No se pudo ejecutar openclaw: {str(e)[:160]}"
    if r.returncode != 0:
        return f"openclaw devolvió {r.returncode}: {(r.stderr or r.stdout)[:300]}"
    return None


def anotar_tareas(clave: str, simulacro: bool) -> None:
    """Lo que escribió cada tarea de OpenClaw desde la última vuelta, anotado una sola vez."""
    import time

    try:
        visto = json.loads(ESTADO.read_text())
    except (OSError, ValueError):
        visto = {}
    cambios = False
    for tarea, envio in TAREAS.items():
        archivo = Path(f"/tmp/theo_{tarea}.txt")
        try:
            marca = archivo.stat().st_mtime
        except OSError:
            continue
        if marca <= visto.get(tarea, 0):
            continue
        if not visto.get(tarea) and time.time() - marca > 3600:
            visto[tarea], cambios = marca, True  # la primera vez no se anota uno viejo
            continue
        texto = archivo.read_text(errors="replace").strip()
        if simulacro:
            print(f"Simulacro tarea {tarea} → {envio}\n{texto}\n")
            continue
        if texto:
            try:
                pedir("/api/theo/registro", clave, {"envio": envio, "texto": texto, "ok": True})
            except SystemExit:
                continue  # no frena la cola: se reintenta en la próxima vuelta
            print(f"Tarea {tarea}: anotada")
        visto[tarea], cambios = marca, True
    if cambios:
        ESTADO.write_text(json.dumps(visto))


def main() -> None:
    simulacro = "--simulacro" in sys.argv
    clave = agent_key()
    anotar_tareas(clave, simulacro)
    mensajes = pedir("/api/theo/cola", clave).get("mensajes") or []
    for m in mensajes:
        if simulacro:
            print(f"Simulacro #{m['id']} ({m['envio']}) → {m['jid']}\n{m['texto']}\n")
            continue
        error = mandar(m["jid"], m["texto"])
        pedir(f"/api/theo/cola/{m['id']}/resultado", clave,
              {"ok": error is None, "texto": m["texto"], "error": error})
        print(f"#{m['id']} {m['envio']}: {'enviado' if error is None else error}")


if __name__ == "__main__":
    main()
