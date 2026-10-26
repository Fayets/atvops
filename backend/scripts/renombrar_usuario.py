"""Renombra un usuario de ATV Ops y arrastra lo que lo referencia por el username.

    python scripts/renombrar_usuario.py janner janer                      # solo mira
    python scripts/renombrar_usuario.py janner janer --nombre Janer --mail x@y.com --aplicar

Sin `--aplicar` no toca nada: muestra qué filas cambiarían. El username no es la clave de
la base, pero media app lo guarda como texto —las tareas de la daily, a quién le entrega
cada tarea, los cierres, el jefe en el organigrama—, así que cambiarlo a mano en la tabla
de usuarios deja esas filas apuntando a alguien que ya no existe.

Lo que NO se toca a propósito son los campos de auditoría (`actualizado_por`,
`confirmado_por`): registran quién editó algo en su momento y tienen que seguir diciendo
lo que decían.
"""

import sys

sys.path.insert(0, ".")

from src.db import init_db  # noqa: E402

init_db()

from pony.orm import db_session  # noqa: E402

from src.models import CierreDaily, MiembroEquipo, TareaRol, TareaSemana, Usuario  # noqa: E402

# (qué es, filas, cómo se lee el valor, cómo se escribe)
CAMPOS = (
    ("tareas de rol", TareaRol, "usuario"),
    ("tareas de rol (destinatario)", TareaRol, "destinatario"),
    ("tareas de la semana", TareaSemana, "usuario"),
    ("tareas de la semana (destinatario)", TareaSemana, "destinatario"),
    ("cierres de daily", CierreDaily, "usuario"),
    ("equipo de Backbone", MiembroEquipo, "username"),
)


def _jefes(valor: str | None) -> list[str]:
    """El jefe puede ser más de uno: "maite,ignacio"."""
    return [j.strip() for j in (valor or "").replace(" ", "").split(",") if j.strip()]


def main() -> int:
    args = sys.argv[1:]
    aplicar = "--aplicar" in args
    def opcion(nombre):
        return args[args.index(nombre) + 1] if nombre in args and len(args) > args.index(nombre) + 1 else None
    nombre_nuevo, mail = opcion("--nombre"), opcion("--mail")
    sueltos = [a for i, a in enumerate(args)
               if not a.startswith("--") and args[i - 1] not in ("--nombre", "--mail")]
    if len(sueltos) != 2:
        print(__doc__.strip())
        return 1
    viejo, nuevo = sueltos[0].strip().lower(), sueltos[1].strip().lower()

    with db_session:
        u = Usuario.get(username=viejo)
        if u is None:
            print(f"No existe el usuario {viejo}.")
            return 1
        if Usuario.get(username=nuevo):
            print(f"Ya hay un usuario {nuevo}: no se puede renombrar encima.")
            return 1

        print(f"{viejo} → {nuevo}   ({u.nombre or '—'} · {u.rol})")
        if nombre_nuevo:
            print(f"  nombre: {u.nombre or '—'} → {nombre_nuevo}")
        if mail:
            print(f"  mail:   {(u.emails or '—')} → {mail}")

        pendientes = []
        for que, entidad, campo in CAMPOS:
            filas = [f for f in list(entidad.select()) if (getattr(f, campo) or "") == viejo]
            if filas:
                print(f"  {que}: {len(filas)}")
                pendientes.append((filas, campo))
        jefes = [x for x in list(Usuario.select()) if viejo in _jefes(x.jefe)]
        if jefes:
            print(f"  lo tienen de jefe: {', '.join(x.username for x in jefes)}")
        if not pendientes and not jefes:
            print("  no lo referencia nada más")

        if not aplicar:
            print("\nNo cambié nada. Pasá --aplicar para hacerlo.")
            return 0

        for filas, campo in pendientes:
            for f in filas:
                setattr(f, campo, nuevo)
        for x in jefes:
            x.jefe = ",".join(nuevo if j == viejo else j for j in _jefes(x.jefe))
        u.username = nuevo
        if nombre_nuevo:
            u.nombre = nombre_nuevo
        if mail:
            u.emails = mail
            # El `sub` de Google quedó atado al mail anterior: si cambia el mail, el
            # próximo ingreso lo vuelve a atar.
            u.google_sub = None
        print("\nListo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
