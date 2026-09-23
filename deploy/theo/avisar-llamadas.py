#!/usr/bin/env python3
"""
Manda al grupo de Ventas los reportes de llamadas que ATV Ops tenga en cola.

    /opt/atv-ops/deploy/theo/avisar-llamadas.py            # manda lo que haya
    /opt/atv-ops/deploy/theo/avisar-llamadas.py --simulacro # muestra y no manda

**Esto no usa ningún modelo, y esa es la idea.** Antes era un cron de Theo: el agente
leía un JSON y copiaba un texto que ATV Ops ya había escrito. Eso gastaba tokens para
nada y, peor, ataba el aviso a que la suscripción de Claude tuviera cuota — el 23-09-2026
se agotó y el grupo se quedó sin avisos, primero en silencio y después recibiendo un
"no puedo hacerlo" cada diez minutos.

La inteligencia ya la puso ATV Ops cuando Claude leyó la transcripción y dejó el mensaje
armado en `reporte_mensaje`. Acá solo hay que moverlo: pedir la cola, mandarla, marcarla.

**Solo se marca como enviado lo que se entregó.** Es la diferencia con la versión vieja:
si WhatsApp falla, los reportes se quedan en la cola y salen en la próxima corrida. Un
reporte que el sistema da por entregado no lo busca nadie.
"""

import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

OPS = "http://127.0.0.1:8012"
GRUPO_VENTAS = "120363405702147911@g.us"
ENV_OPS = Path("/opt/atv-ops/backend/.env")

# Cada reporte es un mensaje completo; van todos juntos separados por esto. El `announce`
# de OpenClaw mandaba UN texto por corrida, así que mandarlos sueltos perdía todos menos
# el primero — acá se manda una sola vez, pero la separación se conserva por costumbre
# del grupo: así se lee dónde termina una llamada y empieza la otra.
SEPARADOR = "\n\n---\n\n"


def agent_key() -> str:
    """La clave sale del .env de ATV Ops: si se rota allá, acá no hay que tocar nada."""
    try:
        for linea in ENV_OPS.read_text().splitlines():
            if linea.startswith("AGENT_KEY="):
                return linea.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError as e:
        salir(f"No se pudo leer {ENV_OPS}: {e}")
    salir(f"Falta AGENT_KEY en {ENV_OPS}.")


def salir(motivo: str, codigo: int = 1):
    print(motivo, file=sys.stderr)
    raise SystemExit(codigo)


def pedir(ruta: str, clave: str, cuerpo: dict | None = None) -> dict:
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    pedido = urllib.request.Request(
        f"{OPS}{ruta}",
        data=datos,
        headers={"X-Agent-Key": clave, "Content-Type": "application/json"},
        method="POST" if datos else "GET",
    )
    try:
        with urllib.request.urlopen(pedido, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        salir(f"{ruta} respondió {e.code}: {e.read()[:200].decode(errors='replace')}")
    except Exception as e:  # noqa: BLE001
        salir(f"No se pudo hablar con ATV Ops en {ruta}: {str(e)[:160]}")


def mandar(texto: str) -> bool:
    """Manda por WhatsApp sin pasar por el agente. Devuelve si se entregó."""
    try:
        r = subprocess.run(
            ["openclaw", "message", "send", "--channel", "whatsapp",
             "--target", GRUPO_VENTAS, "--message", texto],
            capture_output=True, text=True, timeout=120,
        )
    except Exception as e:  # noqa: BLE001
        print(f"No se pudo ejecutar openclaw: {str(e)[:160]}", file=sys.stderr)
        return False
    if r.returncode != 0:
        print(f"openclaw devolvió {r.returncode}: {(r.stderr or r.stdout)[:300]}", file=sys.stderr)
        return False
    return True


def main() -> None:
    simulacro = "--simulacro" in sys.argv
    clave = agent_key()

    reportes = pedir("/api/webhooks/fathom/pendientes", clave).get("reportes") or []
    if not reportes:
        # Silencio a propósito: no hay nada que avisar y el grupo no necesita saberlo.
        return

    texto = SEPARADOR.join((r.get("mensaje") or "").strip() for r in reportes if (r.get("mensaje") or "").strip())
    ids = [r["eventoId"] for r in reportes if r.get("eventoId")]
    if not texto:
        salir(f"Hay {len(reportes)} reportes en cola y ninguno trae mensaje.")

    quienes = ", ".join(r.get("prospecto") or "sin nombre" for r in reportes)
    if simulacro:
        print(f"Simulacro: {len(reportes)} reporte(s) — {quienes}\n")
        print(texto)
        return

    if not mandar(texto):
        # No se marca nada: quedan en la cola y salen en la próxima corrida.
        salir(f"No se pudo entregar. Los {len(reportes)} reportes siguen en cola.")

    marcados = pedir("/api/webhooks/fathom/enviados", clave, {"eventoIds": ids}).get("marcados")
    print(f"Enviados {len(reportes)} reporte(s) ({quienes}); marcados {marcados}.")


if __name__ == "__main__":
    main()
