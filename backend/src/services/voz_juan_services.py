"""
La voz de Juan, leída del cerebro de ATV Classroom (solo lectura).

El classroom mide en código cómo escribe cada persona del equipo sobre sus mensajes reales
a clientes (`classroom.cerebro_voz`: rasgos + ids de mensajes de ejemplo). La pizarra lo usa
para que las ideas, variantes y secuencias salgan redactadas como escribe Juan.

En el servidor el esquema vive en la misma base que ATV Ops; en desarrollo se puede apuntar
con `CLASSROOM_DSN`. Si no hay fuente, la pizarra sigue sin voz medida en vez de fallar.
"""

from __future__ import annotations

import json
import logging
import re
import time

from decouple import config

logger = logging.getLogger("atv_ops.voz_juan")

ESQUEMA = config("CLASSROOM_SCHEMA", default="classroom")
# Qué cuenta del classroom es Juan. Sin configurar, la de nombre "Juan…" con más mensajes medidos.
ADMIN_ID = config("PIZARRA_VOZ_ADMIN_ID", default=0, cast=int)
CACHE_S = 600                     # el classroom aprende cada 10 min: la pizarra va al mismo ritmo
MAX_EJEMPLOS = 16
_RUIDO = re.compile(r"https?://|(^|\s)@\w")

_cache: dict = {"en": 0.0, "voz": None}


def _consultar(sql: str, params: tuple | None = None) -> list[dict]:
    sql = sql.replace("{esquema}", ESQUEMA)
    dsn = (config("CLASSROOM_DSN", default="") or "").strip()
    if dsn:
        from src.services import pg_pool

        return pg_pool.consultar(dsn, sql, params)

    from pony.orm import db_session

    from src.db import ES_POSTGRES, db

    if not ES_POSTGRES:
        return []
    with db_session:
        cur = db.get_connection().cursor()
        cur.execute(sql, params or ())
        columnas = [c[0] for c in cur.description]
        return [dict(zip(columnas, fila)) for fila in cur.fetchall()]


def _leer() -> dict | None:
    filtro, params = ("v.admin_id = %s", (ADMIN_ID,)) if ADMIN_ID else ("a.nombre ILIKE %s", ("juan%",))
    filas = _consultar(
        'SELECT v.admin_id, a.nombre, v.rasgos_json, v.muestras_json, v.mensajes_analizados '
        'FROM "{esquema}"."cerebro_voz" v JOIN "{esquema}"."admins" a ON a.id = v.admin_id '
        f"WHERE {filtro} ORDER BY v.mensajes_analizados DESC LIMIT 1", params)
    if not filas:
        return None
    f = filas[0]
    ids = [int(i) for i in json.loads(f["muestras_json"] or "[]")][:40]
    ejemplos = []
    if ids:
        por_id = {r["id"]: r["texto"] for r in _consultar(
            'SELECT id, texto FROM "{esquema}"."mensajes_canal" WHERE id = ANY(%s) AND NOT borrado', (ids,))}
        # Links y @menciones son de chat, no de cómo escribe: confunden a Claude.
        ejemplos = [por_id[i] for i in ids if por_id.get(i) and not _RUIDO.search(por_id[i])][:MAX_EJEMPLOS]
    return {"nombre": f["nombre"], "mensajes": f["mensajes_analizados"],
            "rasgos": json.loads(f["rasgos_json"] or "{}"), "ejemplos": ejemplos}


def voz() -> dict | None:
    """La voz de Juan, con una hora de caché. None si el classroom no está a mano."""
    if time.time() - _cache["en"] < CACHE_S:
        return _cache["voz"]
    try:
        _cache["voz"] = _leer()
    except Exception as e:  # noqa: BLE001 — sin voz la pizarra igual trabaja
        logger.info("Voz de Juan: %s", str(e)[:200])
        _cache["voz"] = None
    _cache["en"] = time.time()
    return _cache["voz"]


def describir(r: dict) -> str:
    """Los rasgos medidos como instrucciones de escritura. Mismo criterio que el Tab del classroom."""
    if not r:
        return ""
    g = lambda k: r.get(k) or 0  # noqa: E731
    reglas = []
    if g("todo_minuscula_pct") >= 60:
        reglas.append("escribe todo en minúscula")
    elif g("mayuscula_inicial_pct") <= 40:
        reglas.append("muchas veces empieza en minúscula")
    if g("grita_pct") >= 10:
        reglas.append("pone palabras enteras en MAYÚSCULA para remarcar")
    if g("punto_final_pct") <= 20:
        reglas.append("casi nunca pone punto final")
    if r.get("abre_pregunta_pct") is not None and g("preguntas_pct") >= 10:
        reglas.append("usa ¿ al abrir preguntas" if g("abre_pregunta_pct") >= 50 else "no usa ¿ (solo ? al final)")
    if g("exclamaciones_pct") >= 25:
        reglas.append("usa exclamaciones" + ("" if g("abre_exclamacion_pct") >= 50 else ", sin ¡ al abrir"))
    if g("suspensivos_pct") >= 10:
        reglas.append("usa puntos suspensivos")
    if g("voseo_pct") >= 30:
        reglas.append("voseo (vos, tenés, fijate)")
    if g("alarga_palabras_pct") >= 8:
        reglas.append('alarga palabras para dar énfasis ("buenísimooo")')
    reglas.append(f"emojis: {' '.join(r['emojis_top'][:4])}" if g("emojis_pct") >= 15 and r.get("emojis_top") else "casi sin emojis")
    if r.get("muletillas"):
        reglas.append("muletillas: " + ", ".join(f'"{m}"' for m in r["muletillas"][:6]))
    if r.get("palabras_propias"):
        reglas.append("palabras muy suyas: " + ", ".join(r["palabras_propias"][:8]))
    if r.get("abreviaturas"):
        reglas.append("abrevia: " + ", ".join(r["abreviaturas"][:6]))
    reglas += _reglas_de_correcciones(r.get("correcciones") or {})
    return "; ".join(reglas) + "."


def _reglas_de_correcciones(c: dict) -> list[str]:
    """Lo que Juan le corrige siempre a la IA en el Tab del classroom (medido allá en código).
    Mismo criterio que el classroom: recién con 3 sugerencias aceptadas dice algo."""
    if not c or c.get("aceptadas", 0) < 3:
        return []
    reglas = []
    largo = c.get("largo_vs_ia")
    if largo and largo <= 0.8:
        reglas.append(f"cuando la IA le propone algo, lo recorta (deja más o menos el {round(largo * 100)} %): escribí más corto")
    elif largo and largo >= 1.25:
        reglas.append("cuando la IA le propone algo, lo alarga: no te quedes corto")
    if c.get("saca"):
        reglas.append("nunca uses estas palabras (las saca cada vez que la IA las pone): " + ", ".join(f'"{w}"' for w in c["saca"][:8]))
    if c.get("agrega"):
        reglas.append("suele agregar: " + ", ".join(f'"{w}"' for w in c["agrega"][:8]))
    if (c.get("saca_emojis_pct") or 0) >= 60:
        reglas.append("saca los emojis que le propone la IA")
    if (c.get("saca_signos_apertura_pct") or 0) >= 60:
        reglas.append("saca los ¿ y ¡ de apertura")
    if (c.get("saca_punto_final_pct") or 0) >= 60:
        reglas.append("saca el punto final")
    if (c.get("pasa_a_minuscula_pct") or 0) >= 60:
        reglas.append("cambia la mayúscula del principio por minúscula")
    return reglas


def bloque() -> str:
    """El tramo del pedido a Claude con la voz de Juan, o "" si no hay voz medida."""
    v = voz()
    if not v or not (v["rasgos"] or v["ejemplos"]):
        return ""
    ejemplos = "\n".join(f"- {' '.join(e.split())[:400]}" for e in v["ejemplos"])
    return (f"# Cómo escribe Juan (medido por el cerebro del classroom en {v['mensajes']} mensajes suyos)\n"
            f"{describir(v['rasgos'])}\n"
            + (f"Mensajes reales de Juan (copiá el tono, las palabras y la forma de explicar; no el contenido ni los nombres):\n{ejemplos}" if ejemplos else ""))
