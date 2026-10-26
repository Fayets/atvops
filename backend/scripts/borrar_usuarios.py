"""Borra usuarios de ATV Ops por username.

    python scripts/borrar_usuarios.py emi            # solo mira y cuenta
    python scripts/borrar_usuarios.py emi --borrar   # borra

Sin `--borrar` no toca nada: primero muestra qué cuelga de cada uno. Si tiene reuniones,
ideas, tareas de la daily o cierres no se borra, porque esas filas lo referencian por el
username y quedarían huérfanas: hay que vaciarle la daily o dejarlo sin acceso en vez de
borrar la fila.

Para dejar a alguien afuera sin perder lo que hizo alcanza con sacarle los mails desde
Backbone → Equipo: el ingreso con Google busca al usuario por el mail.
"""

import sys

sys.path.insert(0, ".")

from src.db import init_db  # noqa: E402

init_db()

from pony.orm import db_session  # noqa: E402

from src.models import CierreDaily, TareaRol, TareaSemana, Usuario  # noqa: E402


def _cuelga(u: Usuario) -> list[str]:
    """Qué quedaría huérfano si se borra la fila."""
    cuentas = [
        ("reuniones", len(u.reuniones)),
        ("ideas", len(u.ideas)),
        ("tareas de rol", len([t for t in list(TareaRol.select()) if t.usuario == u.username])),
        ("tareas de semana", len([t for t in list(TareaSemana.select()) if t.usuario == u.username])),
        ("cierres de daily", len([c for c in list(CierreDaily.select()) if c.usuario == u.username])),
    ]
    return [f"{n} {q}" for n, q in cuentas if q]


def main() -> int:
    args = [a for a in sys.argv[1:] if a.strip()]
    borrar = "--borrar" in args
    nombres = [n.strip().lower() for n in args if not n.startswith("--")]
    if not nombres:
        print(__doc__.strip())
        return 1

    with db_session:
        for n in nombres:
            u = Usuario.get(username=n)
            if u is None:
                print(f"  {n}: no existe")
                continue
            cuelga = _cuelga(u)
            mails = (u.emails or "").split() or ["(sin mail)"]
            print(f"  {n}: {u.nombre or ''} · {u.rol} · {' '.join(mails)}"
                  f" · {', '.join(cuelga) if cuelga else 'no cuelga nada'}")
            if cuelga:
                print(f"     no se borra: primero hay que resolver {', '.join(cuelga)}")
                continue
            if not borrar:
                print("     listo para borrar (pasá --borrar)")
                continue
            u.delete()
            print("     borrado")
        quedan = sorted(x.username for x in list(Usuario.select()))
        print(f"\nquedan {len(quedan)}: {', '.join(quedan)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
