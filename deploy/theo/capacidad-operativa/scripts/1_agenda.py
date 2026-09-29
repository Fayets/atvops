#!/usr/bin/env python3
"""
Parte 1 — Las llamadas de Nick de hoy.

    python3 scripts/1_agenda.py

Pide a ATV Ops las llamadas de venta del día (hora de Argentina, la calcula el server) y
se queda con las agendadas por Calendly. Deja el resultado en salida/agenda.json y lo
imprime.

Una llamada entra si se agendó por el sistema (`agendoEn` distinto de "Google
Calendar"). Los eventos creados a mano en el calendario quedan afuera: el 29-09-2026
"Aumenta Tu Valor & Michael" venía de ahí, y las 7 agendas de Calendly decían "ATV Ops".
No se filtra por closer (la mitad llega sin cargar), ni por título, ni por lead: las
agendas de Calendly no tienen lead en ATV Ops.
"""

import json
import urllib.error
import urllib.request

from comun import AGENDA, ENV_OPS, OPS, SALIDA, salir


def agent_key() -> str:
    """La clave sale del .env de ATV Ops: si se rota allá, acá no hay que tocar nada."""
    try:
        for linea in ENV_OPS.read_text().splitlines():
            if linea.startswith("AGENT_KEY="):
                return linea.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError as e:
        salir(f"No se pudo leer {ENV_OPS}: {e}")
    salir(f"Falta AGENT_KEY en {ENV_OPS}.")


def main() -> None:
    pedido = urllib.request.Request(f"{OPS}/api/webhooks/fathom/dia",
                                    headers={"X-Agent-Key": agent_key()})
    try:
        with urllib.request.urlopen(pedido, timeout=30) as r:
            dia = json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        salir(f"ATV Ops respondió {e.code}: {e.read()[:200].decode(errors='replace')}")
    except Exception as e:  # noqa: BLE001
        salir(f"No se pudo hablar con ATV Ops: {str(e)[:160]}")

    def es_calendly(x: dict) -> bool:
        return (x.get("agendoEn") or "").strip().lower() not in ("", "google calendar")

    llamadas = [
        {"hora": x.get("hora") or "", "nombre": (x.get("prospecto") or "").strip()}
        for x in dia.get("llamadas") or [] if es_calendly(x)
    ]
    llamadas.sort(key=lambda x: x["hora"])

    SALIDA.mkdir(exist_ok=True)
    salida = {"fecha": dia.get("fecha"), "llamadas": llamadas}
    AGENDA.write_text(json.dumps(salida, ensure_ascii=False, indent=2))
    print(json.dumps(salida, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
