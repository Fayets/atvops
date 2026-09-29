#!/usr/bin/env python3
"""
Parte 1 — Las llamadas de Nick de hoy.

    python3 scripts/1_agenda.py

Pide a ATV Ops las llamadas de venta del día (hora de Argentina, la calcula el server) y
se queda con las consultas ("ATV CONSULTS"). Deja el resultado en salida/agenda.json y lo
imprime.

El título de Google no alcanza solo: ATV Ops guarda el título del evento únicamente en las
llamadas que vienen solo del calendario; en las que tienen lead del CRM ese campo trae las
notas del lead y casi siempre está vacío. Y el closer tampoco: la mitad llega sin cargar.
Así que una llamada entra si:
  - tiene evento en Google (un eventoId "lead:…" es un lead del CRM sin reunión en el
    calendario: se canceló o se movió), y
  - su título está vacío (es de un lead agendado) o contiene "titulo" de config.json.
Caso real del 29-09-2026: "Aumenta Tu Valor & Michael" (evento suelto, otro título)
quedaba adentro con el filtro por closer.
"""

import json
import urllib.error
import urllib.request

from comun import AGENDA, ENV_OPS, OPS, SALIDA, config, salir


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

    titulo = (config().get("titulo") or "").strip().lower()

    def es_consulta(x: dict) -> bool:
        evento = x.get("eventoId") or ""
        if not evento or evento.startswith(("lead:", "ops:")):
            return False
        t = (x.get("titulo") or "").strip().lower()
        return not t or not titulo or titulo in t

    llamadas = [
        {"hora": x.get("hora") or "", "nombre": (x.get("prospecto") or "").strip(),
         "titulo": x.get("titulo") or "", "eventoId": x.get("eventoId") or ""}
        for x in dia.get("llamadas") or [] if es_consulta(x)
    ]
    llamadas.sort(key=lambda x: x["hora"])

    SALIDA.mkdir(exist_ok=True)
    salida = {"fecha": dia.get("fecha"), "llamadas": llamadas}
    AGENDA.write_text(json.dumps(salida, ensure_ascii=False, indent=2))
    print(json.dumps(salida, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
