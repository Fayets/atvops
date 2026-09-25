"""
Las credenciales de las plataformas que ATV Ops consulta.

Viven en la base de ATV Ops. La primera vez se copian desde la tabla `apiconnection` de
atv-mkt, que es donde las cargó el equipo, y a partir de ahí se leen de acá: así se
pueden construir cosas nuevas sin depender de que ese sistema siga en pie.

Si una credencial cambia (un token que vence), se vuelve a copiar con `refrescar=True`
o se actualiza a mano con `guardar()`.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime

logger = logging.getLogger("atv_ops.conexiones")

# Lo que se copia de atv-mkt. Lo demás de esa tabla no lo usa ATV Ops.
PLATAFORMAS = ("instagram", "manychat", "youtube", "meta_ads", "google_calendar")

# Qué campos tiene cada plataforma y cuáles son secretos. Es la fuente única: la pantalla
# dibuja el formulario con esto y el guardado rechaza cualquier campo que no esté acá, así
# no se llena la credencial de basura tipeada.
CAMPOS = {
    "meta_ads": [
        {"clave": "access_token", "label": "Access token", "secreto": True,
         "ayuda": "Token del Ads Manager. Vence a los ~60 días."},
        {"clave": "ad_account_id", "label": "Ad account ID", "secreto": False,
         "ayuda": "Con el prefijo act_ si lo lleva."},
    ],
    "instagram": [
        {"clave": "access_token", "label": "Access token", "secreto": True},
        {"clave": "instagram_user_id", "label": "Instagram user ID", "secreto": False},
        {"clave": "webhook_verify_token", "label": "Webhook verify token", "secreto": True},
    ],
    "manychat": [
        {"clave": "api_key", "label": "API key", "secreto": True},
        {"clave": "bio_keyword", "label": "Palabra de la bio", "secreto": False},
        {"clave": "webhook_token", "label": "Webhook token", "secreto": True},
    ],
    "youtube": [
        {"clave": "api_key", "label": "API key", "secreto": True},
        {"clave": "channel_id", "label": "Channel ID", "secreto": False},
    ],
    "google_calendar": [
        {"clave": "calendar_id", "label": "Calendar ID", "secreto": False},
        {"clave": "service_account_json", "label": "Service account (JSON)", "secreto": True,
         "largo": True},
    ],
}

ETIQUETAS = {
    "meta_ads": "Meta Ads Manager",
    "instagram": "Instagram",
    "manychat": "ManyChat",
    "youtube": "YouTube",
    "google_calendar": "Google Calendar",
}

_cache: dict = {}
_lock = threading.Lock()
CACHE_SEGUNDOS = 300


def _de_atv_mkt() -> dict[str, dict]:
    """Ya no se lee nada de atv-mkt. Queda el nombre porque la copia inicial de las
    credenciales ya se hizo y vive en la base de ATV Ops: volver a ir a buscarlas allá
    sería reintroducir la dependencia que se sacó."""
    return {}


def sembrar(refrescar: bool = False, quien: str = "migración", desde_mkt: bool = False) -> list[str]:
    """Copia a ATV Ops las credenciales que todavía no tenga. Devuelve las que copió.

    La copia ya se hizo: las cinco credenciales viven en ATV Ops y se editan desde acá. Por
    eso no vuelve a mirar atv-mkt salvo que se le pida a propósito —`desde_mkt=True`, desde
    un script—; si no, cada credencial que falte reabriría una conexión a ese sistema.
    """
    if not desde_mkt:
        return []
    from pony.orm import db_session

    from src.models import ConexionApi

    copiadas = []
    try:
        origen = _de_atv_mkt()
        if not origen:
            return copiadas
        with db_session:
            for plataforma, cred in origen.items():
                fila = ConexionApi.get(plataforma=plataforma)
                if fila is not None and not refrescar:
                    continue
                if fila is None:
                    ConexionApi(plataforma=plataforma, credenciales=json.dumps(cred),
                                origen="atv-mkt", actualizado_por=quien)
                else:
                    fila.credenciales = json.dumps(cred)
                    fila.origen = "atv-mkt"
                    fila.actualizado_por = quien
                    fila.actualizado_at = datetime.utcnow()
                copiadas.append(plataforma)
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron copiar las credenciales: %s", str(e)[:200])
    if copiadas:
        logger.info("Credenciales copiadas de atv-mkt a ATV Ops: %s", ", ".join(copiadas))
        with _lock:
            _cache.clear()
    return copiadas


def obtener(plataforma: str) -> dict:
    """Las credenciales de una plataforma. La primera vez las copia de atv-mkt."""
    from pony.orm import db_session

    from src.models import ConexionApi

    with _lock:
        guardado = _cache.get(plataforma)
        if guardado and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]
    datos: dict = {}
    try:
        with db_session:
            fila = ConexionApi.get(plataforma=plataforma)
        if fila is None:
            sembrar()
            with db_session:
                fila = ConexionApi.get(plataforma=plataforma)
        if fila is not None:
            datos = json.loads(fila.credenciales or "{}")
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron leer las credenciales de %s: %s", plataforma, str(e)[:160])
    with _lock:
        _cache[plataforma] = {"at": datetime.utcnow(), "data": datos}
    return datos if isinstance(datos, dict) else {}


def editada_aca(plataforma: str) -> bool:
    """Si esa credencial se guardó desde ATV Ops y no es la copia vieja de atv-mkt.

    Importa porque algunos servicios tienen el valor también en el `.env`. La copia
    heredada puede estar vencida —se copió una vez y nadie la tocó más—, así que no puede
    ganarle al `.env`; la que alguien escribió acá a propósito, sí.
    """
    from pony.orm import db_session

    from src.models import ConexionApi

    try:
        with db_session:
            fila = ConexionApi.get(plataforma=plataforma)
            return fila is not None and (fila.origen or "") == "ATV Ops"
    except Exception:  # noqa: BLE001
        return False


def guardar(plataforma: str, credenciales: dict, quien: str = "") -> None:
    """Actualiza una credencial a mano (por ejemplo, un token que venció)."""
    from pony.orm import db_session

    from src.models import ConexionApi

    with db_session:
        fila = ConexionApi.get(plataforma=plataforma)
        if fila is None:
            ConexionApi(plataforma=plataforma, credenciales=json.dumps(credenciales),
                        origen="ATV Ops", actualizado_por=quien[:80])
        else:
            fila.credenciales = json.dumps(credenciales)
            fila.origen = "ATV Ops"
            fila.actualizado_por = quien[:80]
            fila.actualizado_at = datetime.utcnow()
    with _lock:
        _cache.pop(plataforma, None)


def enmascarar(valor) -> str:
    """Nunca el valor entero.

    Los últimos cuatro alcanzan para la única pregunta que se hace mirando la pantalla:
    "¿esta es la que renové o la que venció?". Con "39 caracteres" a secas no se
    distinguen, y con el valor completo la pantalla pasa a ser un lugar de donde copiar
    tokens.
    """
    texto = str(valor)
    if len(texto) <= 8:
        return texto
    return f"…{texto[-4:]} · {len(texto)} caracteres"


def estado() -> list[dict]:
    """Qué credenciales tiene ATV Ops, sin mostrar ningún secreto."""
    from pony.orm import db_session

    from src.models import ConexionApi

    try:
        with db_session:
            return [{
                "plataforma": c.plataforma,
                "origen": c.origen or "",
                "actualizadoAt": c.actualizado_at.isoformat() if c.actualizado_at else None,
                "campos": {k: enmascarar(v) for k, v in json.loads(c.credenciales or "{}").items()
                           if not isinstance(v, (list, dict))},
                # En Python 3.13 el decompilador de Pony se rompe con `select(c for c in …)`:
                # la lista sale de la entidad y se ordena acá.
            } for c in sorted(ConexionApi.select(), key=lambda x: x.plataforma)]
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo leer el estado de las conexiones: %s", str(e)[:160])
        return []


def para_la_vista() -> list[dict]:
    """Las plataformas con sus campos, el valor enmascarado y cuándo se tocó.

    Devuelve todas las de CAMPOS, tenga o no fila en la base: una plataforma sin cargar
    tiene que verse como un formulario vacío, no desaparecer de la pantalla.
    """
    guardado = {c["plataforma"]: c for c in estado()}
    salida = []
    for plataforma, campos in CAMPOS.items():
        fila = guardado.get(plataforma) or {}
        valores = fila.get("campos") or {}
        salida.append({
            "plataforma": plataforma,
            "etiqueta": ETIQUETAS.get(plataforma, plataforma),
            "origen": fila.get("origen") or "",
            "actualizadoAt": fila.get("actualizadoAt"),
            "campos": [{**c, "valor": valores.get(c["clave"], "")} for c in campos],
            "cargada": bool(valores),
        })
    return salida


def actualizar(plataforma: str, cambios: dict, quien: str = "") -> dict:
    """Pisa solo los campos que vinieron con algo.

    Un campo vacío significa "no lo toques", no "borralo": el formulario muestra los
    secretos enmascarados, así que si guardara lo que ve en pantalla los borraría todos.
    Para vaciar uno a propósito se manda la palabra BORRAR.
    """
    if plataforma not in CAMPOS:
        raise ValueError(f"Plataforma desconocida: {plataforma}")
    permitidos = {c["clave"] for c in CAMPOS[plataforma]}
    desconocidos = set(cambios) - permitidos
    if desconocidos:
        raise ValueError(f"Campos que no existen en {plataforma}: {', '.join(sorted(desconocidos))}")

    actuales = dict(obtener(plataforma))
    tocados = []
    for clave, valor in cambios.items():
        texto = str(valor or "").strip()
        if not texto:
            continue
        actuales[clave] = "" if texto == "BORRAR" else texto
        tocados.append(clave)
    if not tocados:
        return {"ok": True, "cambiados": []}

    guardar(plataforma, actuales, quien)
    return {"ok": True, "cambiados": tocados}
