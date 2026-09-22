"""
Trae a ATV Ops secuencias de historias que quedaron en atv-mkt y nunca se sincronizaron.

    python scripts/importar_historias_mkt.py 2026-09-01 2026-09-03 2026-09-07 2026-09-08
    python scripts/importar_historias_mkt.py --aplicar 2026-09-01 2026-09-03
    python scripts/importar_historias_mkt.py --aplicar --fotos http://1.2.3.4:8001 2026-09-01

Sin `--aplicar` muestra lo que haría y no toca nada. Se puede correr las veces que haga
falta: cada pieza entra una sola vez, identificada por su `instagram_media_id`. A las que
ya estaban solo les completa la miniatura si les falta, así que una corrida que se quedó
sin fotos se arregla repitiéndola.

La base de atv-mkt sale de `MKT_DSN` o, si no está, de `GCAL_CONEXION_DSN` —las dos
apuntan al mismo proyecto de Neon, igual que en `crm_db`—. Las fotos salen de
`ATV_MKT_API_URL`; si no está cargada, se pasa con `--fotos URL` o se importan solo los
números con `--sin-fotos`.

Por qué existe: ATV Ops sincroniza historias con su propio token desde el 09/09, y
Instagram las borra a las 24 horas. Todo lo publicado antes de esa fecha solo vive en
atv-mkt, que las venía guardando pieza por pieza con su foto.

Qué NO se puede traer: la hora de publicación. atv-mkt guarda el día de la secuencia y el
orden de las piezas, no el momento de cada una —el `created_at` es cuándo se cargó la
fila, que para el 01/09 es el 03/09—. Las piezas quedan al mediodía, espaciadas un minuto
para conservar el orden, y la fila lleva `origen: atv-mkt` en sus métricas para que la
vista pueda decir que esa hora no es un dato.
"""

import json
import sys
import urllib.request
from datetime import datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from decouple import config  # noqa: E402

from src.db import init_db  # noqa: E402

# Las fotos de atv-mkt son rutas de su propio servidor, no URLs de Instagram.
MKT_WEB = (config("ATV_MKT_API_URL", default="") or "").rstrip("/")
FOTOS = Path(__file__).resolve().parents[1] / "data" / "ig"

# Mediodía: el día es el dato real, la hora es un relleno para que el orden se conserve.
BASE = time(12, 0)


def _slides(fechas: list[str]) -> list[dict]:
    """Las piezas de esas secuencias, tal como las guardó atv-mkt."""
    import psycopg2
    from psycopg2.extras import RealDictCursor

    # El mismo par de variables que usa crm_db: en el VPS la que está cargada es
    # GCAL_CONEXION_DSN, y las dos apuntan al proyecto de Neon de atv-mkt.
    dsn = ((config("MKT_DSN", default="") or "").strip()
           or (config("GCAL_CONEXION_DSN", default="") or "").strip())
    if not dsn:
        raise SystemExit("Falta MKT_DSN (o GCAL_CONEXION_DSN) en el .env: sin eso no hay de dónde traerlas.")

    with psycopg2.connect(dsn, connect_timeout=25) as con:
        with con.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """select s.sequence_date, s.chats, s.has_cta,
                          d.order_index, d.instagram_media_id, d.image_url,
                          d.reach, d.views, d.replies, d.shares,
                          d.navigation, d.profile_visits
                   from storysequence s join storyslide d on d.sequence_id = s.id
                   where s.sequence_date = any(%s::date[])
                   order by s.sequence_date, d.order_index""",
                (fechas,),
            )
            return [dict(f) for f in cur.fetchall()]


def _bajar(ruta: str, ig_id: str, base: str) -> str:
    """Baja la foto de atv-mkt al disco de ATV Ops. Devuelve la ruta pública, o vacío."""
    if not ruta:
        return ""
    destino = FOTOS / f"{ig_id}.jpg"
    publica = f"/uploads/ig/{ig_id}.jpg"
    if destino.exists() and destino.stat().st_size > 0:
        return publica
    if not base:
        return ""
    url = ruta if ruta.startswith("http") else f"{base}/{ruta.lstrip('/')}"
    try:
        FOTOS.mkdir(parents=True, exist_ok=True)
        pedido = urllib.request.Request(url, headers={"User-Agent": "atv-ops"})
        with urllib.request.urlopen(pedido, timeout=30) as r:
            datos = r.read()
        if not datos:
            return ""
        destino.write_bytes(datos)
        return publica
    except Exception as e:  # noqa: BLE001
        print(f"    no se pudo bajar {url}: {str(e)[:120]}")
        return ""


def _origen_fotos(argv: list[str]) -> str:
    """De dónde se bajan las miniaturas: el flag manda, después la variable del .env."""
    for i, a in enumerate(argv):
        if a == "--fotos" and i + 1 < len(argv):
            return argv[i + 1].rstrip("/")
        if a.startswith("--fotos="):
            return a.split("=", 1)[1].rstrip("/")
    return MKT_WEB


def main() -> None:
    argv = sys.argv[1:]
    aplicar = "--aplicar" in argv
    sin_fotos = "--sin-fotos" in argv
    base_fotos = _origen_fotos(argv)

    saltear = {"--aplicar", "--sin-fotos", "--fotos", base_fotos, f"--fotos={base_fotos}"}
    fechas = sorted({a.strip()[:10] for a in argv if a.strip() and a not in saltear and not a.startswith("--")})
    if not fechas:
        raise SystemExit("Pasá al menos una fecha: scripts/importar_historias_mkt.py 2026-09-01")

    # Sin origen de fotos las filas entrarían sin miniatura y una segunda corrida no las
    # arreglaría sola salvo que se la vuelva a pedir: mejor frenar y decirlo.
    if not base_fotos and not sin_fotos:
        raise SystemExit(
            "No sé de dónde bajar las fotos: falta ATV_MKT_API_URL en el .env.\n"
            "  Pasala a mano:  --fotos http://72.60.244.220:8001\n"
            "  O importá solo los números:  --sin-fotos"
        )

    filas = _slides(fechas)
    if not filas:
        raise SystemExit(f"atv-mkt no tiene historias para {', '.join(fechas)}.")

    print(f"Fotos desde: {base_fotos or '(ninguna, --sin-fotos)'}")

    init_db()
    from pony.orm import db_session

    from src.models import PublicacionIg

    print(f"{'Importando' if aplicar else 'Simulacro:'} {len(filas)} piezas de {len(fechas)} secuencias.\n")
    nuevas = repetidas = completadas = 0

    with db_session:
        por_dia: dict[str, int] = {}
        for f in filas:
            dia = f["sequence_date"].isoformat()
            ig_id = str(f["instagram_media_id"] or "").strip()
            if not ig_id:
                print(f"  {dia} pieza {f['order_index']}: sin id en atv-mkt, se saltea")
                continue
            ya = PublicacionIg.get(ig_id=ig_id)
            if ya is not None:
                repetidas += 1
                # Si quedó sin miniatura —la primera corrida fue sin fotos, o el servidor
                # de atv-mkt no contestó— se completa ahora. Saltearla sin más dejaría la
                # pieza sin foto para siempre.
                if aplicar and base_fotos and not str(ya.thumbnail or "").startswith("/uploads/"):
                    ruta = _bajar(f["image_url"], ig_id, base_fotos)
                    if ruta:
                        ya.thumbnail = ruta
                        completadas += 1
                continue

            orden = por_dia.get(dia, 0)
            por_dia[dia] = orden + 1
            cuando = datetime.combine(f["sequence_date"], BASE) + timedelta(minutes=orden)
            metricas = {
                "views": int(f["views"] or 0),
                "reach": int(f["reach"] or 0),
                "replies": int(f["replies"] or 0),
                "shares": int(f["shares"] or 0),
                "navigation": int(f["navigation"] or 0),
                "profile_visits": int(f["profile_visits"] or 0),
                # atv-mkt no guardaba el total de interacciones: se suma lo que sí tiene.
                "total_interactions": int(f["replies"] or 0) + int(f["shares"] or 0) + int(f["profile_visits"] or 0),
                # La marca de dónde vino. También es lo que dice que la hora no es un dato.
                "origen": "atv-mkt",
            }
            print(f"  {dia} pieza {orden + 1}  {ig_id}  alcance {metricas['reach']}  respuestas {metricas['replies']}")

            if aplicar:
                PublicacionIg(
                    ig_id=ig_id,
                    tipo="historia",
                    publicado_at=cuando,
                    permalink="",
                    caption="",
                    thumbnail=_bajar(f["image_url"], ig_id, base_fotos),
                    keyword="",
                    metricas=json.dumps(metricas),
                )
            nuevas += 1

    print(f"\n{nuevas} piezas nuevas, {repetidas} que ya estaban"
          + (f", {completadas} a las que les faltaba la foto." if completadas else "."))
    if not aplicar:
        print("Fue un simulacro. Repetí con --aplicar para guardarlas.")
    else:
        marcadas = [f for f in filas if f["has_cta"]]
        print("Las secuencias entran sin CTA: marcalas a mano en Marketing → Historias."
              + (f" En atv-mkt {len({f['sequence_date'] for f in marcadas})} figuraban con CTA." if marcadas else ""))


if __name__ == "__main__":
    main()
