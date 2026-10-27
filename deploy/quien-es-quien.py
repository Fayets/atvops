#!/usr/bin/env python3
"""Con que cuenta entra cada mail, y de quien son las tareas de la semana.

    docker exec atv-ops-backend python deploy/quien-es-quien.py

No escribe nada. Existe porque el ingreso con Google no mira el usuario: mira el mail.
`usuario_por_email` recorre los usuarios y devuelve EL PRIMERO que tenga ese mail cargado,
y el campo `emails` se edita a mano en Backbone -> Equipo. Si un mail quedo cargado en dos
fichas, el que entra con ese mail cae en la ficha que aparezca primero, y ve la daily de
otro. Esto imprime esa resolucion para cada mail y marca los repetidos.
"""

import sys
from collections import defaultdict

from pony.orm import db_session

sys.path.insert(0, "/app")

from src.db import init_db  # noqa: E402
from src.models import TareaSemana, Usuario  # noqa: E402
from src.services.daily_services import DIAS, _emails, hoy, lunes_de, usuario_por_email  # noqa: E402


def main() -> None:
    # Un `docker exec` es un proceso nuevo: la base no viene enlazada del servidor.
    init_db()
    semana = lunes_de(hoy())
    with db_session:
        gente = sorted(list(Usuario.select()), key=lambda u: u.id)
        print(f"{'=' * 72}\nMAILS CARGADOS EN CADA FICHA\n{'=' * 72}")
        de_quien = defaultdict(list)
        for u in gente:
            mails = _emails(u)
            for m in mails:
                de_quien[m].append(u.username)
            marca = "" if mails else "   <-- sin mail: no puede entrar con Google"
            print(f"  id={u.id:<3} {u.username:<10} rol={u.rol:<12} daily={u.daily!s:<5} "
                  f"{', '.join(mails) or '-'}{marca}")

        repetidos = {m: us for m, us in de_quien.items() if len(us) > 1}
        print(f"\n{'=' * 72}\nMAILS EN MAS DE UNA FICHA ({len(repetidos)})\n{'=' * 72}")
        if repetidos:
            for m, us in repetidos.items():
                print(f"  {m}: {', '.join(us)}   <-- entra en la de {usuario_por_email(m).username}")
        else:
            print("  ninguno")

        print(f"\n{'=' * 72}\nCON QUE FICHA ENTRA CADA MAIL\n{'=' * 72}")
        for m in sorted(de_quien):
            u = usuario_por_email(m)
            esperado = de_quien[m][0]
            ok = "" if u and u.username == esperado and len(de_quien[m]) == 1 else "   <-- MIRAR"
            print(f"  {m:<42} -> {u.username if u else 'NADIE'}{ok}")

        print(f"\n{'=' * 72}\nTAREAS DE LA SEMANA DEL {semana}, POR DUENO\n{'=' * 72}")
        print("Esto es lo que hay GUARDADO con el nombre de cada uno. Si en la ficha de otra\n"
              "persona aparecen tareas que son de Franco, las filas son de ella: alguien las\n"
              "cargo estando en su cuenta (Backbone -> entrar como). Si las filas son suyas y\n"
              "aun asi en pantalla veia otra daily, el problema es con que sesion entro.\n")
        por_dueno = defaultdict(list)
        for t in list(TareaSemana.select(lambda t: t.semana == semana and not t.borrada)):
            por_dueno[t.usuario].append(t)
        for username in sorted(por_dueno):
            ts = sorted(por_dueno[username], key=lambda t: (t.origen != "rol", t.orden, t.id))
            rol = sum(1 for t in ts if t.origen == "rol")
            existe = "" if Usuario.get(username=username) else "   <-- NO EXISTE ESA FICHA"
            print(f"\n## {username}  ({rol} del rol, {len(ts) - rol} propias){existe}")
            for t in ts:
                dia = DIAS[t.dia][:3].lower() if t.dia is not None else "---"
                print(f"     [{t.origen:<7} {dia}] {t.texto[:78]}")


if __name__ == "__main__":
    main()
