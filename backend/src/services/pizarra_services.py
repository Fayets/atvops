"""
Pizarra de contenido de marketing: el Miro de Juan.

Marketing carga una llamada de Juan (1 a 1 o clase grupal) cuando necesita ideas. Con lo
fijo de la marca (dolores, diferenciales, objeciones, narrativa) Claude propone UNA idea
general que sale del video; se edita si no gusta y se aprueba. Recién aprobada salen las
variantes por canal (YouTube, Reels, Stories). Las variantes aprobadas forman el vault de
ideas. De una variante de historias aprobada salen las tres secuencias: corta, media y larga.

Qué decide la IA y qué decide el código:
- La IA propone la idea general con una cita textual de Juan.
- El código la descarta si la cita no está tal cual en la transcripción o la dijo otro. El
  minuto también lo saca el código, nunca la IA.
- Canal, largo de secuencia y estados salen de listas fijas.
"""

from __future__ import annotations

import html as _html
import json
import logging
import re
import threading
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import PizarraContexto, PizarraGeneral, PizarraHistoriaDia, PizarraLlamada, PizarraSecuencia, PizarraVariante
from src.services import activacion_ia_services as ia
from src.services import correcciones_services as correcciones
from src.services import dibujos_services as dibujos
from src.services import estructuras_services as estructuras
from src.services import fondos_services as fondos
from src.services import voz_juan_services as voz_juan

logger = logging.getLogger("atv_ops.pizarra")

MODELO = config("PIZARRA_MODEL", default="claude-sonnet-5-5")
TIMEOUT_S = int(config("PIZARRA_TIMEOUT", default="420"))
# De quién son las citas: si en la transcripción aparece alguien con este nombre, la cita
# tiene que ser suya.
VOCERO = "Juan"
# Cómo puede figurar Juan en una transcripción: en las clases por la cuenta de Zoom de ATV
# aparece como "Aumenta Tu Valor (aumentatuvalorx@gmail.com)".
VOCEROS = [v.strip().lower() for v in config("PIZARRA_VOCERO", default="Juan,Aumenta Tu Valor").split(",") if v.strip()]
MAX_CHARS = 160_000

TIPOS_LLAMADA = ("1a1", "clase")
CANALES = ("yt", "reel", "story")
VARIANTES_POR_CANAL = 3
LARGOS = ("corta", "media", "larga")
CONTEXTO = ("dolores", "objeciones", "diferenciales", "narrativa")
ESTADOS = ("propuesta", "aprobada", "descartada")

_en_curso: set[str] = set()   # "general:<llamada>" | "variantes:<general>" | "secuencias:<variante>"
_lock = threading.Lock()


# ------------------------------------------------------------------ transcripción

_TS = re.compile(r"^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*")
# "Juan Cruz Carrizo:" o, en las clases por Zoom, "Aumenta Tu Valor (aumentatuvalorx@gmail.com):".
_QUIEN = re.compile(r"^([A-ZÁÉÍÓÚÑa-záéíóúñ][\w .'áéíóúñÁÉÍÓÚÑ-]{0,58}?(?:\s*\([^()]{1,80}\))?):\s+")


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


def _minuto(ts: str) -> str:
    """"00:14:11" → "14:11"; "1:02:05" queda igual."""
    partes = ts.split(":")
    if len(partes) == 3 and partes[0] in ("0", "00"):
        return f"{int(partes[1])}:{partes[2]}"
    return ts


def segmentos(texto: str) -> list[dict]:
    """La transcripción en tramos {ts, quien, texto}. Acepta el formato de Fathom
    ("[00:14:11] Juan Cruz Carrizo: …"), el de copiar transcripción ("0:00 - Juan" y el
    texto abajo) y texto pegado sin marcas."""
    segs, ts, quien = [], None, None
    texto = texto or ""
    if "--- TRANSCRIPT ---" in texto:
        texto = texto.split("--- TRANSCRIPT ---", 1)[1]  # lo de arriba es la cabecera de la exportación
    for linea in texto.splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("---"):
            continue
        m = _TS.match(linea)
        if m:
            ts = _minuto(m.group(1))
            linea = linea[m.end():]
            if linea and not _QUIEN.match(linea) and len(linea) <= 60 and ":" not in linea:
                quien = linea  # "0:00 - Juan Cruz Carrizo" con el texto en la línea siguiente
                continue
        q = _QUIEN.match(linea)
        if q:
            quien, linea = q.group(1).strip(), linea[q.end():]
        if linea:
            segs.append({"ts": ts, "quien": quien, "texto": linea})
    return segs


def _palabras(segs: list[dict]) -> list[tuple[str, int, int, str]]:
    """Cada palabra de la transcripción: (normalizada, tramo, n.º de palabra, como está escrita)."""
    salida, j = [], 0
    for k, s in enumerate(segs):
        for palabra in s["texto"].split():
            for n in _norm(palabra).split():
                salida.append((n, k, j, palabra))
            j += 1
    return salida


def _literal(palabras: list[tuple[str, int, int, str]]) -> str:
    """El texto tal como está en la transcripción, sin repetir la palabra original cuando
    se partió en dos al normalizarla ("1.000" → "1 000")."""
    out, previo = [], None
    for _n, _k, j, original in palabras:
        if j != previo:
            out.append(original)
        previo = j
    return " ".join(out)


def ubicar_cita(cita: str, segs: list[dict]) -> dict | None:
    """Dónde está la cita en la transcripción: {ts, quien, texto}, o None si no está.
    Se compara sin tildes, mayúsculas ni puntuación; una cita puede cruzar dos tramos
    seguidos de la misma persona. Si no está tal cual, vale el tramo casi idéntico (Claude
    suele sacar una muletilla o un "eh") y la cita que queda es la de la transcripción."""
    buscada = _norm(cita).split()
    if len(" ".join(buscada)) < 12:
        return None
    palabras = _palabras(segs)
    tokens = [w[0] for w in palabras]
    n = len(buscada)
    tramo = None
    for i in range(len(tokens) - n + 1):
        if tokens[i:i + n] == buscada:
            tramo = (i, i + n)
            break
    if tramo is None:
        tramo = _casi_igual(buscada, tokens)
    if tramo is None:
        return None
    elegidas = palabras[tramo[0]:tramo[1]]
    if len({segs[k]["quien"] for _n, k, _j, _o in elegidas}) > 1:
        return None  # pegó frases de dos personas
    primero = segs[elegidas[0][1]]
    return {"ts": primero["ts"], "quien": primero["quien"], "texto": _literal(elegidas)}


PARECIDO_MIN = 0.85


def _casi_igual(buscada: list[str], tokens: list[str]) -> tuple[int, int] | None:
    """El tramo de la transcripción que más se parece a la cita, si se parece lo suficiente."""
    from collections import Counter
    from difflib import SequenceMatcher

    n = len(buscada)
    if n < 4 or len(tokens) < n - 2:
        return None
    meta = Counter(buscada)
    mejor, donde = 0.0, None
    for i in range(0, max(1, len(tokens) - n + 3)):
        ventana = tokens[i:i + n]
        if sum((Counter(ventana) & meta).values()) < n * PARECIDO_MIN:
            continue  # filtro rápido: ni comparten las palabras
        for largo in range(max(1, n - 3), n + 4):
            cand = tokens[i:i + largo]
            r = SequenceMatcher(None, cand, buscada, autojunk=False).ratio()
            if r > mejor:
                mejor, donde = r, (i, i + len(cand))
    return donde if mejor >= PARECIDO_MIN else None


def _es_juan(quien: str | None) -> bool:
    return bool(quien) and any(v in quien.lower() for v in VOCEROS)


def es_del_vocero(quien: str | None, segs: list[dict]) -> bool:
    if not any(s["quien"] for s in segs):
        return True  # transcripción sin nombres: no hay cómo saberlo
    return _es_juan(quien)  # con nombres, solo cuenta lo que dijo Juan


def quienes_hablan(segs: list[dict]) -> list[str]:
    vistos: dict[str, int] = {}
    for s in segs:
        if s["quien"]:
            vistos[s["quien"]] = vistos.get(s["quien"], 0) + 1
    return [q for q, _ in sorted(vistos.items(), key=lambda kv: -kv[1])]


# ------------------------------------------------------------------ contexto

def contexto() -> dict:
    with db_session:
        filas = {c.clave: c for c in PizarraContexto.select()}
        return {k: {"texto": (filas[k].texto or "") if k in filas else "",
                    "editadoPor": filas[k].editado_por if k in filas else None,
                    "editadoAt": filas[k].editado_at.isoformat() if k in filas and filas[k].editado_at else None}
                for k in CONTEXTO}


def guardar_contexto(clave: str, texto: str, por: str | None) -> dict:
    if clave not in CONTEXTO:
        raise HTTPException(status_code=404, detail="Ese bloque de contexto no existe.")
    with db_session:
        fila = PizarraContexto.get(clave=clave) or PizarraContexto(clave=clave)
        fila.texto = (texto or "").strip()[:20_000]
        fila.editado_por, fila.editado_at = por, datetime.utcnow()
    return contexto()


def _cabecera(texto: str) -> dict:
    """Las transcripciones exportadas de Fathom traen Meeting:, Date: y URL: arriba."""
    datos = {}
    for linea in texto.splitlines()[:15]:
        m = re.match(r"^(Meeting|Date|URL):\s*(.+)$", linea.strip())
        if m:
            datos[m.group(1)] = m.group(2).strip()
    fecha = None
    if datos.get("Date"):
        try:
            fecha = date.fromisoformat(datos["Date"][:10])
        except ValueError:
            pass
    return {"titulo": datos.get("Meeting"), "fecha": fecha, "url": datos.get("URL")}


def crear(texto: str, titulo: str | None, por: str | None, fuente: str = "pegada",
          url: str | None = None, fecha: date | None = None, tipo: str = "1a1") -> dict:
    texto = (texto or "").replace("\r\n", "\n").strip()
    if texto.startswith("WEBVTT"):
        texto = vtt_a_texto(texto)
    if len(texto) < 200:
        raise HTTPException(status_code=422, detail="La transcripción está vacía o es muy corta.")
    cab = _cabecera(texto)
    with db_session:
        if cab["url"] or url:
            previa = PizarraLlamada.get(url=url or cab["url"])
            if previa is not None:
                return _dict_llamada(previa)
        ll = PizarraLlamada(
            titulo=(titulo or cab["titulo"] or "Llamada sin título").strip()[:200],
            fecha=fecha or cab["fecha"], fuente=fuente, url=url or cab["url"],
            transcripcion=texto, creado_por=por, tipo=tipo if tipo in TIPOS_LLAMADA else "1a1",
        )
        flush()
        return _dict_llamada(ll)


def crear_desde_archivo(nombre: str, crudo: bytes, por: str | None, tipo: str = "1a1") -> dict:
    try:
        texto = crudo.decode("utf-8")
    except UnicodeDecodeError:
        texto = crudo.decode("latin-1")
    titulo = re.sub(r"^\d+[.\s]*", "", re.sub(r"\.(txt|vtt)$", "", nombre or "", flags=re.I)).replace("_", " ").strip()
    return crear(texto, _cabecera(texto)["titulo"] or titulo or None, por, fuente="archivo", tipo=tipo)


# ------------------------------------------------------------------ Zoom

_CUE = re.compile(r"^(\d{1,2}):(\d{2}):(\d{2})(?:[.,]\d+)?\s*-->")


def vtt_a_texto(vtt: str) -> str:
    """La transcripción de Zoom (.vtt) en el formato de siempre: "[00:14:11] Juan: …".
    Así la cita se valida y el minuto sale igual que con Fathom."""
    lineas, ts = [], None
    for linea in (vtt or "").splitlines():
        linea = linea.strip()
        m = _CUE.match(linea)
        if m:
            ts = f"{int(m.group(1)):02d}:{m.group(2)}:{m.group(3)}"
            continue
        if not linea or linea == "WEBVTT" or linea.isdigit() or linea.startswith("NOTE"):
            continue
        lineas.append(f"[{ts}] {linea}" if ts else linea)
    return "\n".join(lineas)


def _inicio_zoom(link: str) -> datetime | None:
    """El link de una grabación compartida trae la hora de inicio en `startTime` (ms), a
    veces dentro de la URL de origen codificada."""
    m = re.search(r"startTime(?:=|%3D)(\d{13})", link or "")
    return datetime.utcfromtimestamp(int(m.group(1)) / 1000) if m else None


def _momento_zoom(iso: str | None) -> datetime | None:
    try:
        return datetime.strptime(str(iso), "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return None


def elegir_grabacion(reuniones: list[dict], inicio: datetime) -> dict | None:
    """La reunión cuya grabación arrancó a esa hora (con 5 minutos de margen)."""
    mejor, distancia = None, None
    for r in reuniones:
        horas = [_momento_zoom(f.get("recording_start")) for f in r.get("recording_files") or []] + [_momento_zoom(r.get("start_time"))]
        for h in filter(None, horas):
            d = abs((h - inicio).total_seconds())
            if d <= 300 and (distancia is None or d < distancia):
                mejor, distancia = r, d
    return mejor


def crear_desde_zoom(link: str, por: str | None, tipo: str = "1a1") -> dict:
    """Un link de grabación de Zoom no trae la transcripción ni el id de la reunión, pero sí
    la hora de inicio. Con la app de Zoom de Ops se buscan las grabaciones de ese día, se
    elige la que arrancó a esa hora y se baja su transcripción."""
    from src.services import zoom_services as zoom

    if "zoom.us/" not in (link or ""):
        raise HTTPException(status_code=422, detail="Ese link no es de Zoom.")
    inicio = _inicio_zoom(link)
    if inicio is None:
        raise HTTPException(status_code=422, detail="El link no trae la hora de la grabación (startTime). Copiá el link completo desde la grabación en Zoom, o subí la transcripción .vtt.")
    dia = inicio.date()
    params = {"from": (dia - timedelta(days=1)).isoformat(), "to": (dia + timedelta(days=1)).isoformat(), "page_size": 300}
    reuniones, permiso = [], None
    for path in ("/users/me/recordings", "/accounts/me/recordings"):
        try:
            reuniones += zoom._get(path, params).get("meetings") or []
        except HTTPException as e:
            permiso = e.detail
    r = elegir_grabacion(reuniones, inicio)
    if r is None:
        if permiso and not reuniones:
            raise HTTPException(status_code=502, detail=f"La app de Zoom de Ops no pudo leer las grabaciones ({permiso}). Hay que sumarle el permiso de grabaciones (cloud_recording:read) en marketplace.zoom.us, o subí la transcripción .vtt.")
        raise HTTPException(status_code=404, detail="No encontré en Zoom una grabación que haya arrancado a esa hora. Subí la transcripción .vtt de esa grabación.")
    archivo = next((f for f in r.get("recording_files") or [] if f.get("file_type") in ("TRANSCRIPT", "CC")), None)
    if archivo is None or not archivo.get("download_url"):
        raise HTTPException(status_code=422, detail="Esa grabación no tiene transcripción. En Zoom: Configuración → Grabación → activar la transcripción de audio (sirve para las próximas). Para esta, pegá el texto o subí un .vtt.")
    pedido = urllib.request.Request(archivo["download_url"], headers={"Authorization": f"Bearer {zoom._access_token()}"})
    try:
        with urllib.request.urlopen(pedido, timeout=60) as resp:
            vtt = resp.read().decode("utf-8", "replace")
    except OSError as e:
        raise HTTPException(status_code=502, detail=f"No se pudo bajar la transcripción de Zoom: {str(e)[:160]}") from e
    url = "https://zoom.us/recording/" + str(r.get("uuid") or r.get("id"))
    return crear(vtt_a_texto(vtt), r.get("topic"), por, fuente="zoom", url=url, fecha=inicio.date(), tipo=tipo)


def _token_fathom(link: str) -> str | None:
    m = re.search(r"fathom\.video/share/([A-Za-z0-9_-]{8,80})", link or "")
    return m.group(1) if m else None


def _http(url: str, acepta: str) -> tuple[int, str]:
    pedido = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": acepta})
    with urllib.request.urlopen(pedido, timeout=30) as r:
        return r.status, r.read().decode("utf-8", "replace")


def crear_desde_fathom(link: str, por: str | None, http=_http, tipo: str = "1a1") -> dict:
    """Un link de compartir de Fathom se ve sin cuenta: la página trae los datos de la
    llamada y la dirección para copiar la transcripción con ese mismo token. Las
    direcciones se arman acá con el token, nunca se pide la que mandó el usuario."""
    token = _token_fathom(link)
    if not token:
        raise HTTPException(status_code=422, detail="Pegá el link de compartir de Fathom (Share → Copy link): fathom.video/share/…")
    pagina = f"https://fathom.video/share/{token}"
    try:
        estado, cuerpo = http(pagina, "text/html")
        m = re.search(r'data-page="([^"]+)"', cuerpo) if estado == 200 else None
        props = json.loads(_html.unescape(m.group(1))).get("props") or {} if m else {}
        call, copiar = props.get("call") or {}, props.get("copyTranscriptUrl") or ""
        if not call.get("id") or not copiar.startswith("https://fathom.video/"):
            raise ValueError("sin datos")
        estado, cuerpo = http(copiar, "application/json")
        texto = (json.loads(cuerpo).get("plain_text") or "").strip() if estado == 200 else ""
    except (OSError, ValueError):
        texto, call = "", {}
    if not texto:
        raise HTTPException(status_code=422, detail="No pudimos leer ese link de Fathom. Pegá la transcripción a mano.")
    fecha = None
    if call.get("started_at"):
        try:
            fecha = date.fromisoformat(str(call["started_at"])[:10])
        except ValueError:
            pass
    nueva = crear(texto, call.get("title"), por, fuente="fathom", url=pagina, fecha=fecha, tipo=tipo)
    dibujos.buscar(nueva["id"])  # lo que Juan dibujó en la pizarra, sacado del video
    return detalle(nueva["id"])


# ------------------------------------------------------------------ cómo se devuelve

def _duracion(ll: PizarraLlamada) -> int | None:
    marcas = re.findall(r"^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?", ll.transcripcion or "", re.M)
    if not marcas:
        return None
    h, m, s = marcas[-1]
    total = int(h) * 60 + int(m) if s else int(h)
    return total or None


def _dict_secuencia(s: PizarraSecuencia) -> dict:
    """La secuencia como se ve: la editada si alguien la editó, si no la que armó la IA.
    Cada historia va con sus capas (trazos, figuras) y la foto de fondo ya resuelta."""
    if s.editada_json:
        historias = [correcciones.historia_normal(h) for h in json.loads(s.editada_json)]
    else:
        historias = correcciones.historias_normales(json.loads(s.historias_json or "[]"))
    fotos = fondos.existentes(h["fondo"] for h in historias)
    for h in historias:
        h["fondoSrc"] = fotos.get(h["fondo"])
    return {"id": s.id, "largo": s.largo, "objetivo": s.objetivo, "historias": historias,
            "editada": bool(s.editada_json), "editadaPor": s.editada_por,
            "editadaAt": s.editada_at.isoformat() if s.editada_at else None}


def _dict_variante(v: PizarraVariante) -> dict:
    return {
        "id": v.id, "canal": v.canal, "titulo": v.titulo, "detalle": v.detalle, "estado": v.estado,
        "decididoPor": v.decidido_por, "estructura": v.estructura,
        "secuenciasEstado": "armando" if f"secuencias:{v.id}" in _en_curso else ("listas" if v.secuencias else "nada"),
        "secuencias": [_dict_secuencia(s) for s in sorted(v.secuencias, key=lambda s: LARGOS.index(s.largo) if s.largo in LARGOS else 9)],
    }


def _dict_general(g: PizarraGeneral) -> dict:
    return {
        "id": g.id, "titulo": g.titulo, "detalle": g.detalle, "dolor": g.dolor, "cita": g.cita, "minuto": g.minuto,
        "editada": g.editada, "estado": g.estado, "aprobadaPor": g.aprobada_por,
        "variantesEstado": "armando" if f"variantes:{g.id}" in _en_curso else g.variantes_estado,
        "error": g.error,
        "variantes": {c: [_dict_variante(v) for v in sorted(g.variantes, key=lambda v: v.id) if v.canal == c] for c in CANALES},
        # Hay un dibujo de Juan pegado a la frase de esta idea: va a caer en sus secuencias.
        "conDibujo": _con_dibujo(g),
    }


def _con_dibujo(g: PizarraGeneral) -> bool:
    cerca = dibujos._segundos(g.minuto)
    return cerca is not None and any(d.estado == "visible" and abs(d.segundo - cerca) <= DIBUJO_CERCA_S for d in g.llamada.dibujos)


def _dict_llamada(ll: PizarraLlamada, completa: bool = False) -> dict:
    d = {
        "id": ll.id, "tipo": ll.tipo, "titulo": ll.titulo, "fecha": ll.fecha.isoformat() if ll.fecha else None,
        "fuente": ll.fuente, "url": ll.url, "minutos": _duracion(ll), "creadoAt": ll.creado_at.isoformat(),
        "estado": "armando" if f"general:{ll.id}" in _en_curso else ll.estado, "error": ll.error,
    }
    if completa:
        d["generales"] = [_dict_general(g) for g in sorted(ll.generales, key=lambda g: g.id) if g.estado != "descartada"]
        d["dibujosEstado"], d["dibujosError"] = dibujos.estado(ll)
        d["dibujos"] = [{"id": x.id, "minuto": dibujos.minuto(x.segundo), "src": x.archivo, "dicho": x.dicho, "estado": x.estado,
                         "descripcion": x.descripcion}
                        for x in sorted(ll.dibujos, key=lambda x: x.segundo)]
    return d


def listar() -> dict:
    with db_session:
        llamadas = sorted(PizarraLlamada.select(), key=lambda l: (l.creado_at, l.id), reverse=True)
        llamadas_d = [_dict_llamada(l) for l in llamadas]
    from src.services import narrativa_services

    return {"llamadas": llamadas_d, "contexto": contexto(), "narrativaPendientes": narrativa_services.pendientes()}


def detalle(llamada_id: int) -> dict:
    with db_session:
        ll = PizarraLlamada.get(id=llamada_id)
        if ll is None:
            raise HTTPException(status_code=404, detail="Esa llamada no está en la pizarra.")
        return _dict_llamada(ll, completa=True)


def vault() -> dict:
    """Las variantes aprobadas, de la más nueva a la más vieja, con la idea general y la llamada
    de donde salieron."""
    with db_session:
        vs = sorted(PizarraVariante.select(lambda v: v.estado == "aprobada"), key=lambda v: (v.decidido_at or datetime.min), reverse=True)
        return {"ideas": [{
            **_dict_variante(v), "decididoAt": v.decidido_at.isoformat() if v.decidido_at else None,
            "general": {"id": v.general.id, "titulo": v.general.titulo, "cita": v.general.cita, "minuto": v.general.minuto},
            "llamada": {"id": v.general.llamada.id, "titulo": v.general.llamada.titulo, "tipo": v.general.llamada.tipo},
        } for v in vs]}


# ------------------------------------------------------------------ IA

MARCA = """Sos el estratega de contenido de ATV (Aumenta Tu Valor), la marca de Juan Carrizo. ATV ayuda a dueños de negocios de servicios y marcas personales a escalar.
Escribís como Juan, en primera persona, como si lo escribiera él: español rioplatense, directo, de vos, sin clickbait vacío, sin frases de manual de marketing. Si te paso "Cómo escribe Juan", esa es la voz: sus palabras, sus muletillas y su forma de explicar mandan sobre cualquier estilo tuyo.
Le hablás al dueño de un negocio que ya factura, en términos de negocio (cash collected, margen, close rate, carga operativa, equipo); nunca a la persona ni con el lifestyle como argumento."""

SYSTEM_GENERAL = MARCA + """

Juan saca sus mejores ideas de contenido de sus 1 a 1 y clases. Te paso la transcripción de una y lo fijo de la marca.
Tu trabajo: encontrar los temas que habló Juan en la llamada que pueden ser una idea general de contenido: algo que dé para YouTube, Reels e historias y que sirva a la narrativa. Hasta %(n)s, de la más fuerte a la más floja, y cada una de un tema distinto. Si la llamada no da para %(n)s, devolvé las que haya: nunca rellenes.

Reglas para cada idea:
- Se apoya en UNA frase que dijo Juan. Copiala TEXTUAL de la transcripción, sin corregirla ni resumirla, entre 8 y 40 palabras. Nunca uses frases del cliente ni de otra persona del equipo.
- Nada de datos del cliente (nombre, facturación, negocio): el contenido es de Juan para su audiencia.
- "titulo": la idea titulada como titula Juan lo que publica. Mirá "Cómo titula Juan": son sus títulos reales de este año, con las vistas. Copiá esa forma (el largo, las minúsculas, los números en $ y /mes, "te explico", "pov:", la acusación, la pregunta, la promesa con número) y preferí la de los que más vistas tuvieron. Hasta 14 palabras, sobre lo que dijo en la cita, con palabras suyas. NUNCA "concepto: explicación" ni tono de titular de blog o de curso.
- "detalle": de 2 a 4 frases escritas por Juan en primera persona, con su voz, contándole a su audiencia la idea y por qué le importa. Nada de "Juan cuenta que…" ni tercera persona: es él el que escribe.
- "dolor": a qué dolor de la audiencia apunta. Si coincide con uno de la lista, usá ese texto (es una etiqueta interna, no se publica).
- No repitas las ideas que te paso como ya usadas.
- Si te paso "Dibujos de Juan en esta llamada": cuando Juan dibuja es porque está explicando algo importante. Si un dibujo explica algo que sirve a la marca, una de las ideas sale de ese momento, con una frase que Juan dijo mientras dibujaba.

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"ideas": [{"titulo": "...", "detalle": "...", "dolor": "...", "cita": "..."}]}""" % {"n": 5}

IDEAS_POR_LLAMADA = 5
DIBUJO_MIN_COINCIDENCIAS = 2  # palabras en común entre el dibujo y la idea para que "tenga que ver"

SYSTEM_VARIANTES = MARCA + """

Te paso una idea general aprobada por Juan (con la frase de la llamada de donde salió), un tramo de la llamada y lo fijo de la marca.
Tu trabajo: bajarla a variantes por canal. Todas cuentan la misma idea general, cada una con un ángulo distinto, para que la narrativa sea una sola.

"titulo" y "detalle" los escribe JUAN, no un estratega: con su voz tal cual la mide "Cómo escribe Juan" (minúsculas, puntuación, muletillas, palabras suyas) y en primera persona, como si le tirara la idea a su equipo por el chat. Nada de lenguaje de brief ni de agencia: prohibido "arranca con", "muestro", "cierro con", "la secuencia", "el objetivo es", "el espectador", "se presenta". Las frases que van en pantalla, dichas como él las diría. Nunca pongas el nombre de la estructura en el título.

- yt: %(n)s ideas de video de YouTube. "titulo": el título del video, como los títulos de YouTube de "Cómo titula Juan". "detalle": el ángulo y qué se lleva el que lo mira, en 1 o 2 frases.
- reel: %(n)s ideas de reel. "titulo": el gancho (lo primero que se dice o se lee), como arrancan los reels de "Cómo titula Juan". "detalle": de qué va, en 1 o 2 frases.
- story: %(n)s ideas de secuencia de historias. Cada una se arma sobre UNA de las "Estructuras de historias de Juan" que te paso: son las que Juan usa de verdad, sacadas de sus secuencias; no inventes otras. Usá estructuras distintas entre las ideas cuando la idea lo permita, y preferí las que más respuestas traen si le sirven a la idea. "estructura": la clave. "titulo": la primera historia, como abren las historias de "Cómo titula Juan". "detalle": cómo la armaría Juan contado por él, siguiendo los pasos de la estructura, con las frases que van en pantalla y la palabra que pide al final.

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"yt": [{"titulo": "...", "detalle": "..."}], "reel": [...], "story": [{"titulo": "...", "detalle": "...", "estructura": "clave"}]}"""


def _contexto_texto(ctx: dict) -> str:
    nombres = {"dolores": "Dolores de la audiencia", "objeciones": "Objeciones de la audiencia",
               "diferenciales": "Diferenciales de la marca", "narrativa": "Narrativa actual"}
    texto = "\n\n".join(f"## {nombres[k]}\n{(ctx[k]['texto'] or '(todavía no cargado)').strip()}" for k in CONTEXTO)
    voz = voz_juan.bloque()  # del cerebro del classroom: todo lo que escribe la pizarra va en la voz de Juan
    return texto + ("\n\n" + voz if voz else "") + ganchos_juan()


def _recortar(texto: str) -> str:
    if len(texto) <= MAX_CHARS:
        return texto
    return texto[: MAX_CHARS * 2 // 3] + "\n[… se omitió un tramo del medio por longitud …]\n" + texto[-MAX_CHARS // 3:]


def _limpio(v, largo: int) -> str:
    return " ".join(str(v or "").split())[:largo]


def validar_general(data: dict, segs: list[dict]) -> dict | None:
    """La idea general que se puede guardar, o None si la cita no es de Juan o no está."""
    cita, titulo = _limpio(data.get("cita"), 600), _limpio(data.get("titulo"), 200)
    lugar = ubicar_cita(cita, segs) if cita and titulo else None
    if lugar is None or not es_del_vocero(lugar["quien"], segs):
        logger.info("Pizarra: idea general descartada (%s): %r", "cita de otro" if lugar else "cita no encontrada", cita[:120])
        return None
    return {"titulo": titulo_de_juan(titulo, lugar["texto"], segs), "detalle": _limpio(data.get("detalle"), 1500) or None,
            "dolor": _limpio(data.get("dolor"), 200) or None, "cita": lugar["texto"][:600], "minuto": lugar["ts"]}


TITULO_PALABRAS = (4, 14)


def titulo_de_juan(titulo: str, cita: str, segs: list[dict]) -> str:
    """El título que queda. Si Claude devolvió uno vacío o que no tiene largo de título, sale
    del arranque de la cita, cortado en la primera pausa: siempre son palabras de Juan."""
    minimo, maximo = TITULO_PALABRAS
    if minimo <= len(titulo.split()) <= maximo:
        lugar = ubicar_cita(titulo, segs)
        if lugar is not None and es_del_vocero(lugar["quien"], segs):
            return lugar["texto"].strip(" ,.;:").lower()
        # Desde que se guía por sus títulos publicados ("Cómo titula Juan"), el título puede
        # no estar dicho tal cual en la llamada: vale si tiene el largo de un título suyo.
        return titulo.strip()
    primera = re.split(r"[.;:?!]|,\s", cita, maxsplit=1)[0].split()
    if len(primera) < minimo:
        primera = cita.split()
    return " ".join(primera[:maximo]).strip(" ,.;:").lower()


def validar_generales(data: dict, segs: list[dict]) -> list[dict]:
    """Las ideas que se pueden guardar, sin dos apoyadas en la misma frase."""
    items = data.get("ideas") if isinstance(data.get("ideas"), list) else [data]
    salida, citas = [], set()
    for item in items:
        idea = validar_general(item, segs) if isinstance(item, dict) else None
        if idea is None or _norm(idea["cita"]) in citas:
            continue
        citas.add(_norm(idea["cita"]))
        salida.append(idea)
        if len(salida) == IDEAS_POR_LLAMADA:
            break
    return salida


def _sin_nombre_de_estructura(titulo: str, nombre: str | None) -> str:
    """"Te lo dibujo: de los chats al cash" → "de los chats al cash": la estructura ya se ve aparte."""
    if not nombre or ":" not in titulo:
        return titulo
    antes, despues = titulo.split(":", 1)
    return despues.strip() if _norm(antes) == _norm(nombre) and despues.strip() else titulo


def validar_variantes(data: dict, estructuras: dict | set | None = None) -> dict[str, list[dict]]:
    """Las variantes que se pueden guardar. Una idea de historias sin una estructura real
    de Juan (de las activas) no entra. `estructuras`: {clave: {"nombre": …}} o solo las claves."""
    salida = {}
    for canal in CANALES:
        items = data.get(canal) if isinstance(data.get(canal), list) else []
        salida[canal] = []
        for i in items[:VARIANTES_POR_CANAL + 2]:
            if not isinstance(i, dict) or not _limpio(i.get("titulo"), 300):
                continue
            item = {"titulo": _limpio(i.get("titulo"), 300), "detalle": _limpio(i.get("detalle"), 1200) or None}
            if canal == "story" and estructuras:
                if i.get("estructura") not in estructuras:
                    continue
                item["estructura"] = i["estructura"]
                info = estructuras.get(i["estructura"]) if isinstance(estructuras, dict) else None
                item["titulo"] = _sin_nombre_de_estructura(item["titulo"], (info or {}).get("nombre"))
            salida[canal].append(item)
    return salida


def _en_segundo_plano(clave: str, fn, *args) -> bool:
    with _lock:
        if clave in _en_curso:
            return False
        _en_curso.add(clave)

    def correr():
        try:
            fn(*args)
        except Exception as e:  # noqa: BLE001 — la falla queda escrita donde corresponde
            logger.exception("Pizarra: falló %s", clave)
            _anotar_error(clave, str(e)[:400])
        finally:
            _en_curso.discard(clave)

    threading.Thread(target=correr, daemon=True).start()
    return True


def _anotar_error(clave: str, error: str) -> None:
    tipo, ident = clave.split(":")
    with db_session:
        if tipo == "general":
            ll = PizarraLlamada.get(id=int(ident))
            if ll is not None:
                ll.estado, ll.error = "error", error
        elif tipo == "variantes":
            g = PizarraGeneral.get(id=int(ident))
            if g is not None:
                g.variantes_estado, g.error = "error", error


def _claude(system: str, prompt: str, max_tokens: int = 4000) -> dict:
    texto, _meta = ia.invocar_claude_texto(system, prompt, modelo=MODELO, max_tokens=max_tokens, timeout_s=TIMEOUT_S)
    return ia._extraer_json(texto)


# --- idea general

def generar_general(llamada_id: int) -> dict:
    """Propone hasta 5 ideas generales del video. Las propuestas sin aprobar se reemplazan;
    las aprobadas quedan y no se repiten."""
    with db_session:
        ll = PizarraLlamada.get(id=llamada_id)
        if ll is None:
            raise HTTPException(status_code=404, detail="Esa llamada no está en la pizarra.")
        if ll.tipo == TIPO_SIN_LLAMADA:
            raise HTTPException(status_code=409, detail="Esta fuente no tiene llamada: sus ideas de secuencia salen derecho.")
        ll.estado, ll.error = "armando", None
    _en_segundo_plano(f"general:{llamada_id}", _generar_general, llamada_id)
    return detalle(llamada_id)


def _dibujos_para_ideas(llamada_id: int) -> str:
    lista = dibujos.para_ia(llamada_id)
    if not lista:
        return ""
    return "\n\n# Dibujos de Juan en esta llamada\n" + "\n".join(
        f"- minuto {d['minuto']}: {d['descripcion'] or 'sin describir'}. Mientras dibujaba decía: \"{d['dicho'][:400]}\"" for d in lista)


ESPERA_DIBUJOS_S = 900  # cuánto esperan las ideas a que termine la búsqueda de dibujos


def _generar_general(llamada_id: int) -> None:
    # Si los dibujos se están buscando, las ideas los esperan: una idea puede salir de un dibujo.
    import time

    limite = time.time() + ESPERA_DIBUJOS_S
    while dibujos.buscando(llamada_id) and time.time() < limite:
        time.sleep(5)
    ctx = contexto()
    voz_juan.voz()  # se lee antes de abrir la sesión: si el classroom falla, no anula la transacción de Ops
    with db_session:
        ll = PizarraLlamada[llamada_id]
        usadas = [g.titulo for g in ll.generales]
        prompt = ("# Lo fijo de la marca\n" + _contexto_texto(ctx)
                  + ("\n\n# Ideas generales ya usadas de esta llamada\n" + "\n".join(f"- {t}" for t in usadas) if usadas else "")
                  + _dibujos_para_ideas(llamada_id)
                  + f"\n\n# La llamada ({'1 a 1' if ll.tipo == '1a1' else 'clase grupal'}): {ll.titulo}\n{_recortar(ll.transcripcion)}")
        segs = segmentos(ll.transcripcion)
    ideas = validar_generales(_claude(SYSTEM_GENERAL, prompt, 6000), segs)
    if not ideas:  # una segunda vuelta, avisándole qué falló
        prompt += ("\n\n# Ojo\nLas frases que elegiste antes no están tal cual en la transcripción o no las dijo "
                   f"{VOCERO}. Elegí frases que diga {VOCERO} y copialas letra por letra de sus líneas.")
        ideas = validar_generales(_claude(SYSTEM_GENERAL, prompt, 6000), segs)
    with db_session:
        ll = PizarraLlamada[llamada_id]
        if not ideas:
            nombres = quienes_hablan(segs)
            if nombres and not any(_es_juan(q) for q in nombres):
                ll.estado, ll.error = "error", ("No encontré a Juan entre los que hablan en la transcripción (" + ", ".join(nombres[:5])
                                                + "). Si figura con otro nombre, hay que sumarlo en PIZARRA_VOCERO.")
            else:
                ll.estado, ll.error = "error", "Claude no encontró frases de Juan en esta llamada para apoyar las ideas. Probá de nuevo."
            return
        for g in list(ll.generales):
            if g.estado == "propuesta":
                g.estado = "descartada"
        for idea in ideas:
            PizarraGeneral(llamada=ll, **idea)
        ll.estado, ll.error = "lista", None


def editar_general(general_id: int, cambios: dict) -> dict:
    with db_session:
        g = PizarraGeneral.get(id=general_id)
        if g is None:
            raise HTTPException(status_code=404, detail="Esa idea no existe.")
        if "titulo" in cambios:
            t = _limpio(cambios["titulo"], 200)
            if not t:
                raise HTTPException(status_code=422, detail="La idea no puede quedar sin título.")
            g.titulo, g.editada = t, True
        if "detalle" in cambios:
            g.detalle, g.editada = _limpio(cambios["detalle"], 1500) or None, True
        if cambios.get("estado") in ("propuesta", "descartada"):
            if g.estado == "aprobada":
                raise HTTPException(status_code=409, detail="La idea ya está aprobada.")
            g.estado = cambios["estado"]
        llamada_id = g.llamada.id
    return detalle(llamada_id)


def aprobar_general(general_id: int, por: str | None) -> dict:
    """Aprobada la idea general, salen las variantes por canal."""
    with db_session:
        g = PizarraGeneral.get(id=general_id)
        if g is None:
            raise HTTPException(status_code=404, detail="Esa idea no existe.")
        g.estado, g.aprobada_por = "aprobada", por
        g.variantes_estado, g.error = "armando", None
        llamada_id = g.llamada.id
    _en_segundo_plano(f"variantes:{general_id}", _generar_variantes, general_id)
    return detalle(llamada_id)


def regenerar_variantes(general_id: int) -> dict:
    with db_session:
        g = PizarraGeneral.get(id=general_id)
        if g is None or g.estado != "aprobada":
            raise HTTPException(status_code=409, detail="Primero hay que aprobar la idea general.")
        g.variantes_estado, g.error = "armando", None
        llamada_id, sin_llamada = g.llamada.id, g.llamada.tipo == TIPO_SIN_LLAMADA
    _en_segundo_plano(f"variantes:{general_id}", _generar_ideas_story if sin_llamada else _generar_variantes, general_id)
    return detalle(llamada_id)


def _generar_variantes(general_id: int) -> None:
    ctx = contexto()
    voz_juan.voz()  # se lee antes de abrir la sesión: si el classroom falla, no anula la transacción de Ops
    catalogo, claves = estructuras.catalogo_texto(), estructuras.activas()
    with db_session:
        g = PizarraGeneral[general_id]
        aprobadas = [f"- ({v.canal}) {v.titulo}" for v in g.variantes if v.estado == "aprobada"]
        prompt = ("# Lo fijo de la marca\n" + _contexto_texto(ctx)
                  + f"\n\n# La idea general aprobada\n{g.titulo}\n{g.detalle or ''}\nDolor: {g.dolor or '-'}\nFrase de Juan ({g.minuto or 's/m'}): \"{g.cita or ''}\""
                  + ("\n\n# Variantes ya aprobadas (no las repitas)\n" + "\n".join(aprobadas) if aprobadas else "")
                  + (f"\n\n# Estructuras de historias de Juan\n{catalogo}" if catalogo else "")
                  + f"\n\n# La llamada: {g.llamada.titulo}\n{_recortar(g.llamada.transcripcion)}")
    variantes = validar_variantes(_claude(SYSTEM_VARIANTES % {"n": VARIANTES_POR_CANAL}, prompt, 4000), claves)
    with db_session:
        g = PizarraGeneral[general_id]
        for v in list(g.variantes):
            if v.estado != "aprobada" and not v.secuencias:
                v.delete()
        for canal, items in variantes.items():
            for i in items:
                PizarraVariante(general=g, canal=canal, titulo=i["titulo"], detalle=i["detalle"], estructura=i.get("estructura"))
        hay = any(variantes.values())
        g.variantes_estado = "listas" if hay else "error"
        g.error = None if hay else "Claude no devolvió variantes. Probá de nuevo."


# ------------------------------------------------------------------ sin llamada

# Las ideas de secuencia también salen sin una llamada cargada. La regla que hace que no
# suenen a IA era la cita verificada: Claude tenía que apoyarse en una frase que Juan dijo
# de verdad, y el código la buscaba en la transcripción. Sin llamada esa red no existe, así
# que el ancla pasa a ser lo que Juan YA hizo: las estructuras sacadas de sus secuencias,
# cómo titula lo que publica, cómo escribe (medido en el classroom) y las secuencias que ya
# salieron —que además son la lista de lo que no hay que volver a contar—. Y como no hay
# frase, se le prohíbe escribir una: lo que no está, no se inventa.
ORIGENES = ("dolor", "tema", "secuencia")
TIPO_SIN_LLAMADA = "tema"           # el `tipo` de la fuente que no es una llamada
SECUENCIAS_PARA_ELEGIR = 60         # las que se le ofrecen a marketing para copiar la forma
SECUENCIAS_YA_CONTADAS = 40         # las que entran al pedido para no repetir tema
MAX_TEMA = 400

SYSTEM_IDEAS_STORY = MARCA + """

Juan quiere ideas de secuencias de historias y esta vez NO hay llamada: no tenés transcripción de donde sacar una frase suya.
Te paso de dónde arranca la idea, lo fijo de la marca, las estructuras que Juan usa de verdad en sus historias, cómo titula lo que publica y las secuencias que ya publicó.

Tu trabajo: %(n)s ideas de secuencia de historias, cada una sobre UNA de las estructuras que te paso. No inventes otras. Usá estructuras distintas entre las ideas cuando el tema lo permita, y preferí las que más respuestas traen si le sirven a la idea.

Las reglas que importan:
- NO hay frase de Juan. No pongas nada entre comillas como si él lo hubiera dicho, y no le atribuyas nada que no esté en lo que te paso.
- No inventes cifras, resultados ni nombres de clientes. Donde haga falta un caso, decí qué captura va ("captura del resultado de un cliente, a elegir") y escribí el texto sin números inventados.
- No repitas lo ya contado: abajo están las secuencias que Juan ya publicó. Si tu idea es la misma que una de esas, no la devuelvas.
- "titulo": la primera historia de la secuencia, como abren las historias de "Cómo titula Juan". Hasta 14 palabras. Nunca pongas el nombre de la estructura en el título.
- "detalle": cómo la armaría Juan contado por él, en primera persona, siguiendo los pasos de la estructura, con las frases que van en pantalla y la palabra que pide al final. Nada de lenguaje de brief: prohibido "arranca con", "muestro", "cierro con", "la secuencia", "el objetivo es", "el espectador", "se presenta".

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"ideas": [{"titulo": "...", "detalle": "...", "estructura": "clave"}]}"""


def secuencias_publicadas(limite: int = SECUENCIAS_PARA_ELEGIR) -> list[dict]:
    """Las secuencias que Juan ya publicó, de la más nueva a la más vieja."""
    with db_session:
        dias = sorted((d for d in PizarraHistoriaDia.select() if (d.resumen or "").strip()),
                      key=lambda d: d.fecha, reverse=True)[:limite]
        return [{"fecha": d.fecha, "estructura": d.estructura, "resumen": d.resumen} for d in dias]


def _ya_contado() -> str:
    lista = secuencias_publicadas(SECUENCIAS_YA_CONTADAS)
    if not lista:
        return ""
    return ("\n\n# Secuencias que Juan ya publicó (no repitas el tema)\n"
            + "\n".join(f"- {d['fecha']}: {' '.join((d['resumen'] or '').split())[:300]}" for d in lista))


def _material(origen: str, valor: str) -> tuple[str, str]:
    """(título de la fuente, el tramo del pedido que dice de dónde arranca la idea)."""
    valor = " ".join(str(valor or "").split())
    if not valor:
        raise HTTPException(status_code=422, detail="Falta de dónde arranca la idea.")
    if origen == "dolor":
        return (f"Dolor · {valor[:120]}",
                "# De dónde arranca: un dolor de la audiencia\n" + valor[:600]
                + "\nLas tres ideas le pegan a ese dolor, cada una desde un ángulo distinto.")
    if origen == "tema":
        return (f"Tema · {valor[:120]}",
                "# De dónde arranca: el tema que quiere contar Juan\n" + valor[:MAX_TEMA]
                + "\nLas tres ideas son de ese tema, cada una desde un ángulo distinto.")
    with db_session:
        dia = PizarraHistoriaDia.get(fecha=valor[:10])
        resumen = (dia.resumen or "").strip() if dia else ""
        clave = dia.estructura if dia else None
    if not resumen:
        raise HTTPException(status_code=404, detail="Esa secuencia no está leída en la pizarra.")
    return material_de_secuencia(valor[:10], resumen, (estructuras.activas().get(clave or "") or {}).get("nombre"))


def material_de_secuencia(fecha: str, resumen: str, nombre_estructura: str | None) -> tuple[str, str]:
    """Copiar una secuencia que ya salió es copiarle la MANERA de contar, no el tema: sin
    esa línea la idea "nueva" vuelve a contar lo mismo que ese día."""
    dia_corto = "-".join(reversed(fecha.split("-")))  # 2026-10-19 → 19-10-2026
    return (f"Como la del {dia_corto}",
            f"# De dónde arranca: una secuencia que ya salió ({fecha})\n"
            + (f"Estructura: {nombre_estructura}\n" if nombre_estructura else "")
            + f"Lo que hizo: {resumen[:600]}"
            + "\nLo que se copia es la FORMA, no el tema: las tres ideas usan esa misma manera de contar "
              "sobre temas distintos al de ese día.")


def crear_sin_llamada(origen: str, valor: str, por: str | None) -> dict:
    """Arranca las ideas de secuencia sin llamada: de un dolor, de un tema escrito o de una
    secuencia que ya salió.

    La fuente se guarda como una `PizarraLlamada` más —con `tipo` tema— porque de ahí para
    adelante el camino es el mismo: la idea aprobada baja a las tres secuencias con los
    mismos bocetos. La idea general queda aprobada de entrada y no se muestra: acá no hay
    idea general que discutir, el origen ES la idea."""
    if origen not in ORIGENES:
        raise HTTPException(status_code=422, detail="De dónde arranca tiene que ser un dolor, un tema o una secuencia.")
    titulo, material = _material(origen, valor)
    with db_session:
        ll = PizarraLlamada(titulo=titulo[:200], fuente=origen, transcripcion=material,
                            creado_por=por, tipo=TIPO_SIN_LLAMADA, estado="armando")
        flush()
        g = PizarraGeneral(llamada=ll, titulo=titulo[:200], estado="aprobada", aprobada_por=por,
                           variantes_estado="armando")
        flush()
        general_id, llamada_id = g.id, ll.id
    _en_segundo_plano(f"variantes:{general_id}", _generar_ideas_story, general_id)
    return detalle(llamada_id)


def _generar_ideas_story(general_id: int) -> None:
    ctx = contexto()
    voz_juan.voz()  # se lee antes de abrir la sesión: si el classroom falla, no anula la transacción de Ops
    catalogo, claves = estructuras.catalogo_texto(), estructuras.activas()
    ya = _ya_contado()
    ganchos = ganchos_juan()
    with db_session:
        g = PizarraGeneral[general_id]
        aprobadas = [f"- {v.titulo}" for v in g.variantes if v.estado == "aprobada"]
        prompt = (g.llamada.transcripcion
                  + "\n\n# Lo fijo de la marca\n" + _contexto_texto(ctx)
                  + (f"\n\n# Estructuras de historias de Juan\n{catalogo}" if catalogo else "")
                  + ganchos + ya
                  + ("\n\n# Ideas ya aprobadas de esta misma fuente (no las repitas)\n" + "\n".join(aprobadas) if aprobadas else ""))
    ideas = validar_variantes({"story": (_claude(SYSTEM_IDEAS_STORY % {"n": VARIANTES_POR_CANAL}, prompt, 5000) or {}).get("ideas")}, claves)["story"]
    with db_session:
        g = PizarraGeneral[general_id]
        for v in list(g.variantes):
            if v.estado != "aprobada" and not v.secuencias:
                v.delete()
        for i in ideas[:VARIANTES_POR_CANAL]:
            PizarraVariante(general=g, canal="story", titulo=i["titulo"], detalle=i["detalle"], estructura=i.get("estructura"))
        g.variantes_estado = "listas" if ideas else "error"
        g.error = None if ideas else "Claude no devolvió ideas que se apoyen en una estructura real. Probá de nuevo."
        g.llamada.estado, g.llamada.error = ("lista", None) if ideas else ("error", g.error)


# --- variantes

def borrar_variante(variante_id: int) -> dict:
    """Borra una idea con sus secuencias. Desde el vault: se va para siempre."""
    with db_session:
        v = PizarraVariante.get(id=variante_id)
        if v is None:
            raise HTTPException(status_code=404, detail="Esa idea no existe.")
        for s in list(v.secuencias):
            s.delete()
        v.delete()
    return {"ok": True}


def actualizar_variante(variante_id: int, cambios: dict, por: str | None) -> dict:
    with db_session:
        v = PizarraVariante.get(id=variante_id)
        if v is None:
            raise HTTPException(status_code=404, detail="Esa idea no existe.")
        if "estado" in cambios:
            if cambios["estado"] not in ESTADOS:
                raise HTTPException(status_code=422, detail="Estado inválido.")
            v.estado, v.decidido_por, v.decidido_at = cambios["estado"], por, datetime.utcnow()
        if "titulo" in cambios:
            t = _limpio(cambios["titulo"], 300)
            if not t:
                raise HTTPException(status_code=422, detail="El título no puede quedar vacío.")
            v.titulo = t
        if "detalle" in cambios:
            v.detalle = _limpio(cambios["detalle"], 1200) or None
        llamada_id = v.general.llamada.id
    return detalle(llamada_id)


def borrar(llamada_id: int, forzar: bool = False) -> dict:
    """Borra la llamada con todo lo que salió de ella. Si ya tiene una idea aprobada (y quizás
    variantes en el vault), solo con `forzar`: lo confirma quien la borra."""
    with db_session:
        ll = PizarraLlamada.get(id=llamada_id)
        if ll is None:
            raise HTTPException(status_code=404, detail="Esa llamada no está en la pizarra.")
        if not forzar and any(g.estado == "aprobada" for g in ll.generales):
            raise HTTPException(status_code=409, detail="Tiene una idea general aprobada: confirmá que se borra con todo lo que salió de ella.")
        for g in list(ll.generales):
            for v in list(g.variantes):
                for s in list(v.secuencias):
                    s.delete()
                v.delete()
            g.delete()
        for d in list(ll.dibujos):
            d.delete()
        ll.delete()
    import shutil

    shutil.rmtree(dibujos.CARPETA / str(llamada_id), ignore_errors=True)
    return {"ok": True}


# ------------------------------------------------------------------ secuencias de historias

# Cuántas historias lleva cada largo: sale de las 108 secuencias reales de Juan (ver la guía).
RANGO_LARGO = {"corta": (2, 4), "media": (5, 8), "larga": (9, 13)}
OBJETIVOS = {
    "palabra": "pedir la palabra (responde PALABRA y te lo paso) con el recurso a la vista",
    "ensenar": "enseñar una idea, ponerle nombre y pedir la palabra",
    "mostrar": "mostrar un proceso paso a paso, una ronda de casos o un día de Juan",
    "objecion": "romper una objeción, sin pedir la palabra",
}
OBJETIVO_POR_LARGO = {"corta": "palabra", "media": "ensenar", "larga": "mostrar"}
TAMANOS = ("g", "n", "c")   # grande, normal, chico — como en los bocetos de marketing

def _estructura_texto(e: dict | None) -> str:
    """La estructura real que eligió la idea, con cómo la usó Juan en sus secuencias."""
    if not e:
        return ""
    pasos = "\n".join(f"{i}. [{p['rol']}] {p['que']}" for i, p in enumerate(e["pasos"], 1))
    with db_session:
        resumenes = [(d.fecha, d.resumen) for d in PizarraHistoriaDia.select(lambda d: d.fecha in e["ejemplos"]) if d.resumen]
    ejemplos = "\n".join(f"- {f}: {r}" for f, r in sorted(resumenes)[-4:])
    return (f"\n\n# La estructura de esta idea: {e['nombre']}\n{e['cuando'] or ''}\nPasos:\n{pasos}"
            + (f"\nAsí la usó Juan:\n{ejemplos}" if ejemplos else "")
            + "\nLas tres secuencias siguen estos pasos: la corta los comprime, la larga los estira con más prueba.")


SYSTEM_SECUENCIAS = MARCA + """

Armás secuencias de historias de Instagram para Juan, como los bocetos que hace marketing: una tarjeta vertical por historia con el texto tal cual va en pantalla y el lugar de cada imagen marcado. No diseñás: decís qué va escrito y qué imagen va.

Te paso la guía de cómo arma Juan sus secuencias (sacada de sus historias reales, con números), la idea aprobada, la idea general con la frase de Juan, y lo fijo de la marca. Seguí la guía: el largo, la estructura de cada largo, cómo escribe (minúscula, una idea por línea, punto al final, plata en dólares con k, la frase que importa en negrita) y cómo pide la palabra.

Armá TRES secuencias de la misma idea:
- corta: entre 2 y 4 historias.
- media: entre 5 y 8 historias.
- larga: entre 9 y 13 historias.
El objetivo de cada una te lo digo abajo.

Cada historia es una lista de bloques, en el orden en que se ven de arriba a abajo:
- {"tipo": "texto", "tamano": "g" | "n" | "c", "texto": "..."}  — g grande, n normal, c chico. Un salto de línea dentro del bloque con \\n. Marcas dentro del texto:
  **así** negrita · [[PALABRA]] encerrada en óvalo rojo · {{dato}} en rojo · ~~así~~ tachado en rojo · __así__ subrayado en rojo. Las listas con ❌ o ✅ al principio de la línea.
- {"tipo": "imagen", "texto": "...", "marcas": ["...", "..."]}  — qué imagen va ahí, dicho para que el equipo la busque o la arme: "captura del chat de un cliente con su resultado", "mockup del documento", "meme 3 doritos después", "selfie de Juan a cámara de noche". "marcas" (opcional, hasta 5): las etiquetas rojas con flecha que Juan dibuja sobre partes de la captura.
- {"tipo": "flecha", "color": "roja" | "blanca", "texto": "..."}  — la flecha dibujada a mano. "texto" (opcional): hacia dónde apunta ("a la palabra", "al sticker", "a mí").
- {"tipo": "diagrama", "texto": "paso → paso → paso", "ciclo": true | false}  — el diagrama dibujado a mano con flechas rojas; "ciclo" si vuelve al principio.
- {"tipo": "grafico", "forma": "barras" | "linea" | "curva", "datos": [{"etiqueta": "90%", "valor": 90}, {"etiqueta": "10%", "valor": 10}], "texto": "título corto (opcional)"}  — el gráfico que Juan dibuja a mano en rojo, con los datos: el boceto lo dibuja. "barras" para comparar (90/10, antes y después), "linea" para un crecimiento en el tiempo, "curva" para una retención (hook alto, body que cae). Entre 2 y 8 datos, con valores numéricos. Nunca describas el gráfico en texto: mandá los datos.

Los recursos visuales son de Juan, no decoración: usalos como los usa él (están en la guía), no en todas las historias.

No inventes resultados, cifras ni nombres de clientes: si hace falta un caso, poné el hueco de imagen ("captura del resultado de un cliente, a elegir") y el texto sin cifras inventadas. Las cifras de Juan que están en la guía o en la frase sí se pueden usar.
Si la secuencia pide la palabra, la palabra es una sola, en mayúscula, y es la misma en las tres secuencias.

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"palabra": "NIVELES" | null, "secuencias": {"corta": [[bloque, ...], ...], "media": [...], "larga": [...]}}"""


def _nota_cerebro(nombre: str) -> str:
    """Una nota de marketing del cerebro (la editable); si todavía no se sembró, la del repo."""
    from src.services.cerebro_services import CEREBRO_DIR, SEMILLA_DIR

    for base in (CEREBRO_DIR, SEMILLA_DIR):
        ruta = base / "marketing" / nombre
        if ruta.exists():
            return ruta.read_text(encoding="utf-8")
    return ""


def guia_secuencias() -> str:
    return _nota_cerebro("secuencias-historias.md")


def ganchos_juan() -> str:
    """Cómo titula Juan: lo que publicó este año (reels, YouTube, historias), en vivo. La nota
    fija de aperturas queda solo para cuando todavía no hay nada sincronizado."""
    from src.services import titulos_juan_services

    try:
        vivo = titulos_juan_services.bloque()
    except Exception as e:  # noqa: BLE001
        logger.info("Pizarra: no se pudieron leer los títulos de Juan: %s", str(e)[:160])
        vivo = ""
    nota = vivo or _nota_cerebro("ganchos-juan.md")
    return ("\n\n" + nota) if nota else ""


def _dibujos_texto(lista: list[dict], de_la_idea: list[dict] | None = None) -> str:
    """Los dibujos que Juan hizo en la llamada, con lo que estaba diciendo, para usar de imagen."""
    if not lista:
        return ""
    ids = {d["id"] for d in de_la_idea or []}
    filas = "\n".join(f"- dibujo {d['id']} (minuto {d['minuto']}): muestra: {d.get('descripcion') or 'sin describir'}. Lo que decía: \"{d['dicho'][:500]}\""
                       for d in lista)
    return ("\n\n# Dibujos que Juan hizo en la pizarra durante esta llamada (capturas reales)\n" + filas
            + "\nOBLIGATORIO: si un dibujo tiene que ver con la idea, cada una de las tres secuencias usa al menos uno, de imagen: "
              "{\"tipo\": \"imagen\", \"dibujo\": id, \"texto\": qué muestra}. Va en la historia donde se explica eso y REEMPLAZA "
              "cualquier diagrama, gráfico o mockup que harías para mostrar lo mismo: lo que dibujó Juan vale más que un dibujo nuevo. "
              "Es la captura real: no la describas como algo a buscar. Podés sumarle \"marcas\" (etiquetas rojas) encima."
            + (f"\nTienen que ver con esta idea (Juan los dibujó mientras la explicaba): dibujo {', '.join(str(i) for i in sorted(ids))}. Usalos." if ids else ""))


_VACIAS = set("de la el los las un una y o que en a con por para es no se lo al del su tu te me mi yo vos como mas más".split())


def _palabras_clave(texto: str) -> set[str]:
    return {w for w in _norm(texto).split() if len(w) > 2 and w not in _VACIAS}


def _texto_historia(h: list[dict]) -> str:
    return " ".join(str(b.get("texto") or "") for b in h)


DIBUJO_CERCA_S = 600  # un dibujo hecho a menos de 10 min de la frase de la idea es de esa idea


def dibujos_de_la_idea(de_la_llamada: list[dict], idea: str, cerca_de: int | None) -> list[dict]:
    """Los dibujos que tienen que ver con la idea: los que Juan hizo cerca del minuto de la
    frase de donde salió, o los que comparten palabras con ella."""
    clave_idea = _palabras_clave(idea)
    salida = []
    for d in de_la_llamada:
        cerca = cerca_de is not None and d.get("segundo") is not None and abs(d["segundo"] - cerca_de) <= DIBUJO_CERCA_S
        comunes = len(_palabras_clave(f"{d.get('descripcion') or ''} {d.get('dicho') or ''}") & clave_idea)
        if cerca or comunes >= DIBUJO_MIN_COINCIDENCIAS:
            salida.append(d)
    return salida


def asegurar_dibujos(secuencias: dict[str, list[list[dict]]], de_la_llamada: list[dict], idea: str, cerca_de: int | None = None) -> dict:
    """Si un dibujo de Juan tiene que ver con la idea y una secuencia no usa ninguno, lo pone
    el código: Claude a veces dibuja su propio diagrama en vez de usar el de Juan.
    Va en el diagrama o gráfico que lo imitaba; si no hay, en el hueco de imagen de la
    historia que más se le parece; si tampoco, se suma a esa historia."""
    if not de_la_llamada:
        return secuencias
    clave_idea = _palabras_clave(idea)
    puntaje = {d["id"]: len(_palabras_clave(f"{d.get('descripcion') or ''} {d.get('dicho') or ''}") & clave_idea) for d in de_la_llamada}
    utiles = dibujos_de_la_idea(de_la_llamada, idea, cerca_de)
    if not utiles:
        return secuencias
    for largo, historias in secuencias.items():
        if not historias or any(b.get("dibujo") for h in historias for b in h):
            continue
        texto_sec = _palabras_clave(" ".join(_texto_historia(h) for h in historias))
        mejor = max(utiles, key=lambda d: (len(_palabras_clave(f"{d.get('descripcion') or ''} {d.get('dicho') or ''}") & texto_sec), puntaje[d["id"]]))
        bloque = {"tipo": "imagen", "texto": (mejor.get("descripcion") or "el dibujo de Juan en la llamada")[:200],
                  "dibujo": mejor["id"], "src": mejor["src"]}
        pistas = _palabras_clave(f"{mejor.get('descripcion') or ''} {mejor.get('dicho') or ''}")
        # 1) el diagrama o gráfico que hacía de dibujo
        lugar = next(((i, j) for i, h in enumerate(historias) for j, b in enumerate(h) if b.get("tipo") in ("diagrama", "grafico")), None)
        if lugar is None:
            # 2) el hueco de imagen de la historia que más se parece al dibujo
            candidatos = [(len(_palabras_clave(_texto_historia(h)) & pistas), i, j) for i, h in enumerate(historias)
                          for j, b in enumerate(h) if b.get("tipo") == "imagen" and not b.get("src")]
            if candidatos:
                _, i, j = max(candidatos)
                lugar = (i, j)
        if lugar is not None:
            historias[lugar[0]][lugar[1]] = bloque
        else:
            i = max(range(len(historias)), key=lambda k: len(_palabras_clave(_texto_historia(historias[k])) & pistas))
            historias[i].append(bloque)
    return secuencias


FORMAS_GRAFICO = ("barras", "linea", "curva")


def _grafico(b: dict) -> dict | None:
    """Un gráfico con datos que el boceto pueda dibujar; sin datos válidos no entra."""
    forma = b.get("forma") if b.get("forma") in FORMAS_GRAFICO else None
    datos = []
    for x in b.get("datos") or []:
        if not isinstance(x, dict):
            continue
        try:
            valor = float(str(x.get("valor")).replace("%", "").replace(",", "."))
        except (TypeError, ValueError):
            continue
        datos.append({"etiqueta": _limpio(x.get("etiqueta"), 20), "valor": valor})
    if not forma or not 2 <= len(datos) <= 8:
        return None
    return {"tipo": "grafico", "forma": forma, "datos": datos, "texto": _limpio(b.get("texto"), 40)}


def _bloque(b, dibujos_ok: dict[int, str] | None = None, fondos_ok=None) -> dict | None:
    """Un bloque de historia con tipo y tamaño fijos, o None si no se puede dibujar."""
    if not isinstance(b, dict):
        return None
    texto = str(b.get("texto") or "").strip()[:500]
    tipo = b.get("tipo")
    if tipo == "fondo":
        # La foto del álbum que eligió la IA: solo si existe.
        try:
            foto = int(b.get("foto"))
        except (TypeError, ValueError):
            return None
        return {"tipo": "fondo", "foto": foto} if foto in (fondos_ok or ()) else None
    if not texto and tipo not in ("flecha", "grafico") and not (tipo == "imagen" and b.get("dibujo") is not None):
        return None
    if tipo == "imagen":
        marcas = [_limpio(m, 40) for m in b.get("marcas") or [] if isinstance(m, str) and _limpio(m, 40)][:5]
        imagen = {"tipo": "imagen", "texto": _limpio(texto, 200), **({"marcas": marcas} if marcas else {})}
        try:
            dib = int(b.get("dibujo")) if b.get("dibujo") is not None else None
        except (TypeError, ValueError):
            dib = None
        if dib is not None and dib in (dibujos_ok or {}):
            imagen.update(dibujo=dib, src=dibujos_ok[dib])  # la captura real de la llamada
        return imagen
    if tipo == "flecha":
        return {"tipo": "flecha", "color": "blanca" if b.get("color") == "blanca" else "roja", "texto": _limpio(texto, 60)}
    if tipo == "diagrama":
        pasos = [_limpio(x, 40) for x in re.split(r"\s*(?:→|->)\s*", texto) if _limpio(x, 40)][:7]
        return {"tipo": "diagrama", "texto": " → ".join(pasos), "ciclo": bool(b.get("ciclo"))} if len(pasos) >= 2 else None
    if tipo == "grafico":
        return _grafico(b)
    tam = b.get("tamano") if b.get("tamano") in TAMANOS else "n"
    return {"tipo": "texto", "tamano": tam, "texto": "\n".join(" ".join(l.split()) for l in texto.splitlines())}


def validar_secuencias(data: dict, dibujos_ok: dict[int, str] | None = None, fondos_ok=None) -> dict[str, list[list[dict]]]:
    """Las secuencias con bloques de tipos y tamaños fijos. Una secuencia más larga que su rango
    se corta; una más corta queda, pero sin historias vacías. Un fondo por historia."""
    salida = {}
    for largo in LARGOS:
        historias = []
        for h in (data.get("secuencias") or {}).get(largo) or []:
            if not isinstance(h, list):
                continue
            bloques = [x for x in (_bloque(b, dibujos_ok, fondos_ok) for b in h[:9]) if x]
            fondo = next((x for x in bloques if x["tipo"] == "fondo"), None)
            bloques = [x for x in bloques if x["tipo"] != "fondo"][:8]
            if bloques:
                historias.append(bloques + ([fondo] if fondo else []))
        salida[largo] = historias[: RANGO_LARGO[largo][1]]
    return salida


# --- edición a mano

MAX_HISTORIAS_EDITADA = 20
MAX_TRAZOS = 80
MAX_FIGURAS = 30
MAX_PUNTOS_TRAZO = 20_000   # caracteres del camino de un trazo (el editor corta en 18.000)
MAX_BYTES_EDITADA = 600_000
COLORES = ("rojo", "negro", "blanco")
FIGURAS = ("rect", "circ", "linea", "flecha", "nota")
_CAMINO = re.compile(r"M[\d.\s]+(?:L[\d.\s]+)*")


def _coord(v, minimo: float = 0, maximo: float = 1000) -> float:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return minimo
    return round(min(maximo, max(minimo, x)), 1) if x == x else minimo  # x != x es NaN


def _trazo(t) -> dict | None:
    if not isinstance(t, dict):
        return None
    d = " ".join(str(t.get("d") or "").split())
    if not d or len(d) > MAX_PUNTOS_TRAZO or not _CAMINO.fullmatch(d):
        return None
    return {"d": d, "color": t.get("color") if t.get("color") in COLORES else "rojo"}


def _figura(f) -> dict | None:
    if not isinstance(f, dict) or f.get("tipo") not in FIGURAS:
        return None
    x, y = _coord(f.get("x")), _coord(f.get("y"))
    w, h = _coord(f.get("w"), 10, max(10, 1000 - x)), _coord(f.get("h"), 10, max(10, 1000 - y))
    salida = {"tipo": f["tipo"], "x": x, "y": y, "w": w, "h": h,
              "color": f.get("color") if f.get("color") in COLORES else "rojo", "relleno": bool(f.get("relleno"))}
    if f["tipo"] == "nota":
        salida["texto"] = str(f.get("texto") or "").strip()[:300]
    return salida


def validar_editada(data, dibujos_ok: dict[int, str] | None = None, fondos_ok=None, n_original: int = 0) -> list[dict]:
    """Las historias editadas a mano, con cada cosa en su forma y su tope. Lo absurdo (más de
    20 historias, un pedido enorme) se rechaza; lo de más dentro de una historia se corta.
    `origen` es la historia de la IA de donde viene (para medir qué cambió), o None si es nueva."""
    historias = data.get("historias") if isinstance(data, dict) else None
    if not isinstance(historias, list) or not historias:
        raise HTTPException(status_code=422, detail="La secuencia tiene que tener al menos una historia.")
    if len(historias) > MAX_HISTORIAS_EDITADA:
        raise HTTPException(status_code=422, detail=f"Una secuencia no puede tener más de {MAX_HISTORIAS_EDITADA} historias.")
    if len(json.dumps(data, ensure_ascii=False)) > MAX_BYTES_EDITADA:
        raise HTTPException(status_code=413, detail="La secuencia editada es demasiado grande.")
    salida, usados = [], set()
    for h in historias:
        if not isinstance(h, dict):
            continue
        bloques = [x for x in (_bloque(b, dibujos_ok) for b in (h.get("bloques") or [])[:12]) if x and x["tipo"] != "fondo"]
        trazos = [x for x in (_trazo(t) for t in (h.get("trazos") or [])[:MAX_TRAZOS]) if x]
        figuras = [x for x in (_figura(f) for f in (h.get("figuras") or [])[:MAX_FIGURAS]) if x]
        try:
            fondo = int(h.get("fondo")) if h.get("fondo") is not None else None
        except (TypeError, ValueError):
            fondo = None
        if fondo not in (fondos_ok or ()):
            fondo = None
        origen = h.get("origen")
        if not isinstance(origen, int) or isinstance(origen, bool) or not 0 <= origen < n_original or origen in usados:
            origen = None
        if not (bloques or trazos or figuras or fondo is not None):
            continue   # una historia vacía no va
        if origen is not None:
            usados.add(origen)
        salida.append({"origen": origen, "bloques": bloques, "trazos": trazos, "figuras": figuras, "fondo": fondo})
    if not salida:
        raise HTTPException(status_code=422, detail="La secuencia quedó vacía.")
    return salida


def guardar_secuencia(secuencia_id: int, data: dict, por: str | None) -> dict:
    """Guarda la secuencia editada, mide qué cambió contra lo que armó la IA y lo deja como
    corrección para las próximas. Devuelve la llamada al día y lo que se aprendió."""
    with db_session:
        s = PizarraSecuencia.get(id=secuencia_id)
        if s is None:
            raise HTTPException(status_code=404, detail="Esa secuencia no existe.")
        original = json.loads(s.original_json or s.historias_json or "[]")
        dibujos_ok = {d.id: d.archivo for d in s.variante.general.llamada.dibujos}
    pedidos = [h.get("fondo") for h in (data or {}).get("historias") or [] if isinstance(h, dict)]
    fotos = fondos.existentes(x for x in pedidos if isinstance(x, int) and not isinstance(x, bool))
    editada = validar_editada(data, dibujos_ok, set(fotos), len(original))
    normales = correcciones.historias_normales(original)
    d = correcciones.diferencias(original, editada,
                                 fondos.descripciones({h["fondo"] for h in editada + normales if h["fondo"] is not None}))
    with db_session:
        s = PizarraSecuencia[secuencia_id]
        v = s.variante
        if not s.original_json:
            s.original_json = s.historias_json   # lo que armó la IA, una sola vez
        s.editada_json = json.dumps(editada, ensure_ascii=False)
        s.editada_por, s.editada_at = por, datetime.utcnow()
        correcciones.registrar(s.id, v.id, v.titulo, s.largo, s.objetivo, v.estructura, original, editada, d, por)
        llamada_id = v.general.llamada.id
    return {"llamada": detalle(llamada_id), "secuencia": secuencia_id,
            "cambios": correcciones.lo_que_cambiaste(d), "usa": correcciones.lo_que_usa(d), "aprobada": d["aprobada"]}


def generar_secuencias(variante_id: int, objetivos: dict | None = None) -> dict:
    """Las tres secuencias (corta, media, larga) de una variante de historias aprobada.
    `objetivos` puede fijar el objetivo de cada largo; si no, va el de siempre."""
    objetivos = {k: v for k, v in (objetivos or {}).items() if k in LARGOS and v in OBJETIVOS}
    with db_session:
        v = PizarraVariante.get(id=variante_id)
        if v is None:
            raise HTTPException(status_code=404, detail="Esa idea no existe.")
        if v.canal != "story" or v.estado != "aprobada":
            raise HTTPException(status_code=409, detail="Las secuencias salen de una idea de historias aprobada.")
        llamada_id = v.general.llamada.id
    _en_segundo_plano(f"secuencias:{variante_id}", _generar_secuencias, variante_id, {**OBJETIVO_POR_LARGO, **objetivos})
    return detalle(llamada_id)


def _generar_secuencias(variante_id: int, objetivos: dict) -> None:
    ctx = contexto()
    voz_juan.voz()  # se lee antes de abrir la sesión: si el classroom falla, no anula la transacción de Ops
    todas = estructuras.activas()
    with db_session:
        llamada_id = PizarraVariante[variante_id].general.llamada.id
    dibujos.completar_descripciones(llamada_id)  # fuera de la sesión: llama a Claude
    # Lo que Juan corrigió en secuencias anteriores va junto a su voz; los fondos que ya eligió
    # se ofrecen primero.
    corregido = correcciones.bloque()
    preferidas = correcciones.fondos_elegidos()
    fotos = fondos.para_ia(preferidas)
    fondos_texto = fondos.bloque_para_ia(fotos)
    with db_session:
        v = PizarraVariante[variante_id]
        g = v.general
        de_la_llamada = dibujos.para_ia(g.llamada.id)
        idea = f"{g.titulo} {g.detalle or ''} {g.cita or ''} {v.titulo} {v.detalle or ''}"
        cerca_de = dibujos._segundos(g.minuto)
        # Sin llamada no hay frase de Juan: la línea no va vacía, porque una cita en blanco
        # es justo la invitación a que Claude invente una.
        de_donde = (f"\n\n# La idea general\n{g.titulo}\n{g.detalle or ''}"
                    + (f"\nFrase de Juan ({g.minuto or 's/m'}): \"{g.cita}\"" if g.cita else ""))
        prompt = ("# Guía: cómo arma Juan sus secuencias\n" + guia_secuencias()
                  + "\n\n# Lo fijo de la marca\n" + _contexto_texto(ctx) + corregido
                  + de_donde
                  + f"\n\n# La idea de historias aprobada\n{v.titulo}\n{v.detalle or ''}"
                  + _estructura_texto(todas.get(v.estructura or ""))
                  + _dibujos_texto(de_la_llamada, dibujos_de_la_idea(de_la_llamada, idea, cerca_de))
                  + fondos_texto
                  + "\n\n# Objetivo de cada secuencia\n" + "\n".join(f"- {l}: {OBJETIVOS[objetivos[l]]}" for l in LARGOS))
    secuencias = validar_secuencias(_claude(SYSTEM_SECUENCIAS, prompt, 8000), {d["id"]: d["src"] for d in de_la_llamada},
                                    {f["id"] for f in fotos})
    secuencias = asegurar_dibujos(secuencias, de_la_llamada, idea, cerca_de)
    with db_session:
        v = PizarraVariante[variante_id]
        for s in list(v.secuencias):
            s.delete()
        for largo in LARGOS:
            if secuencias[largo]:
                PizarraSecuencia(variante=v, largo=largo, objetivo=objetivos[largo],
                                 historias_json=json.dumps(secuencias[largo], ensure_ascii=False))
