"""Cargar la semana desde el documento que cada uno arma el domingo.

Mucha gente ya escribe su daily afuera —un Google Doc, muchas veces hecho con Claude— y
después la copiaba día por día en Ops. Acá se pega el link (o el texto) y sale la lista de
tareas repartidas por día para revisarla y cargarla de una.

Lo que se lee del documento son **datos**: qué día es cada título y qué dice cada viñeta.
El reparto lo hace el código; Claude entra solo cuando el documento no tiene títulos por
día, y aun así lo que devuelve se valida acá antes de proponerlo.
"""

from __future__ import annotations

import logging
import re
import unicodedata

import requests
from fastapi import HTTPException

logger = logging.getLogger(__name__)

TIMEOUT_S = 20
MAX_TAREAS = 80
MAX_LARGO = 300
MAX_TEXTO = 120_000

DIAS = ("lunes", "martes", "miercoles", "jueves", "viernes")
# Sábado y domingo se leen para poder descartarlos: la daily corre de lunes a viernes.
FINDE = ("sabado", "domingo")
VELOCIDAD, DESPLAZAMIENTO = "velocidad", "desplazamiento"

# Títulos que no son tareas ni días: lo que cuelga de ellos queda abierto en la semana.
_NO_ES_TAREA = re.compile(
    r"^(objetivos?|metas?|notas?|resumen|semana|plan|contexto|prioridades?|recordatorios?)\b")


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", (t or "").strip()).encode("ascii", "ignore").decode().lower()
    return " ".join(t.split())


def _id_del_documento(url: str) -> str | None:
    m = re.search(r"/document/d/([a-zA-Z0-9_-]{10,})", url or "")
    return m.group(1) if m else None


def texto_del_documento(url: str) -> str:
    """Baja un Google Doc como texto plano.

    Usa el export público de Google: no hace falta que Ops tenga permiso sobre el Drive de
    cada uno, pero sí que el documento esté compartido como "cualquiera con el enlace".
    Cuando no lo está, Google devuelve una página de login —HTML— en vez del texto, y eso
    se reconoce acá para poder decirlo en castellano en lugar de cargar basura.
    """
    doc = _id_del_documento(url)
    if not doc:
        raise HTTPException(status_code=400, detail="Ese link no es un Google Doc. Copiá el de la barra del navegador.")
    export = f"https://docs.google.com/document/d/{doc}/export?format=txt"
    try:
        r = requests.get(export, timeout=TIMEOUT_S, allow_redirects=True)
    except requests.RequestException as e:
        logger.warning("No se pudo leer el documento %s: %s", doc, str(e)[:200])
        raise HTTPException(status_code=502, detail="No se pudo abrir el documento. Probá de nuevo.")
    tipo = (r.headers.get("content-type") or "").lower()
    if r.status_code != 200 or "text/plain" not in tipo:
        raise HTTPException(
            status_code=400,
            detail=("El documento es privado. Abrilo en Google Docs, tocá Compartir y poné "
                    "\"Cualquier persona con el enlace\". O pegá el texto acá abajo."))
    return r.text[:MAX_TEXTO]


def _limpiar(linea: str) -> str:
    """Saca viñetas, casillas y negritas de markdown; deja el texto de la tarea."""
    t = linea.strip()
    t = re.sub(r"^[-*•·–—▢□☐✓✔○●]+\s*", "", t)
    t = re.sub(r"^\d+[.)]\s*", "", t)
    t = re.sub(r"^\[[ xX]?\]\s*", "", t)
    t = re.sub(r"^#{1,6}\s*", "", t)
    t = t.replace("**", "").replace("__", "")
    t = re.sub(r"\s+", " ", t).strip()
    return t.strip(" :;-–—")


def _dia_del_titulo(linea: str) -> int | None | str:
    """0-4 si el renglón es un título de día, 'finde' si es sábado o domingo, None si no."""
    t = _norm(_limpiar(linea))
    if not t or len(t) > 60:
        return None
    for i, d in enumerate(DIAS):
        if re.match(rf"^{d}\b", t):
            return i
    for d in FINDE:
        if re.match(rf"^{d}\b", t):
            return "finde"
    return None


def _tipo_del_titulo(linea: str) -> str | None:
    t = _norm(_limpiar(linea))
    if not t or len(t) > 60:
        return None
    if t.startswith(DESPLAZAMIENTO):
        return DESPLAZAMIENTO
    if t.startswith(VELOCIDAD):
        return VELOCIDAD
    return None


def _es_item(linea: str) -> bool:
    return bool(re.match(r"^\s*([-*•·–—▢□☐✓✔]|\d+[.)]|\[[ xX]?\])\s+", linea))


def _tipo_de_la_linea(texto: str, por_defecto: str | None) -> tuple[str, str]:
    """Saca un '(desplazamiento)' escrito en la propia tarea y devuelve (tipo, texto)."""
    m = re.search(r"[\[(]?\s*(velocidad|desplazamiento)\s*[\])]?\s*$", texto, re.IGNORECASE)
    if m:
        return m.group(1).lower(), texto[:m.start()].strip(" :;-–—")
    primero = re.match(r"^\s*(velocidad|desplazamiento)\s*[:\-–]\s*", texto, re.IGNORECASE)
    if primero:
        return primero.group(1).lower(), texto[primero.end():].strip()
    return por_defecto or VELOCIDAD, texto


def leer(texto: str) -> list[dict]:
    """Las tareas del documento, cada una con su día (o None si está suelta en la semana)."""
    dia_actual: int | None = None
    # Un título "Sábado" corta: lo que viene después no entra a la daily.
    en_finde = False
    tipo_seccion: str | None = None
    tareas: list[dict] = []
    for cruda in (texto or "").splitlines():
        if not cruda.strip():
            continue
        marca = _dia_del_titulo(cruda)
        if marca is not None:
            en_finde = marca == "finde"
            dia_actual = None if en_finde else marca
            tipo_seccion = None
            continue
        if en_finde:
            continue
        t = _tipo_del_titulo(cruda)
        if t:
            tipo_seccion = t
            continue
        limpio = _limpiar(cruda)
        if not limpio or len(limpio) < 3:
            continue
        if _NO_ES_TAREA.match(_norm(limpio)) and not _es_item(cruda):
            # Un título como "Objetivos de la semana": lo que cuelga queda abierto.
            dia_actual = None
            tipo_seccion = None
            continue
        if dia_actual is None and not _es_item(cruda):
            # Antes del primer día, solo las viñetas son tareas: el resto es prosa.
            continue
        tipo, limpio = _tipo_de_la_linea(limpio, tipo_seccion)
        tareas.append({"dia": dia_actual, "tipo": tipo, "texto": limpio[:MAX_LARGO]})
        if len(tareas) >= MAX_TAREAS:
            break
    return tareas


# ------------------------------------------------------------------ con Claude

SYSTEM = """Extraés tareas de un plan semanal de trabajo. Devolvés SOLO un objeto JSON:
{"tareas": [{"dia": 0, "tipo": "velocidad", "texto": "..."}]}

Reglas:
- "dia": 0 lunes, 1 martes, 2 miércoles, 3 jueves, 4 viernes. null si la tarea no está
  puesta en un día. Lo de sábado y domingo no se incluye.
- "tipo": "desplazamiento" solo si el documento lo dice con esa palabra; si no, "velocidad".
- "texto": la tarea tal como está escrita, sin viñetas ni numeración. Una tarea por item.
- No inventes tareas, no resumas varias en una y no agregues ninguna que no esté.
- Si no hay tareas, devolvés {"tareas": []}."""


def leer_con_claude(texto: str) -> list[dict]:
    """Para los documentos sin títulos por día. Lo que vuelve se valida igual que lo demás."""
    from src.services.activacion_ia_services import _extraer_json, cli_o_api_disponible, invocar_claude_texto

    if not cli_o_api_disponible():
        return []
    try:
        respuesta, _meta = invocar_claude_texto(SYSTEM, texto[:40_000], max_tokens=4000)
        data = _extraer_json(respuesta)
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo leer el documento con Claude: %s", str(e)[:200])
        return []
    return validar(data.get("tareas") or [])


def validar(crudas: list) -> list[dict]:
    """Deja solo lo que la daily puede guardar: día 0-4 o None, tipo conocido, texto real."""
    limpias = []
    vistos = set()
    for t in crudas:
        if not isinstance(t, dict):
            continue
        texto = _limpiar(str(t.get("texto") or ""))[:MAX_LARGO]
        if len(texto) < 3:
            continue
        dia = t.get("dia")
        dia = dia if isinstance(dia, int) and dia in range(5) else None
        tipo = t.get("tipo") if t.get("tipo") in (VELOCIDAD, DESPLAZAMIENTO) else VELOCIDAD
        clave = (dia, _norm(texto))
        if clave in vistos:
            continue
        vistos.add(clave)
        limpias.append({"dia": dia, "tipo": tipo, "texto": texto})
        if len(limpias) >= MAX_TAREAS:
            break
    return limpias


def proponer(url: str | None, texto: str | None) -> dict:
    """Lo que se va a cargar, para revisarlo antes. No escribe nada."""
    crudo = (texto or "").strip()
    if not crudo:
        if not (url or "").strip():
            raise HTTPException(status_code=400, detail="Pegá el link del documento o su texto.")
        crudo = texto_del_documento(url.strip())
    crudo = crudo[:MAX_TEXTO]

    tareas = validar(leer(crudo))
    con_dia = [t for t in tareas if t["dia"] is not None]
    fuente = "documento"
    # Sin ningún título de día el reparto no se puede hacer leyendo: ahí entra Claude.
    if not con_dia:
        de_claude = leer_con_claude(crudo)
        if de_claude:
            tareas, fuente = de_claude, "claude"
    if not tareas:
        raise HTTPException(
            status_code=400,
            detail="No encontré tareas en el documento. Fijate que tenga los días (Lunes, Martes…) y una viñeta por tarea.")
    return {"tareas": tareas, "fuente": fuente}
