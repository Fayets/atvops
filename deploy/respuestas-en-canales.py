#!/usr/bin/env python3
"""
Quién contestó un pedido que se mandó al canal privado de cada cliente.

    /opt/atv-ops/deploy/respuestas-en-canales.py                  # el pedido de mails para la plataforma
    /opt/atv-ops/deploy/respuestas-en-canales.py "otra frase"     # cualquier otro pedido

Recorre los transcripts que escribe el bot de ATV Clients, busca en cada canal el mensaje
del pedido (por una frase suya, sin acentos ni mayúsculas) y junta los mails que
aparecieron después. Solo lee: no toca Discord, ni los .txt, ni ninguna base.

Lo que separa es lo que importa: los que contestaron, los que vieron el pedido y no
contestaron, y los canales donde el pedido nunca se mandó. Sin esa última lista un canal
sin respuesta parece un cliente que no contestó, cuando a lo mejor nunca le llegó.
"""

import os
import re
import sys
import unicodedata
from pathlib import Path

BASE = Path(os.environ.get("TRANSCRIPTS", "/opt/atv-clients/transcripts"))
ANCLA_DEFAULT = "dando de alta a todos en la plataforma nueva"
MSG = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (.+)$", re.M)
MAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def plano(texto: str) -> str:
    """Sin acentos ni mayúsculas: la frase se escribe de muchas formas y el canal no."""
    texto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def mensajes(texto: str) -> list[tuple[str, str, str]]:
    """(fecha, autor, cuerpo) en el orden en que están en el archivo."""
    salida, marcas = [], list(MSG.finditer(texto))
    for i, m in enumerate(marcas):
        fin = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        salida.append((m.group(1), m.group(2).strip(), texto[m.end():fin].strip()))
    return salida


def main() -> None:
    ancla = plano(sys.argv[1] if len(sys.argv) > 1 else ANCLA_DEFAULT)
    if not BASE.is_dir():
        raise SystemExit(f"No encuentro los transcripts en {BASE}.")
    con, sin, sin_pedido = [], [], []
    for f in sorted(BASE.glob("*/*/*.txt")):
        canal, categoria = f.stem, f.parent.parent.name
        try:
            todos = mensajes(f.read_text(encoding="utf-8", errors="replace"))
        except OSError as e:
            print(f"!! {categoria}/{canal}: {e}", file=sys.stderr)
            continue
        # El último, no el primero: si el pedido se repitió, vale la vuelta más nueva.
        pedido = None
        for i, (fecha, _autor, cuerpo) in enumerate(todos):
            if ancla in plano(cuerpo):
                pedido = (i, fecha)
        if pedido is None:
            sin_pedido.append(f"{canal} [{categoria}]")
            continue
        desde, fecha_pedido = pedido
        respuestas = [(fecha, autor, list(dict.fromkeys(MAIL.findall(cuerpo))))
                      for fecha, autor, cuerpo in todos[desde + 1:] if MAIL.search(cuerpo)]
        (con if respuestas else sin).append((canal, categoria, fecha_pedido, respuestas))

    print(f"El pedido está en {len(con) + len(sin)} canales: contestaron {len(con)}, no contestaron {len(sin)}.\n")
    print(f"{'=' * 68}\nCONTESTARON ({len(con)})\n{'=' * 68}")
    for canal, categoria, fecha_pedido, respuestas in sorted(con):
        print(f"\n## {canal}  [{categoria}]  · pedido el {fecha_pedido}")
        for fecha, autor, mails in respuestas:
            print(f"   {fecha} · {autor}")
            for m in mails:
                print(f"      {m}")
    print(f"\n{'=' * 68}\nNO CONTESTARON ({len(sin)})\n{'=' * 68}")
    for canal, categoria, fecha_pedido, _ in sorted(sin):
        print(f"  {canal}  [{categoria}]  · pedido el {fecha_pedido}")
    if sin_pedido:
        print(f"\n{'=' * 68}\nEL PEDIDO NO ESTÁ EN ESTOS CANALES ({len(sin_pedido)})\n{'=' * 68}")
        for x in sorted(sin_pedido):
            print(f"  {x}")


if __name__ == "__main__":
    main()
