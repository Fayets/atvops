"""
Carga los cuatro cuadros de contexto de la pizarra (dolores, diferenciales, objeciones y
narrativa) con los textos de scripts/contexto_pizarra/, que salen de los documentos armados
con el contenido de Juan de 2026 (YouTube, reels e historias) cruzado con el Miro del equipo.

    python scripts/cargar_contexto_pizarra.py            # muestra qué haría, no toca nada
    python scripts/cargar_contexto_pizarra.py --aplicar  # carga los cuadros vacíos
    python scripts/cargar_contexto_pizarra.py --aplicar --pisar   # también los que ya tienen texto

Por defecto no pisa un cuadro que alguien ya escribió: lo que el equipo cargó a mano manda.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import init_db  # noqa: E402

CARPETA = Path(__file__).resolve().parent / "contexto_pizarra"


def main() -> None:
    aplicar, pisar = "--aplicar" in sys.argv, "--pisar" in sys.argv
    init_db()
    from src.services import pizarra_services as pz

    actual = pz.contexto()
    for clave in pz.CONTEXTO:
        nuevo = (CARPETA / f"{clave}.txt").read_text(encoding="utf-8").strip()
        ya = (actual[clave]["texto"] or "").strip()
        if ya == nuevo:
            print(f"{clave:14} ya está igual, no cambia")
            continue
        if ya and not pisar:
            print(f"{clave:14} ya tiene texto ({len(ya.splitlines())} líneas, de {actual[clave]['editadoPor'] or '?'}): no se pisa sin --pisar")
            continue
        print(f"{clave:14} {'carga' if aplicar else 'cargaría'} {len(nuevo.splitlines())} líneas" + (" (pisa lo que había)" if ya else ""))
        if aplicar:
            pz.guardar_contexto(clave, nuevo, "documentos-contexto")
    if not aplicar:
        print("\nFue un simulacro. Repetí con --aplicar para guardarlo.")


if __name__ == "__main__":
    main()
