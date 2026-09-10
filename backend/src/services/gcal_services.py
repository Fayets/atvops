"""
Google Calendar de ATV (la cuenta real de Aumenta Tu Valor).

Credenciales: cuenta de servicio, igual que en atv-mkt. Se buscan en este orden:
1. `GOOGLE_SERVICE_ACCOUNT_JSON` (el JSON completo) o `GOOGLE_SERVICE_ACCOUNT_FILE` (ruta),
   más `GOOGLE_CALENDAR_ID`.
2. La conexión que ya cargó atv-mkt (tabla `apiconnection`, plataforma `google_calendar`),
   así el calendario se configura en un solo lugar. atv-mkt vive en otra base de Neon:
   se apunta con `GCAL_CONEXION_DSN`. Si estuviera en la misma, se lee sin DSN.

Solo lectura. Se cachea 5 minutos para no pegarle a Google en cada carga de la vista.
"""

from __future__ import annotations

from contextlib import closing
import html
import json
import logging
import re
import threading
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from decouple import config
from fastapi import HTTPException

from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.gcal")

SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
CACHE_SEGUNDOS = int(config("GCAL_CACHE_SEGUNDOS", default=300))
CONEXION_SCHEMA = config("GCAL_CONEXION_SCHEMA", default="public")
CONEXION_DSN = (config("GCAL_CONEXION_DSN", default="") or "").strip()
_cache: dict = {}
_lock = threading.Lock()


# ------------------------------------------------------------ credenciales

def _desde_env() -> dict | None:
    calendar_id = (config("GOOGLE_CALENDAR_ID", default="") or "").strip()
    crudo = (config("GOOGLE_SERVICE_ACCOUNT_JSON", default="") or "").strip()
    if not crudo:
        ruta = (config("GOOGLE_SERVICE_ACCOUNT_FILE", default="") or "").strip()
        if ruta and Path(ruta).is_file():
            crudo = Path(ruta).read_text(encoding="utf-8")
    if not (calendar_id and crudo):
        return None
    return {"calendar_id": calendar_id, "service_account_json": crudo, "origen": "env"}


def _filas_conexion() -> list:
    """Filas de credentials de la tabla apiconnection de atv-mkt (por DSN o en la misma base)."""
    sql = f"SELECT credentials FROM {CONEXION_SCHEMA}.apiconnection WHERE platform = 'google_calendar'"
    if CONEXION_DSN:
        try:
            import psycopg2
        except ImportError:
            logger.info("Falta psycopg2 para leer la conexión de atv-mkt.")
            return []
        try:
            with closing(psycopg2.connect(CONEXION_DSN, connect_timeout=8)) as cnx, cnx, cnx.cursor() as cur:
                cur.execute(sql)
                return cur.fetchall()
        except Exception as e:  # noqa: BLE001
            logger.info("No se pudo leer la conexión de atv-mkt por DSN: %s", str(e)[:200])
            return []
    from src.db import ES_POSTGRES, db

    if not ES_POSTGRES:
        return []
    try:
        return db.select(sql)
    except Exception as e:  # noqa: BLE001 — sin tabla o sin permisos: se avisa arriba
        logger.info("No se pudo leer la conexión de atv-mkt: %s", str(e)[:200])
        return []


def _desde_conexion_mkt() -> dict | None:
    """Lee la conexión que ya configuró atv-mkt (solo lectura)."""
    for fila in _filas_conexion():
        cred = fila[0] if isinstance(fila, (tuple, list)) else fila
        if isinstance(cred, str):
            try:
                cred = json.loads(cred)
            except ValueError:
                continue
        if not isinstance(cred, dict):
            continue
        calendar_id = str(cred.get("calendar_id") or "").strip()
        sa = cred.get("service_account_json")
        sa = json.dumps(sa) if isinstance(sa, dict) else str(sa or "").strip()
        if calendar_id and sa:
            return {"calendar_id": calendar_id, "service_account_json": sa, "origen": "atv-mkt"}
    return None


def credenciales() -> dict:
    cred = _desde_env() or _desde_conexion_mkt()
    if cred is None:
        raise HTTPException(
            status_code=503,
            detail="No hay calendario configurado. Cargá GOOGLE_CALENDAR_ID y GOOGLE_SERVICE_ACCOUNT_JSON en el .env, "
                   "o GCAL_CONEXION_DSN apuntando a la base de ATV Marketing, que ya tiene la conexión google_calendar.",
        )
    return cred


def configurado() -> bool:
    try:
        credenciales()
        return True
    except HTTPException:
        return False


# ----------------------------------------------------------------- lectura

def _servicio(sa_json: str):
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as e:
        raise HTTPException(status_code=503, detail="Faltan las librerías de Google (google-auth, google-api-python-client).") from e
    try:
        info = json.loads(sa_json)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="El JSON de la cuenta de servicio no es válido.") from e
    if not isinstance(info, dict) or not info.get("client_email") or not info.get("private_key"):
        raise HTTPException(status_code=400, detail="El JSON de la cuenta de servicio no tiene client_email o private_key.")
    creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
    return build("calendar", "v3", credentials=creds, cache_discovery=False), str(info.get("client_email") or "")


def _fecha(bloque: dict | None) -> tuple[datetime | None, bool]:
    """(momento en hora Argentina, es_todo_el_dia)."""
    if not isinstance(bloque, dict):
        return None, False
    crudo = str(bloque.get("dateTime") or bloque.get("date") or "").strip()
    if not crudo:
        return None, False
    try:
        if len(crudo) == 10:
            return datetime.fromisoformat(f"{crudo}T00:00:00").replace(tzinfo=AR_TZ), True
        dt = datetime.fromisoformat(crudo.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(AR_TZ), False
    except ValueError:
        return None, False


_RUIDO_ZOOM = ("zoom web conference", "you can join", "one tap mobile", "you can also dial", "meeting id",
               "join from a video system", "password:", "sip:", "us: +1", "location: this is")


def _limpiar_html(texto: str) -> str:
    texto = re.sub(r"<a [^>]*>(.*?)</a>", r"\1", texto, flags=re.S)
    texto = re.sub(r"<[^>]+>", " ", texto)
    return html.unescape(texto)


def _datos_calendly(descripcion: str | None, ubicacion: str | None) -> dict:
    """Calendly deja en la descripción el tipo de llamada, el Zoom y las respuestas
    del formulario (teléfono, Instagram, facturación, problema). Se extraen para que
    el equipo de ventas las vea sin abrir el evento."""
    datos: dict = {"tipo": None, "telefono": None, "instagram": None, "zoomUrl": None,
                   "facturacion": None, "respuestas": [], "notas": None}
    if ubicacion and ubicacion.startswith("http"):
        datos["zoomUrl"] = ubicacion
    if not descripcion:
        return datos
    texto = _limpiar_html(descripcion)
    m = re.search(r"Event Name\s*\n+\s*(.+)", texto)
    if m:
        datos["tipo"] = m.group(1).strip()[:80] or None
    if not datos["zoomUrl"]:
        m = re.search(r"https://[a-z0-9.]*zoom\.us/j/\S+", texto, re.I)
        if m:
            datos["zoomUrl"] = m.group(0)

    utiles = []
    for linea in texto.splitlines():
        limpia = " ".join(linea.split())
        bajo = limpia.lower()
        if not limpia or bajo == "event name" or limpia == datos["tipo"]:
            continue
        if any(r in bajo for r in _RUIDO_ZOOM) or limpia.startswith("http") or limpia.startswith("+1 "):
            continue
        utiles.append(limpia)

    for segmento in utiles:
        pregunta, sep, respuesta = segmento.rpartition(": ")
        pregunta, respuesta = pregunta.strip(" ?*"), respuesta.strip()
        if not sep or not respuesta:
            continue
        # La pregunta suele traer un ejemplo entre paréntesis: no es la respuesta.
        pregunta = re.sub(r"\s*\((?:ej|ejemplo)[^)]*\)", "", pregunta, flags=re.I).strip(" ?*:")
        bajo = pregunta.lower()
        if re.search(r"\b(tel[eé]fono|phone|celular|whatsapp|wpp)\b", bajo):
            datos["telefono"] = respuesta[:30]
            continue
        if "instagram" in bajo:
            ig = re.search(r"instagram\.com/([A-Za-z0-9_.]{2,40})", respuesta, re.I)
            datos["instagram"] = ig.group(1) if ig else respuesta.lstrip("@")[:40]
            continue
        if "generando" in bajo or "facturas" in bajo or ("usd" in bajo and "cuanto" in bajo):
            datos["facturacion"] = respuesta[:60]
        if len(datos["respuestas"]) < 8:
            datos["respuestas"].append({"pregunta": pregunta[:110], "respuesta": respuesta[:400]})

    if datos["telefono"] is None:
        m = re.search(r"(?:n[uú]mero de tel[eé]fono|tel[eé]fono|phone)\s*:\s*([+0-9][0-9\s().-]{5,25})", texto, re.I)
        if m:
            datos["telefono"] = m.group(1).strip()
    datos["notas"] = (" · ".join(utiles)[:800].strip(" ·") or None)
    return datos


def _invitados(evento: dict, ignorar: set[str]) -> list[dict]:
    salida, vistos = [], set()
    for a in evento.get("attendees") or []:
        if not isinstance(a, dict) or a.get("resource"):
            continue
        email = str(a.get("email") or "").strip()
        nombre = str(a.get("displayName") or "").strip()
        clave = email.casefold() or nombre.casefold()
        if not clave or clave in vistos or clave in ignorar:
            continue
        vistos.add(clave)
        salida.append({
            "nombre": nombre or (email.split("@")[0] if email else "—"),
            "email": email,
            "estado": str(a.get("responseStatus") or "needsAction"),
            "organizador": bool(a.get("organizer")),
            "equipo": bool(a.get("self")),
        })
    return salida


def _normalizar(evento: dict, ignorar: set[str]) -> dict | None:
    inicio, todo_el_dia = _fecha(evento.get("start"))
    if inicio is None:
        return None
    fin, _ = _fecha(evento.get("end"))
    invitados = _invitados(evento, ignorar)
    organizador = evento.get("organizer") if isinstance(evento.get("organizer"), dict) else {}
    conferencia = ""
    if isinstance(evento.get("conferenceData"), dict):
        for punto in evento["conferenceData"].get("entryPoints") or []:
            if isinstance(punto, dict) and punto.get("entryPointType") == "video":
                conferencia = str(punto.get("uri") or "")
                break
    calendly = _datos_calendly(str(evento.get("description") or ""), str(evento.get("location") or ""))
    return {
        "id": str(evento.get("id") or ""),
        "titulo": str(evento.get("summary") or "(sin título)").strip(),
        **calendly,
        "inicioAt": inicio.isoformat(),
        "finAt": fin.isoformat() if fin else None,
        "todoElDia": todo_el_dia,
        "duracionMin": int((fin - inicio).total_seconds() / 60) if fin and not todo_el_dia else None,
        "descripcion": (str(evento.get("description") or "").strip() or None),
        "ubicacion": (str(evento.get("location") or "").strip() or None),
        "organizador": str(organizador.get("displayName") or organizador.get("email") or "").strip() or None,
        "invitados": invitados,
        "confirmados": sum(1 for i in invitados if i["estado"] == "accepted"),
        "rechazados": sum(1 for i in invitados if i["estado"] == "declined"),
        "meetUrl": conferencia or (str(evento.get("hangoutLink") or "").strip() or None),
        "url": str(evento.get("htmlLink") or "").strip() or None,
        "estado": str(evento.get("status") or "confirmed"),
    }


def _traer(cal_id: str, sa_json: str, desde: datetime, hasta: datetime) -> list[dict]:
    from googleapiclient.errors import HttpError

    servicio, sa_email = _servicio(sa_json)
    ignorar = {sa_email.casefold(), cal_id.casefold()} - {""}
    eventos, token = [], None
    try:
        while True:
            data = servicio.events().list(
                calendarId=cal_id, timeMin=desde.isoformat(), timeMax=hasta.isoformat(),
                singleEvents=True, orderBy="startTime", maxResults=250, pageToken=token,
            ).execute()
            for item in data.get("items") or []:
                if not isinstance(item, dict) or str(item.get("status") or "").casefold() == "cancelled":
                    continue
                normalizado = _normalizar(item, ignorar)
                if normalizado:
                    eventos.append(normalizado)
            token = str(data.get("nextPageToken") or "").strip() or None
            if not token:
                break
    except HttpError as e:
        estado = int(getattr(e.resp, "status", 0) or 0)
        if estado in (401, 403):
            raise HTTPException(status_code=502, detail="Google rechazó la cuenta de servicio. Revisá que el calendario esté compartido con su email.") from e
        if estado == 404:
            raise HTTPException(status_code=502, detail="No se encontró el calendario. Revisá el Calendar ID.") from e
        raise HTTPException(status_code=502, detail=f"Error de Google Calendar ({estado}).") from e
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"No se pudo contactar a Google Calendar: {str(e)[:160]}") from e
    return eventos


def agenda(dias: int = 14, dias_atras: int = 1, refrescar: bool = False,
           desde_iso: str | None = None, hasta_iso: str | None = None) -> dict:
    """Eventos del calendario de ATV, agrupados por día, en hora Argentina.

    Por defecto es una ventana alrededor de hoy. Si la vista está mostrando otra semana u
    otro mes, manda `desde_iso`/`hasta_iso` y se trae exactamente ese rango: si no, los
    días que quedan fuera de la ventana se ven vacíos aunque tengan reuniones.
    """
    ahora = datetime.now(AR_TZ)
    if desde_iso and hasta_iso:
        d0, d1 = date.fromisoformat(desde_iso), date.fromisoformat(hasta_iso)
        if d1 < d0:
            d0, d1 = d1, d0
        d1 = min(d1, d0 + timedelta(days=120))
        clave = f"rango|{d0}|{d1}"
    else:
        dias = max(1, min(dias, 60))
        d0 = (ahora - timedelta(days=max(0, dias_atras))).date()
        d1 = (ahora + timedelta(days=dias)).date()
        clave = f"{dias}|{dias_atras}"
    with _lock:
        guardado = _cache.get(clave)
        if guardado and not refrescar and (ahora - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]

    cred = credenciales()
    desde = datetime.combine(d0, time.min, tzinfo=AR_TZ)
    hasta = datetime.combine(d1, time.max, tzinfo=AR_TZ)
    eventos = _traer(cred["calendar_id"], cred["service_account_json"], desde, hasta)

    hoy = ahora.date()
    proximos = [e for e in eventos if datetime.fromisoformat(e["inicioAt"]) >= ahora]
    por_dia: dict[str, list[dict]] = {}
    for e in eventos:
        por_dia.setdefault(e["inicioAt"][:10], []).append(e)
    data = {
        "generadoAt": ahora.isoformat(),
        "calendarId": cred["calendar_id"],
        "origenCredenciales": cred["origen"],
        "desde": desde.date().isoformat(),
        "hasta": hasta.date().isoformat(),
        "total": len(eventos),
        "hoy": [e for e in eventos if e["inicioAt"][:10] == hoy.isoformat()],
        "proximo": proximos[0] if proximos else None,
        "proximos7": len([e for e in proximos if datetime.fromisoformat(e["inicioAt"]).date() <= hoy + timedelta(days=7)]),
        "dias": [{"fecha": f, "eventos": ev} for f, ev in sorted(por_dia.items())],
        "eventos": eventos,
    }
    with _lock:
        _cache[clave] = {"at": ahora, "data": data}
    return data


def estado() -> dict:
    try:
        cred = credenciales()
        return {"configurado": True, "calendarId": cred["calendar_id"], "origenCredenciales": cred["origen"]}
    except HTTPException as e:
        return {"configurado": False, "detalle": str(e.detail)}


# ------------------------------------------- reuniones de venta del calendario

# El título de una reunión de ventas siempre nombra a la empresa: "Fulano and Aumenta
# Tu Valor", "Fulano & Aumenta Tu Valor", "2da reu Fulano and Aumenta Tu Valor".
# Las internas (Weekly, Ventas Lucas & Nick, 1a1, Reu Boost) no la nombran.
_MARCA = re.compile(r"aumenta\s+tu\s+valor", re.I)
_SEGUNDA = re.compile(r"^\s*(2da|2ª|2°|2\.?a|segunda|tercera|3ra)\s*(reuni[oó]n|reu|call|llamada)?\s*[:\-]?\s*", re.I)
_COLA_MARCA = re.compile(r"\s*(?:\band\b|\by\b|&|\bcon\b)?\s*aumenta\s+tu\s+valor\s*$", re.I)
_CABEZA_MARCA = re.compile(r"^\s*aumenta\s+tu\s+valor\s*(?:\band\b|\by\b|&|\bcon\b)?\s*", re.I)


def _prospecto(titulo: str) -> tuple[str, bool]:
    """Saca del título el nombre del prospecto y si es una reunión de seguimiento."""
    limpio = (titulo or "").strip()
    segunda = bool(_SEGUNDA.match(limpio))
    if segunda:
        limpio = _SEGUNDA.sub("", limpio, count=1)
    limpio = _COLA_MARCA.sub("", limpio)
    limpio = _CABEZA_MARCA.sub("", limpio)
    return re.sub(r"\s+", " ", limpio).strip(" -:&"), segunda


# Índice de reuniones por id de evento, para encontrar una sin volver a pedirle a Google
# un rango enorme. Se llena con cada lectura del calendario y dura lo mismo que el caché.
_por_evento: dict[str, dict] = {}


def reunion_por_id(evento_id: str) -> dict | None:
    """La reunión que ya se leyó en alguna consulta reciente del calendario."""
    with _lock:
        guardada = _por_evento.get(evento_id)
    if guardada and (datetime.utcnow() - guardada["at"]).total_seconds() < CACHE_SEGUNDOS:
        return guardada["data"]
    return None


def reuniones_venta(desde: datetime, hasta: datetime, refrescar: bool = False) -> list[dict]:
    """Las reuniones de venta que hay en el calendario entre esas dos fechas.

    Es la única fuente que guarda TODAS las reuniones de un prospecto: el CRM tiene una
    sola fecha por lead, así que una segunda reunión le pisa la primera o no entra.
    Si Google falla, devuelve vacío: las métricas siguen saliendo del CRM.
    """
    clave = f"reuniones:{desde.date()}:{hasta.date()}"
    with _lock:
        guardado = _cache.get(clave)
        if guardado and not refrescar and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]
    try:
        cred = credenciales()
        eventos = _traer(cred["calendar_id"], cred["service_account_json"], desde, hasta)
    except Exception as e:  # noqa: BLE001
        logger.warning("Calendario: no se pudieron leer las reuniones (%s)", str(e)[:120])
        return []

    salida = []
    for e in eventos:
        titulo = e.get("titulo") or ""
        if not _MARCA.search(titulo):
            continue
        nombre, segunda = _prospecto(titulo)
        if not nombre:
            continue
        salida.append({
            "eventoId": e["id"], "titulo": titulo, "prospecto": nombre, "segunda": segunda,
            "inicioAt": e["inicioAt"], "tipo": e.get("tipo") or "", "url": e.get("url"),
            "invitados": [i.get("email", "") for i in (e.get("invitados") or [])],
        })
    ahora = datetime.utcnow()
    with _lock:
        _cache[clave] = {"at": ahora, "data": salida}
        for r in salida:
            _por_evento[r["eventoId"]] = {"at": ahora, "data": r}
    return salida
