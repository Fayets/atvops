"""
Los textos de los 9 primeros recursos de Juan, los que Franco aprobó en la maqueta (22-10-2026).

Se corre una vez, después de "Traer reels con palabra" en Marketing → Recursos:
    docker compose exec backend python scripts/recursos_titulos_iniciales.py
Solo toca los recursos que nadie editó todavía (sin titular): no pisa lo que cargó marketing.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pony.orm import db_session  # noqa: E402

from src.db import init_db  # noqa: E402

TEXTOS = {
    "4": ("Cómo hago $2M al año trabajando 4h por día", "Cómo hago *$2M al año* trabajando solo 4h/día",
          "2 llamadas = $200k", "Agenda y tiempo"),
    "info": ("Por qué cobrar por tu tiempo te pone techo", "Tu tiempo es un *problema* para el dinero",
             "Tu tiempo no escala", "Oferta"),
    "formulario": ("El formulario que hace que lleguen convencidos", "El formulario que hace que *lleguen convencidos*",
                   "Llegan así de convencidos", "Ventas"),
    "onboarding": ("Mi proceso de onboarding de 7 días", "Mi onboarding de *7 días* que hace que me paguen más",
                   "7 días = clientes que renuevan", "Fulfillment"),
    "clase": ("La clase: una sola acción que mueve el negocio", "Cómo alterar tu realidad con *una sola acción*",
              "Una acción > cien tareas", "Productividad"),
    "doc": ("Análisis de mis mejores reels", "Hice *$200k* haciendo que se obsesionen con mi contenido",
            "Los patrones de mis mejores reels", "Contenido"),
    "lecciones": ("Las lecciones que me sacaron de $30k/mes", "Me quedé estancado en *$30k/mes* por no entender esto",
                  "Estancado en $30k/mes", "Contenido"),
    "documento": ("No tenés 10 problemas: tenés uno y es marketing", "No tenés 10 problemas, *tenés 1*",
                  "Se llama marketing", "Marketing"),
}


def main() -> None:
    init_db()
    from src.models import Recurso

    with db_session:
        for slug, (titulo, titular, gancho, tema) in TEXTOS.items():
            r = Recurso.get(slug=slug)
            if r is None or r.titular:
                continue
            r.titulo, r.titular, r.gancho, r.tema = titulo, titular, gancho, tema
            print("ok", slug)


if __name__ == "__main__":
    main()
