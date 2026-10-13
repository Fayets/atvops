"""
Chat del classroom como fuente del cerebro de clientes.

Desde octubre de 2026 los clientes hablan con el equipo en la mensajería del classroom
(classroom.atvos.io) y no solo en Discord. Esto lee esos mensajes (misma Neon, esquema
`classroom`) y los devuelve con el mismo formato que los del .txt de Discord, para que la
ficha viva, los pedidos abiertos, el riesgo y el asistente sigan viendo la conversación
entera sin enterarse de dónde vino cada mensaje.

Solo lectura. Un canal del classroom se asocia al de Discord por `clientes.canal_discord`
(#ema-romero → carpeta ema-romero). Se consulta una vez por minuto para toda la cartera.
"""

from __future__ import annotations

import logging
import time
import unicodedata
from datetime import timezone

from decouple import config

from src.services import clients_db

logger = logging.getLogger("atv_ops.classroom_chat")

ESQUEMA = config("CLASSROOM_SCHEMA", default="classroom")
_TTL = 60
_cache: dict = {"t": 0.0, "datos": {}, "nombres": {}}


def _slug(canal_discord: str | None) -> str:
    return (canal_discord or "").strip().lstrip("#").strip().lower()


def mensajes_por_canal() -> dict[str, list[dict]]:
    """slug del canal → mensajes del classroom en el formato de transcripts_services."""
    from src.services.transcripts_services import AR_TZ

    if time.time() - _cache["t"] < _TTL:
        return _cache["datos"]
    filas = clients_db.consultar(
        f"""
        SELECT m.id, m.creado_en, m.autor_tipo, m.texto,
               c.canal_discord, c.nombre AS cliente_canal,
               COALESCE(NULLIF(a.nombre, ''), a.email) AS nombre_equipo,
               COALESCE(NULLIF(cl.nombre, ''), cl.email) AS nombre_cliente,
               (SELECT string_agg(ad.nombre, ' | ' ORDER BY ad.id)
                  FROM "{ESQUEMA}"."adjuntos" ad WHERE ad.mensaje_id = m.id) AS adjuntos
        FROM "{ESQUEMA}"."mensajes_canal" m
        JOIN "{ESQUEMA}"."canales" ca ON ca.id = m.canal AND ca.tipo = 'cliente'
        JOIN "{{esquema}}"."clientes" c ON c.id = ca.cliente_id
        LEFT JOIN "{ESQUEMA}"."admins" a ON m.autor_tipo = 'admin' AND a.id = m.autor_id
        LEFT JOIN "{{esquema}}"."clientes" cl ON m.autor_tipo = 'cliente' AND cl.id = m.autor_id
        WHERE NOT m.borrado AND c.canal_discord IS NOT NULL AND c.canal_discord <> ''
        ORDER BY m.id
        """
    )
    datos: dict[str, list[dict]] = {}
    nombres: dict[str, str] = {}
    for f in filas:
        slug = _slug(f["canal_discord"])
        if not slug:
            continue
        nombres[slug] = f["cliente_canal"] or ""
        de_equipo = f["autor_tipo"] == "admin"
        autor = (f["nombre_equipo"] if de_equipo else f["nombre_cliente"]) or ("Equipo ATV" if de_equipo else "Cliente")
        fecha = f["creado_en"]
        if fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=timezone.utc)
        adjuntos = [
            {"url": None, "nombre": n.strip(), "es_imagen": n.strip().lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")), "local": None}
            for n in (f["adjuntos"] or "").split(" | ")
            if n.strip()
        ]
        datos.setdefault(slug, []).append(
            {
                "fecha_at": fecha.astimezone(AR_TZ),
                "autor": autor,
                "contenido": f["texto"] or "",
                "adjuntos": adjuntos,
                "origen": "classroom",
                "de_equipo": de_equipo,
                "classroom_id": f["id"],
            }
        )
    _cache["t"] = time.time()
    _cache["datos"] = datos
    _cache["nombres"] = nombres
    return datos


def _norm(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", (texto or "").lower())
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


def asociar(carpetas: list[str]) -> dict[str, str]:
    """carpeta de Discord → canal del classroom.

    Primero por `canal_discord` exacto. Si no coincide (hay clientes con el canal cargado
    distinto a la carpeta real: Valentino Babino → valentino-y-gaston), por el primer nombre
    del cliente, solo si hay UNA carpeta con ese nombre. Si hay dos posibles, no se adivina."""
    datos = mensajes_por_canal()
    nombres = _cache.get("nombres") or {}
    disponibles = set(carpetas)
    mapa: dict[str, str] = {}
    for slug in datos:
        if slug in disponibles:
            mapa[slug] = slug
    for slug in datos:
        if slug in mapa.values():
            continue
        partes = [p for p in _norm(nombres.get(slug, "")).replace("-", " ").split() if len(p) > 2]
        if not partes:
            continue
        candidatas = [c for c in disponibles if partes[0] in _norm(c).split("-") and c not in mapa]
        if len(candidatas) == 1:
            mapa[candidatas[0]] = slug
        elif len(candidatas) > 1:
            logger.info("Classroom #%s: %d carpetas posibles, no se asocia", slug, len(candidatas))
    return mapa


def firma(slug: str | None) -> tuple[int, int]:
    """Cuántos mensajes hay y el último id: si cambia, la conversación del canal cambió."""
    lista = (mensajes_por_canal().get(slug) or []) if slug else []
    return (len(lista), lista[-1]["classroom_id"] if lista else 0)
