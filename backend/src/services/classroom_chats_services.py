"""Los chats del classroom, para sumarlos a los de Discord.

Desde el 28-10-2026 los clientes escriben en la mensajería del classroom. ATV Ops lee
Discord por los transcripts del bot y eso sigue igual —por si alguien vuelve a escribir
ahí—; lo que se agrega acá son los mensajes del classroom, en el canal de cada cliente
(Franco, 30-10-2026: "debería comenzar a tragar los chats del classroom").

**Solo los mensajes nativos.** El 27-10 se copió toda la historia de Discord al
classroom, y esa copia ya está en los transcripts: sumarla contaría todo dos veces. Los
copiados se reconocen por la hora: Discord los dejó en minutos exactos (segundo 0, sin
fracción), y lo que se escribe en el classroom lleva segundos.

Lee el esquema `classroom` de la misma base con la conexión de `clients_db`, solo con
SELECT. Si no está disponible, devuelve vacío y Ops sigue con Discord solo.
"""

from __future__ import annotations

import logging
import re
import threading
import time
import unicodedata
from datetime import timedelta, timezone

from src.services import clients_db

logger = logging.getLogger("atv_ops.classroom_chats")

AR_TZ = timezone(timedelta(hours=-3))
CACHE_SEGUNDOS = 60

# El plan del cliente a la categoría de Discord donde estaría su canal: un cliente que
# entró después de Discord no tiene carpeta, y sin categoría de cliente no se lo mira.
CATEGORIA_POR_PLAN = {
    "boost": "boost", "mentoria": "mentoria", "advantage": "advantage",
    "mid": "avanzados", "entry": "principiantes", "2k": "principiantes",
}

_SQL = (
    "SELECT ch.id AS canal_id, ch.cliente_id, ch.nombre AS canal_nombre, "
    "       coalesce(ch.inactivo, false) AS inactivo, "
    "       c.nombre AS cliente, c.canal_discord, c.plan_actual, "
    "       m.id, m.autor_tipo, m.texto, m.creado_en, "
    # Muchos mensajes no guardan el nombre: sale del equipo, del miembro del equipo del
    # cliente o del cliente mismo.
    "       coalesce(nullif(m.autor_nombre, ''), mc.nombre, "
    "                CASE WHEN m.autor_tipo = 'admin' THEN a.nombre ELSE autor.nombre END) AS autor_nombre "
    "FROM classroom.mensajes_canal m "
    "JOIN classroom.canales ch ON ch.id = m.canal "
    "LEFT JOIN {esquema}.clientes c ON c.id = ch.cliente_id "
    "LEFT JOIN classroom.admins a ON m.autor_tipo = 'admin' AND a.id = m.autor_id "
    "LEFT JOIN classroom.miembros_cliente mc ON mc.id = m.miembro_id "
    "LEFT JOIN {esquema}.clientes autor ON m.autor_tipo = 'cliente' AND autor.id = m.autor_id "
    "WHERE ch.tipo = 'cliente' AND NOT m.borrado "
    # Los copiados de Discord tienen la hora en minutos exactos: ya vienen por los transcripts.
    "  AND extract(second FROM m.creado_en) <> 0 "
    "ORDER BY m.creado_en"
)

_lock = threading.Lock()
_cache: dict = {"at": 0.0, "data": None}


def slug(texto: str | None) -> str:
    """Como nombra Discord un canal: minúsculas, sin tildes, guiones."""
    t = unicodedata.normalize("NFD", (texto or "").lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def por_canal() -> dict[str, dict]:
    """Los chats del classroom por canal de Discord (slug), con sus mensajes.

    La clave es el `canal_discord` del cliente en ATV Clients; si no tiene, el nombre del
    canal del classroom pasado a slug. Cada mensaje viene con la forma de los de Discord
    (`fecha_at`, `autor`, `contenido`, `adjuntos`) más `origen` y `equipo`.
    """
    with _lock:
        if _cache["data"] is not None and time.monotonic() - _cache["at"] < CACHE_SEGUNDOS:
            return _cache["data"]
    try:
        filas = clients_db.consultar(_SQL)
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron leer los chats del classroom: %s", str(e)[:160])
        filas = []

    salida: dict[str, dict] = {}
    for f in filas:
        clave = slug(f.get("canal_discord")) or slug(f.get("canal_nombre") or f.get("cliente"))
        if not clave:
            continue
        canal = salida.setdefault(clave, {
            "canal": clave,
            "cliente_id": f.get("cliente_id"),
            "cliente": f.get("cliente") or f.get("canal_nombre") or clave,
            "categoria": CATEGORIA_POR_PLAN.get((f.get("plan_actual") or "").strip().lower(), "principiantes"),
            "inactivo": bool(f.get("inactivo")),
            "mensajes": [],
        })
        cuando = f["creado_en"]
        canal["mensajes"].append({
            # La base guarda la hora en UTC sin zona, igual que los transcripts.
            "fecha_at": cuando.replace(tzinfo=timezone.utc).astimezone(AR_TZ),
            "autor": (f.get("autor_nombre") or ("Equipo ATV" if f.get("autor_tipo") == "admin" else "Cliente")).strip(),
            "contenido": (f.get("texto") or "").strip(),
            "adjuntos": [],
            "origen": "classroom",
            # En el classroom se sabe quién es del equipo; en Discord se deduce por cuántos
            # canales escribe. Un coach nuevo que escribió en un solo canal no es el cliente.
            "equipo": f.get("autor_tipo") == "admin",
        })

    with _lock:
        _cache.update(at=time.monotonic(), data=salida)
    return salida
