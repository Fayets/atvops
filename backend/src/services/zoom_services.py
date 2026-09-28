"""
Zoom Webinars — asistencia real del día del webinar.

Qué contesta: quién se registró, quién entró, cuánto se quedó y cuántos había
conectados en cada momento. Con eso se llenan solas las métricas de la Fase 2 que hoy
se cargan a mano, y salen las listas de seguimiento.

**El plan alcanza con Pro + el add-on de Webinars.** La familia `/report` pide Pro o
superior; la de `/metrics` (el dashboard en vivo) pide Business. No usamos ninguna de
`/metrics`: el pico de concurrentes y los retenidos al pitch se calculan barriendo las
horas de entrada y salida que ya vienen en el reporte de participantes. Es la misma
respuesta y no obliga a subir de plan.

**Por qué inscribimos nosotros a la gente en Zoom.** El reporte solo trae el email del
asistente si entró logueado en Zoom, cosa que no controlamos. Pero si la persona está
registrada, Zoom le da un link propio y la identifica siempre. Entonces el formulario de
la landing sigue siendo el único registro y desde acá se la inscribe con ESE email: es lo
único que garantiza que el cruce contra los leads cierre. Si cada uno se registra por su
cuenta en Zoom, la mitad pone otro mail y las listas de seguimiento no se pueden armar.

Autenticación: app Server-to-Server OAuth (account_id + client_id + client_secret, en
Sistema → Claves API). El token dura una hora y se pide solo; no hay que renovarlo a mano
como el de Meta.
"""

from __future__ import annotations

import base64
import json
import threading
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from decouple import config
from fastapi import HTTPException

API = "https://api.zoom.us/v2"
OAUTH = "https://zoom.us/oauth/token"

_token: dict = {}
_lock = threading.Lock()


def _cred(clave: str, variable: str) -> str:
    """Primero la base (Claves API), después el `.env`. Igual que Meta."""
    from src.services import conexiones_services

    try:
        if conexiones_services.editada_aca("zoom"):
            valor = str((conexiones_services.obtener("zoom") or {}).get(clave) or "").strip()
            if valor:
                return valor
    except Exception:  # noqa: BLE001
        pass
    return config(variable, default="").strip()


def _configurado() -> bool:
    return all(_cred(c, v) for c, v in (
        ("account_id", "ZOOM_ACCOUNT_ID"),
        ("client_id", "ZOOM_CLIENT_ID"),
        ("client_secret", "ZOOM_CLIENT_SECRET"),
    ))


def _access_token() -> str:
    """Token de una hora, cacheado. Se renueva un minuto antes de vencer."""
    with _lock:
        guardado = _token.get("valor")
        if guardado and datetime.utcnow() < _token["hasta"]:
            return guardado

    account = _cred("account_id", "ZOOM_ACCOUNT_ID")
    cid = _cred("client_id", "ZOOM_CLIENT_ID")
    secret = _cred("client_secret", "ZOOM_CLIENT_SECRET")
    if not (account and cid and secret):
        raise HTTPException(
            status_code=503,
            detail="Faltan las claves de Zoom. Van en Sistema → Claves API → Zoom Webinars.",
        )

    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    cuerpo = urlencode({"grant_type": "account_credentials", "account_id": account}).encode()
    req = Request(OAUTH, data=cuerpo, headers={
        "Authorization": f"Basic {basic}",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    try:
        with urlopen(req, timeout=15) as r:
            d = json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        cuerpo = e.read().decode("utf-8", errors="replace")[:240]
        raise HTTPException(status_code=502, detail=f"Zoom rechazó las claves ({e.code}): {cuerpo}") from e
    except URLError as e:
        raise HTTPException(status_code=503, detail="No se pudo hablar con Zoom.") from e

    valor = str(d.get("access_token") or "")
    if not valor:
        raise HTTPException(status_code=502, detail="Zoom no devolvió un token.")
    with _lock:
        _token["valor"] = valor
        _token["hasta"] = datetime.utcnow() + timedelta(seconds=int(d.get("expires_in") or 3600) - 60)
    return valor


def _get(path: str, params: dict | None = None) -> dict:
    url = f"{API}{path}"
    if params:
        url = f"{url}?{urlencode(params)}"
    req = Request(url, headers={
        "Authorization": f"Bearer {_access_token()}",
        "Accept": "application/json",
    })
    try:
        with urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        cuerpo = e.read().decode("utf-8", errors="replace")[:240]
        if e.code == 404:
            raise HTTPException(status_code=404, detail=f"Zoom no encontró eso: {cuerpo}") from e
        raise HTTPException(status_code=502, detail=f"Zoom respondió {e.code}: {cuerpo}") from e
    except URLError as e:
        raise HTTPException(status_code=503, detail="No se pudo hablar con Zoom.") from e


def _paginado(path: str, campo: str, params: dict | None = None) -> list[dict]:
    """Junta todas las páginas. Un webinar de 300 viene en varias y quedarse con la
    primera daría un show rate creíble y equivocado, que es la peor clase de error."""
    filas: list[dict] = []
    token = ""
    for _ in range(50):  # tope duro: 15.000 filas. Antes que un bucle infinito, cortar.
        p = {"page_size": 300, **(params or {})}
        if token:
            p["next_page_token"] = token
        d = _get(path, p)
        filas.extend(d.get(campo) or [])
        token = str(d.get("next_page_token") or "")
        if not token:
            break
    return filas


def _momento(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def pico_concurrentes(tramos: list[tuple[datetime, datetime]]) -> tuple[int, datetime | None]:
    """Cuántos había conectados a la vez, como máximo, y cuándo.

    Barrido de eventos: +1 cuando alguien entra, −1 cuando sale. Ordenar las salidas
    antes que las entradas del mismo instante evita contar de más a quien se va justo
    cuando otro llega.

    Esto es lo que ahorra el salto al plan Business: el pico es un dato del dashboard en
    vivo de Zoom, pero se deduce entero de las horas que ya trae el reporte.
    """
    eventos: list[tuple[datetime, int]] = []
    for entra, sale in tramos:
        eventos.append((entra, 1))
        eventos.append((sale, -1))
    eventos.sort(key=lambda e: (e[0], e[1]))

    vivos = pico = 0
    cuando = None
    for momento, delta in eventos:
        vivos += delta
        if vivos > pico:
            pico, cuando = vivos, momento
    return pico, cuando


def conectados_en(tramos: list[tuple[datetime, datetime]], momento: datetime) -> int:
    """Cuántos estaban adentro en ese instante. Sirve para 'retenidos al pitch'."""
    return sum(1 for entra, sale in tramos if entra <= momento <= sale)


def asistentes(webinar_id: str) -> list[dict]:
    """Quién entró, con su email, cuándo entró, cuándo salió y cuántos minutos estuvo.

    Una persona puede aparecer varias veces —se le cortó internet y volvió a entrar—.
    Se junta por email: una fila por persona, con la primera entrada, la última salida y
    los minutos sumados. Sin esto, 40 asistentes con mala conexión parecen 60.
    """
    crudo = _paginado(f"/report/webinars/{webinar_id}/participants", "participants")

    por_persona: dict[str, dict] = {}
    for p in crudo:
        email = str(p.get("user_email") or p.get("email") or "").strip().lower()
        # Sin email no se puede cruzar contra el lead, pero suma a los conteos: se
        # guarda con una llave propia en vez de tirarlo.
        llave = email or f"anon:{p.get('id') or p.get('participant_uuid') or p.get('name')}"
        entra, sale = _momento(p.get("join_time")), _momento(p.get("leave_time"))
        minutos = round((p.get("duration") or 0) / 60, 1) if p.get("duration") else 0.0

        fila = por_persona.get(llave)
        if fila is None:
            por_persona[llave] = {
                "email": email, "nombre": (p.get("name") or "").strip(),
                "entradas": 1, "entraAt": entra, "saleAt": sale, "minutos": minutos,
                "tramos": [(entra, sale)] if entra and sale else [],
            }
            continue
        fila["entradas"] += 1
        fila["minutos"] = round(fila["minutos"] + minutos, 1)
        if entra and (fila["entraAt"] is None or entra < fila["entraAt"]):
            fila["entraAt"] = entra
        if sale and (fila["saleAt"] is None or sale > fila["saleAt"]):
            fila["saleAt"] = sale
        if entra and sale:
            fila["tramos"].append((entra, sale))

    return list(por_persona.values())


def registrados(webinar_id: str) -> list[dict]:
    """Los inscriptos, hayan entrado o no. `status=approved` no alcanza: quien se
    registró y no fue aprobado igual es un registrado nuestro."""
    filas = []
    for estado in ("approved", "pending", "denied"):
        for r in _paginado(f"/webinars/{webinar_id}/registrants", "registrants", {"status": estado}):
            filas.append({
                "email": str(r.get("email") or "").strip().lower(),
                "nombre": f"{r.get('first_name') or ''} {r.get('last_name') or ''}".strip(),
                "estado": estado,
                "registradoAt": r.get("create_time"),
            })
    return filas


def inscribir(webinar_id: str, email: str, nombre: str = "") -> dict:
    """Mete a alguien en el webinar y devuelve su link personal.

    Se llama cuando se guarda el lead en la landing, con el mismo email del formulario.
    Ese `join_url` es el que hay que mandarle: es lo que hace que Zoom lo reconozca y que
    después el reporte se pueda cruzar contra el lead.
    """
    email = (email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Sin email no se puede inscribir en Zoom.")
    partes = (nombre or "").strip().split(" ", 1)
    cuerpo = json.dumps({
        "email": email,
        "first_name": partes[0] or email.split("@")[0],
        "last_name": partes[1] if len(partes) > 1 else "",
    }).encode()
    req = Request(f"{API}/webinars/{webinar_id}/registrants", data=cuerpo, headers={
        "Authorization": f"Bearer {_access_token()}",
        "Content-Type": "application/json",
    })
    try:
        with urlopen(req, timeout=20) as r:
            d = json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        detalle = e.read().decode("utf-8", errors="replace")[:240]
        raise HTTPException(status_code=502, detail=f"Zoom no aceptó la inscripción ({e.code}): {detalle}") from e
    except URLError as e:
        raise HTTPException(status_code=503, detail="No se pudo hablar con Zoom.") from e
    return {"email": email, "joinUrl": d.get("join_url"), "registrantId": d.get("registrant_id")}


def arranque_real(webinar_id: str) -> datetime | None:
    """Cuándo arrancó la sesión de verdad, según Zoom.

    No sirve el primer ingreso: el anfitrión entra antes a acomodar cámara y slides, y
    entonces "el minuto 45 del pitch" caería media hora antes de donde va. Tampoco sirve
    la hora agendada, porque los webinars arrancan tarde. Esto es el arranque medido.

    Si el scope de este reporte no está, devuelve None y el que llama decide.
    """
    try:
        return _momento(_get(f"/report/webinars/{webinar_id}").get("start_time"))
    except HTTPException:
        return None


def resumen_del_dia(webinar_id: str, minuto_pitch: int | None = None) -> dict:
    """Las métricas de la Fase 2, calculadas del reporte real.

    `minuto_pitch` es a los cuántos minutos del arranque empieza el pitch. Es un dato del
    guion, no de Zoom, así que lo pone quien carga el webinar. Sin él, "retenidos" se
    informa en null en vez de inventar un momento: una retención calculada contra un
    minuto arbitrario se ve igual de convincente y no significa nada.
    """
    gente = asistentes(webinar_id)
    tramos = [t for f in gente for t in f["tramos"]]
    pico, pico_at = pico_concurrentes(tramos)

    primer_ingreso = min((f["entraAt"] for f in gente if f["entraAt"]), default=None)
    arranque = arranque_real(webinar_id) or primer_ingreso
    # Cuando hay que caer al primer ingreso, se dice: el número sigue siendo útil pero
    # la retención puede estar corrida por lo que el anfitrión entró antes.
    arranque_estimado = arranque is not None and arranque == primer_ingreso

    retenidos = None
    pitch_at = None
    if arranque and minuto_pitch is not None:
        pitch_at = arranque + timedelta(minutes=int(minuto_pitch))
        retenidos = conectados_en(tramos, pitch_at)

    return {
        "webinarId": str(webinar_id),
        "vivos": len(gente),
        "picoConcurrentes": pico,
        "picoAt": pico_at.isoformat() if pico_at else None,
        "retenidosPitch": retenidos,
        "pitchAt": pitch_at.isoformat() if pitch_at else None,
        "arranqueAt": arranque.isoformat() if arranque else None,
        "arranqueEstimado": arranque_estimado,
        "minutosPromedio": round(sum(f["minutos"] for f in gente) / len(gente), 1) if gente else 0.0,
        "conEmail": sum(1 for f in gente if f["email"]),
        "sinEmail": sum(1 for f in gente if not f["email"]),
    }


def listar_webinars(tipo: str = "past") -> list[dict]:
    """Los webinars de la cuenta, para elegir de una lista en vez de copiar el ID.

    `tipo`: "past" los que ya pasaron —que son los que tienen reporte— o "upcoming".
    """
    filas = _paginado("/users/me/webinars", "webinars", {"type": tipo})
    return [
        {
            "id": str(w.get("id") or ""),
            "tema": (w.get("topic") or "").strip(),
            "inicioAt": w.get("start_time"),
            "duracionMin": w.get("duration"),
        }
        for w in filas
    ]


def probar() -> dict:
    """Para el botón Probar de Claves API.

    Lista webinars en vez de leer el usuario: prueba exactamente el permiso que el
    sistema usa, y evita pedir un scope de lectura de usuarios que no necesitamos para
    nada. Una prueba que pasa con permisos que la función real no tiene no sirve.
    """
    if not _configurado():
        return {"ok": None, "detalle": "Faltan las claves de Zoom."}
    pasados = listar_webinars("past")
    if not pasados:
        return {"ok": True, "detalle": "Conectado. Todavía no hay webinars pasados en la cuenta."}
    ultimo = pasados[0]
    return {"ok": True, "detalle": f"Conectado. {len(pasados)} webinar(s) pasados; el último: “{ultimo['tema']}”."}
