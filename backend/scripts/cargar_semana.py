"""
Carga en la Daily la semana que alguien planificó en su documento del domingo.

    python scripts/cargar_semana.py            # muestra lo que va a cargar
    python scripts/cargar_semana.py --aplicar  # lo carga

Las tareas del rol ya aparecen solas: acá van solo las propias, cada una en su día.
Se puede correr de nuevo sin duplicar: lo que ya está con el mismo texto se saltea.
"""

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import init_db  # noqa: E402

LUN, MAR, MIE, JUE, VIE = range(5)
V, D = "velocidad", "desplazamiento"

# Franco · semana 7 (19 al 23 de octubre de 2026). "Weekly presentada" no va: es del rol.
SEMANAS = {
    ("franco", date(2026, 10, 19)): [
        (LUN, V, "Plataforma anunciada con el contenido actual (viene de hace dos semanas)"),
        (LUN, V, "Números del 1 al 18 pedidos a producto, ventas, marketing y fulfillment"),
        (LUN, D, "Contenido automático: definido qué pidió Juan y qué se construye primero"),
        (LUN, V, "Clases de Juampi solicitadas de nuevo"),
        (MAR, D, "Backbone nuevo probado: qué anda, qué no y qué falta"),
        (MAR, V, "Métricas del 1 al 15 cargadas con lo que haya llegado de cada área"),
        (MIE, D, "Contenido automático: primera parte construida"),
        (MIE, V, "Métricas de octubre al día, del 1 al 20"),
        (MIE, V, "Definido cómo se cargan las métricas de acá en adelante"),
        (JUE, V, "Reporte de los primeros 15 días enviado a Juan (producto, ventas, marketing y fulfillment)"),
        (JUE, D, "Backbone: corregido lo que salió del testeo"),
        (VIE, D, "Contenido automático: primera parte andando"),
        (VIE, V, "Weekly de cierre presentada"),
        (VIE, V, "Reporte de setter cargado"),
        (VIE, V, "Reporte de closer cargado"),
    ],
}


def main() -> None:
    aplicar = "--aplicar" in sys.argv
    init_db()
    from src.services import daily_services as d

    for (usuario, lunes), tareas in SEMANAS.items():
        ya = {t["texto"] for t in d.ver_semana(usuario, lunes)["tareas"]}
        print(f"{usuario} · semana del {lunes:%d/%m}")
        for dia, tipo, texto in tareas:
            if texto in ya:
                print(f"  = {d.DIAS[dia]:<9} {texto}")
                continue
            if aplicar:
                d.agregar_tarea(usuario, lunes, texto, tipo, dia)
            print(f"  + {d.DIAS[dia]:<9} [{tipo}] {texto}")
    if not aplicar:
        print("\nNo se cargó nada. Para cargarlo: --aplicar")


if __name__ == "__main__":
    main()
