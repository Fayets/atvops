"""
Trae a ATV Ops lo que todavía se leía en vivo de atv-mkt, para poder desconectarlo.

    python scripts/migrar_desde_mkt.py                       # muestra lo que haría
    python scripts/migrar_desde_mkt.py --aplicar             # lo hace
    python scripts/migrar_desde_mkt.py --aplicar --solo chats
    python scripts/migrar_desde_mkt.py --aplicar --desde 2026-08-01
    python scripts/migrar_desde_mkt.py --aplicar --borrar          # la marcha atrás

Dos cosas viajan, y son independientes:

- **chats**: cada `lead` con `fecha_bot` es una conversación que abrió el bot. Entran como
  `ConversacionIg` con evento `conversacion`, con su palabra y su contenido. Es lo que
  sostiene el KPI de chats y el reparto por palabra.
- **llamadas**: cada `lead` con `call` es una llamada de ventas. Las que ya están en el
  registro propio no se tocan; las viejas —anteriores a que arrancara el sync— entran como
  `ReunionCrm` con fuente `crm`, para que el histórico no se pierda al cortar.

**Se migra desde septiembre de 2026 para atrás no.** Es la decisión de Franco: el
histórico anterior se queda en atv-mkt y ATV Ops arranca limpio. Cambiarlo es pasar
`--desde`. Ojo con lo que implica: los meses anteriores al corte quedan vacíos en el
tablero cuando se desconecte el CRM, porque no hay de dónde leerlos.

`--borrar` deshace la migración de chats: saca las conversaciones que trajo este script y
no toca ninguna otra, porque cada una lleva marcado de qué lead salió. Es la marcha atrás
de una decisión, no una limpieza: volver a traerlas es correr el script de nuevo.

Se puede correr las veces que haga falta. Un chat se identifica por su lead de origen y
una llamada por su `lead_id`: lo que ya está no entra dos veces ni se pisa. **Nunca
sobrescribe lo que cargó el equipo**: si una reunión ya existe en ATV Ops, se deja como
está, porque acá manda el registro propio.
"""

import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from decouple import config  # noqa: E402

from src.db import init_db  # noqa: E402


def _dsn() -> str:
    """El mismo par de variables que usa crm_db. En el VPS la cargada es la segunda."""
    valor = ((config("MKT_DSN", default="") or "").strip()
             or (config("GCAL_CONEXION_DSN", default="") or "").strip())
    if not valor:
        raise SystemExit("Falta MKT_DSN (o GCAL_CONEXION_DSN) en el .env: no hay de dónde migrar.")
    return valor


def _consultar(sql: str, params=None) -> list[dict]:
    import psycopg2
    from psycopg2.extras import RealDictCursor

    with psycopg2.connect(_dsn(), connect_timeout=30) as con:
        with con.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return [dict(f) for f in cur.fetchall()]


# De acá para adelante. Antes de esto ATV Ops no existía como registro y no se trae.
DESDE = date(2026, 9, 1)


def _texto(v) -> str:
    return str(v or "").strip()


def migrar_chats(aplicar: bool, desde: date) -> None:
    """Los leads que abrió el bot pasan a ser conversaciones de ATV Ops."""
    from pony.orm import db_session

    from src.models import ConversacionIg

    filas = _consultar(
        "SELECT id, nombre, ig, keyword, content_url, fecha_bot, manychat_contact_id, origen "
        "FROM lead WHERE fecha_bot >= %s ORDER BY fecha_bot",
        (desde,),
    )
    print(f"atv-mkt tiene {len(filas)} leads con fecha de bot desde {desde}.")

    nuevos = repetidos = 0
    with db_session:
        # El lead de origen queda en `payload` para poder reconocer lo ya migrado sin
        # agregarle una columna al modelo solo para esto.
        ya = {c.payload for c in list(ConversacionIg.select()) if (c.payload or "").startswith("mkt:lead:")}
        for f in filas:
            marca = f"mkt:lead:{f['id']}"
            if marca in ya:
                repetidos += 1
                continue
            nuevos += 1
            if aplicar:
                ConversacionIg(
                    evento="conversacion",
                    at=f["fecha_bot"],
                    ig_usuario=_texto(f["ig"]).lstrip("@"),
                    nombre=_texto(f["nombre"]),
                    keyword=_texto(f["keyword"]).lower(),
                    content_url=_texto(f["content_url"]),
                    contacto_id=_texto(f["manychat_contact_id"]),
                    # El canal con el que ATV Ops ya agrupa: son DM de Instagram.
                    fuente="manychat",
                    payload=marca,
                )
    print(f"  chats: {nuevos} nuevos, {repetidos} que ya estaban.")


def borrar_chats(aplicar: bool) -> None:
    """Saca las conversaciones que trajo este script, y solo esas."""
    from pony.orm import db_session

    from src.models import ConversacionIg

    with db_session:
        # La marca dice de qué lead salió cada una: lo que entró por el webhook no la
        # tiene y no se toca.
        suyas = [c for c in list(ConversacionIg.select()) if (c.payload or "").startswith("mkt:lead:")]
        print(f"Conversaciones traídas de atv-mkt: {len(suyas)}.")
        otras = ConversacionIg.select().count() - len(suyas)
        print(f"Del webhook de ATV Ops, que no se tocan: {otras}.")
        if aplicar:
            for c in suyas:
                c.delete()
            print(f"  borradas {len(suyas)}.")


def migrar_llamadas(aplicar: bool, desde: date) -> None:
    """Las llamadas del CRM que el registro propio nunca vio."""
    from pony.orm import db_session

    from src.models import ReunionCrm

    filas = _consultar(
        "SELECT id, nombre, email, telefono, ig, origen, closer, setter, call, agendo, "
        "       agendo_en, ingresos_rango, vino_de_ads, link_llamada, created_at, "
        "       calificacion_llamada, programa_ofrecido, pago, debe, notas "
        "FROM lead WHERE call >= %s ORDER BY call",
        (desde,),
    )
    print(f"atv-mkt tiene {len(filas)} leads con fecha de llamada desde {desde}.")

    nuevas = repetidas = 0
    with db_session:
        conocidas = {r.lead_id for r in list(ReunionCrm.select()) if r.lead_id}
        for f in filas:
            if f["id"] in conocidas:
                repetidas += 1
                continue
            nuevas += 1
            if aplicar:
                ReunionCrm(
                    # Las que solo vivían en el CRM ya se identificaban así en ATV Ops.
                    evento_id=f"lead:{f['id']}",
                    lead_id=f["id"],
                    prospecto=_texto(f["nombre"])[:200],
                    inicio_at=f["call"],
                    email=_texto(f["email"]),
                    telefono=_texto(f["telefono"]),
                    ig=_texto(f["ig"]).lstrip("@"),
                    setter=_texto(f["setter"]),
                    closer=_texto(f["closer"]),
                    origen=_texto(f["origen"]),
                    calificacion=_texto(f["calificacion_llamada"]).lower(),
                    link_llamada=_texto(f["link_llamada"]),
                    agendo_at=f["agendo"],
                    agendo_en=_texto(f["agendo_en"]),
                    ingresos_rango=_texto(f["ingresos_rango"]),
                    vino_de_ads=bool(f["vino_de_ads"]),
                    lead_creado_at=f["created_at"],
                    programa=_texto(f["programa_ofrecido"]),
                    cash_usd=float(f["pago"] or 0) or None,
                    saldo_usd=float(f["debe"] or 0) or None,
                    nota=_texto(f["notas"])[:2000],
                    fuente="crm",
                    sincronizado_at=datetime.utcnow(),
                )
    print(f"  llamadas: {nuevas} nuevas, {repetidas} que ya estaban en el registro propio.")


def main() -> None:
    argv = sys.argv[1:]
    aplicar = "--aplicar" in argv
    solo = ""
    for i, a in enumerate(argv):
        if a == "--solo" and i + 1 < len(argv):
            solo = argv[i + 1]
        elif a.startswith("--solo="):
            solo = a.split("=", 1)[1]
    if solo and solo not in ("chats", "llamadas"):
        raise SystemExit("--solo acepta 'chats' o 'llamadas'.")

    desde = DESDE
    for i, a in enumerate(argv):
        crudo = argv[i + 1] if a == "--desde" and i + 1 < len(argv) else (
            a.split("=", 1)[1] if a.startswith("--desde=") else "")
        if crudo:
            try:
                desde = date.fromisoformat(crudo[:10])
            except ValueError:
                raise SystemExit("--desde tiene que ser AAAA-MM-DD.")

    init_db()

    if "--borrar" in argv:
        print(f"{'Borrando' if aplicar else 'Simulacro:'} lo que este script trajo de atv-mkt.\n")
        borrar_chats(aplicar)
        if not aplicar:
            print("\nFue un simulacro. Repetí con --aplicar para borrarlo.")
        else:
            print("\nPara traerlas de vuelta: corré el script sin --borrar.")
        return

    print(f"{'Migrando' if aplicar else 'Simulacro:'} desde atv-mkt, a partir del {desde}.")
    print("Lo anterior a esa fecha se queda en atv-mkt. Se cambia con --desde.\n")
    if solo in ("", "chats"):
        migrar_chats(aplicar, desde)
    if solo in ("", "llamadas"):
        migrar_llamadas(aplicar, desde)
    if not aplicar:
        print("\nFue un simulacro. Repetí con --aplicar para guardarlo.")


if __name__ == "__main__":
    main()
