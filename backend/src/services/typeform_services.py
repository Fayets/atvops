"""
Typeform — el formulario donde se agenda la llamada.

Es el CTA del webinar: el que lo completa es el que tomó la acción. De acá sale el
escalón "Agendaron" del embudo, que hoy se carga a mano, y la lista de Lucas que más
importa —los que estuvieron en el pitch y NO agendaron—, que es la resta entre los
asistentes y estas respuestas.

**El cruce depende de un hidden field.** Typeform devuelve lo que le pasaron por la URL
en `hidden`. Si el link del CTA se manda como `...?email=juan@mail.com`, cada respuesta
viene con el mail y se puede aparear contra el lead y contra el asistente. Sin eso hay
un número de agendas y ningún nombre, que es exactamente el problema que tuvimos con la
reunión de Zoom.

Como red, si no vino el hidden se busca un email entre las respuestas: mejor encontrarlo
tarde que no encontrarlo.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from decouple import config
from fastapi import HTTPException

API = "https://api.typeform.com"
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def _cred(clave: str, variable: str) -> str:
    """Primero la base (Claves API), después el `.env`. Igual que Meta y Zoom."""
    from src.services import conexiones_services

    try:
        if conexiones_services.editada_aca("typeform"):
            valor = str((conexiones_services.obtener("typeform") or {}).get(clave) or "").strip()
            if valor:
                return valor
    except Exception:  # noqa: BLE001
        pass
    return config(variable, default="").strip()


def _token() -> str:
    t = _cred("access_token", "TYPEFORM_TOKEN")
    if not t:
        raise HTTPException(
            status_code=503,
            detail="Falta el token de Typeform. Va en Sistema → Claves API → Typeform.",
        )
    return t


def _form_id() -> str:
    f = _cred("form_id", "TYPEFORM_FORM_ID")
    if not f:
        raise HTTPException(status_code=503, detail="Falta el ID del formulario de Typeform.")
    return f


def _get(path: str, params: dict | None = None) -> dict:
    url = f"{API}{path}" + (f"?{urlencode(params)}" if params else "")
    req = Request(url, headers={"Authorization": f"Bearer {_token()}", "Accept": "application/json"})
    try:
        with urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        cuerpo = e.read().decode("utf-8", errors="replace")[:240]
        if e.code in (401, 403):
            raise HTTPException(status_code=401, detail=f"Typeform rechazó el token: {cuerpo}") from e
        if e.code == 404:
            raise HTTPException(status_code=404, detail="Typeform no encontró ese formulario.") from e
        raise HTTPException(status_code=502, detail=f"Typeform respondió {e.code}: {cuerpo}") from e
    except URLError as e:
        raise HTTPException(status_code=503, detail="No se pudo hablar con Typeform.") from e


def _momento(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _texto(respuesta: dict) -> str:
    """El valor de una respuesta, sea del tipo que sea."""
    tipo = respuesta.get("type")
    v = respuesta.get(tipo) if tipo else None
    if isinstance(v, dict):
        return str(v.get("label") or v.get("labels") or v.get("value") or "")
    if isinstance(v, list):
        return ", ".join(str(x) for x in v)
    return "" if v is None else str(v)


def _email_de(fila: dict, respuestas: list[dict]) -> str | None:
    """El hidden field primero; si no vino, se busca un mail entre las respuestas."""
    escondido = fila.get("hidden") or {}
    for clave in ("email", "mail", "correo"):
        v = str(escondido.get(clave) or "").strip().lower()
        if v and EMAIL.fullmatch(v):
            return v
    for r in respuestas:
        if r.get("type") == "email":
            v = str(r.get("email") or "").strip().lower()
            if v:
                return v
    for r in respuestas:
        m = EMAIL.search(_texto(r))
        if m:
            return m.group(0).lower()
    return None


_preguntas: dict = {}


def _titulos() -> dict[str, str]:
    """El texto de cada pregunta, por id.

    Las respuestas vienen con el id del campo —`f8b44053-af16-…`— y no con la pregunta.
    Sin esto la pantalla muestra códigos, que es lo mismo que no mostrar nada. Se pide
    la definición del formulario una vez cada diez minutos: no cambia durante un evento.
    """
    guardado = _preguntas.get(_form_id())
    if guardado and (datetime.utcnow() - guardado["at"]).total_seconds() < 600:
        return guardado["titulos"]
    try:
        d = _get(f"/forms/{_form_id()}")
    except HTTPException:
        return guardado["titulos"] if guardado else {}
    titulos = {}
    for campo in d.get("fields") or []:
        titulos[str(campo.get("id"))] = (campo.get("title") or "").strip()
        if campo.get("ref"):
            titulos[str(campo["ref"])] = (campo.get("title") or "").strip()
    _preguntas[_form_id()] = {"at": datetime.utcnow(), "titulos": titulos}
    return titulos


_cache_agendas: dict = {}


def agendas(desde: datetime | None = None) -> list[dict]:
    """Quién agendó, cuándo y qué contestó.

    Una persona puede mandar el formulario dos veces —se equivocó, volvió a entrar—.
    Se junta por email quedándose con la última: contar dos veces a la misma persona
    infla el escalón del embudo justo donde se mide si el pitch funcionó.
    """
    # Tres minutos. La pantalla del webinar lo pide en cada carga y las respuestas no
    # entran de a una por segundo; sin esto, abrir la Fase 2 sale una llamada a Typeform.
    llave = f"{_form_id()}|{desde.isoformat() if desde else ''}"
    guardado = _cache_agendas.get(llave)
    if guardado and (datetime.utcnow() - guardado["at"]).total_seconds() < 180:
        return guardado["filas"]

    params: dict = {"page_size": 1000}
    if desde:
        params["since"] = desde.strftime("%Y-%m-%dT%H:%M:%SZ")
    d = _get(f"/forms/{_form_id()}/responses", params)

    titulos = _titulos()
    por_persona: dict[str, dict] = {}
    for fila in d.get("items") or []:
        respuestas = fila.get("answers") or []
        email = _email_de(fila, respuestas)
        nombre = next(
            (_texto(r) for r in respuestas
             if (r.get("field") or {}).get("type") == "short_text"
             and "mail" not in titulos.get(str((r.get("field") or {}).get("id")), "").lower()
             and _texto(r)),
            "",
        )
        agenda = {
            "id": fila.get("response_id") or fila.get("token"),
            "email": email,
            "nombre": nombre or (email.split("@")[0] if email else "Sin nombre"),
            "agendoAt": fila.get("submitted_at"),
            "conEmail": email is not None,
            "respuestas": [
                {"pregunta": (titulos.get(str((r.get("field") or {}).get("id")))
                              or titulos.get(str((r.get("field") or {}).get("ref")))
                              or "—"),
                 "valor": _texto(r)}
                for r in respuestas
            ],
        }
        llave = email or agenda["id"]
        anterior = por_persona.get(llave)
        if anterior is None or str(agenda["agendoAt"] or "") >= str(anterior["agendoAt"] or ""):
            por_persona[llave] = agenda

    filas = sorted(por_persona.values(), key=lambda a: a["agendoAt"] or "", reverse=True)
    _cache_agendas[llave] = {"at": datetime.utcnow(), "filas": filas}
    return filas


def probar() -> dict:
    """Para el botón Probar de Claves API."""
    if not (_cred("access_token", "TYPEFORM_TOKEN") and _cred("form_id", "TYPEFORM_FORM_ID")):
        return {"ok": None, "detalle": "Faltan el token o el ID del formulario."}
    f = _get(f"/forms/{_form_id()}")
    todas = agendas()
    con = sum(1 for a in todas if a["conEmail"])
    detalle = f"Conectado a “{f.get('title')}”. {len(todas)} respuestas, {con} con email."
    if todas and not con:
        detalle += " Ninguna trae email: falta el hidden field en el link del CTA."
    return {"ok": True, "detalle": detalle}
