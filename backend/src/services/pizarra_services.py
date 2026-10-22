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
from src.services import estructuras_services as estructuras
from src.services import voz_juan_services as voz_juan

logger = logging.getLogger("atv_ops.pizarra")

MODELO = config("PIZARRA_MODEL", default="claude-sonnet-5-5")
TIMEOUT_S = int(config("PIZARRA_TIMEOUT", default="420"))
# De quién son las citas: si en la transcripción aparece alguien con este nombre, la cita
# tiene que ser suya.
VOCERO = config("PIZARRA_VOCERO", default="Juan")
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
_QUIEN = re.compile(r"^([A-ZÁÉÍÓÚÑa-záéíóúñ][\w .'áéíóúñÁÉÍÓÚÑ-]{0,58}?):\s+")


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


def es_del_vocero(quien: str | None, segs: list[dict]) -> bool:
    voceros = {s["quien"] for s in segs if s["quien"] and VOCERO.lower() in s["quien"].lower()}
    if not voceros:
        return True  # transcripción sin nombres: no hay cómo saberlo
    return quien in voceros


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
    return crear(texto, call.get("title"), por, fuente="fathom", url=pagina, fecha=fecha, tipo=tipo)


# ------------------------------------------------------------------ cómo se devuelve

def _duracion(ll: PizarraLlamada) -> int | None:
    marcas = re.findall(r"^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?", ll.transcripcion or "", re.M)
    if not marcas:
        return None
    h, m, s = marcas[-1]
    total = int(h) * 60 + int(m) if s else int(h)
    return total or None


def _dict_secuencia(s: PizarraSecuencia) -> dict:
    return {"id": s.id, "largo": s.largo, "objetivo": s.objetivo, "historias": json.loads(s.historias_json or "[]")}


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
    }


def _dict_llamada(ll: PizarraLlamada, completa: bool = False) -> dict:
    d = {
        "id": ll.id, "tipo": ll.tipo, "titulo": ll.titulo, "fecha": ll.fecha.isoformat() if ll.fecha else None,
        "fuente": ll.fuente, "url": ll.url, "minutos": _duracion(ll), "creadoAt": ll.creado_at.isoformat(),
        "estado": "armando" if f"general:{ll.id}" in _en_curso else ll.estado, "error": ll.error,
    }
    if completa:
        d["generales"] = [_dict_general(g) for g in sorted(ll.generales, key=lambda g: g.id) if g.estado != "descartada"]
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
- "titulo": la idea en una frase corta, escrita como la escribiría Juan.
- "detalle": de 2 a 4 frases escritas por Juan en primera persona, con su voz, contándole a su audiencia la idea y por qué le importa. Nada de "Juan cuenta que…" ni tercera persona: es él el que escribe.
- "dolor": a qué dolor de la audiencia apunta. Si coincide con uno de la lista, usá ese texto.
- No repitas las ideas que te paso como ya usadas.

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"ideas": [{"titulo": "...", "detalle": "...", "dolor": "...", "cita": "..."}]}""" % {"n": 5}

IDEAS_POR_LLAMADA = 5

SYSTEM_VARIANTES = MARCA + """

Te paso una idea general aprobada por Juan (con la frase de la llamada de donde salió), un tramo de la llamada y lo fijo de la marca.
Tu trabajo: bajarla a variantes por canal. Todas cuentan la misma idea general, cada una con un ángulo distinto, para que la narrativa sea una sola.

- yt: %(n)s ideas de video de YouTube. "titulo": el título del video. "detalle": el ángulo y qué se lleva el que lo mira, en 1 o 2 frases.
- reel: %(n)s ideas de reel. "titulo": el gancho (lo primero que se dice o se lee). "detalle": de qué va, en 1 o 2 frases.
- story: %(n)s ideas de secuencia de historias. Cada una se arma sobre UNA de las "Estructuras de historias de Juan" que te paso: son las que Juan usa de verdad, sacadas de sus secuencias; no inventes otras. Usá estructuras distintas entre las ideas cuando la idea lo permita, y preferí las que más respuestas traen si le sirven a la idea. "estructura": la clave. "titulo": de qué va la secuencia. "detalle": cómo baja la idea a esa estructura: con qué arranca y qué le pide a la gente al final.

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"yt": [{"titulo": "...", "detalle": "..."}], "reel": [...], "story": [{"titulo": "...", "detalle": "...", "estructura": "clave"}]}"""


def _contexto_texto(ctx: dict) -> str:
    nombres = {"dolores": "Dolores de la audiencia", "objeciones": "Objeciones de la audiencia",
               "diferenciales": "Diferenciales de la marca", "narrativa": "Narrativa actual"}
    texto = "\n\n".join(f"## {nombres[k]}\n{(ctx[k]['texto'] or '(todavía no cargado)').strip()}" for k in CONTEXTO)
    voz = voz_juan.bloque()  # del cerebro del classroom: todo lo que escribe la pizarra va en la voz de Juan
    return texto + ("\n\n" + voz if voz else "")


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
    return {"titulo": titulo, "detalle": _limpio(data.get("detalle"), 1500) or None,
            "dolor": _limpio(data.get("dolor"), 200) or None, "cita": lugar["texto"][:600], "minuto": lugar["ts"]}


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


def validar_variantes(data: dict, estructuras: set[str] | None = None) -> dict[str, list[dict]]:
    """Las variantes que se pueden guardar. Una idea de historias sin una estructura real
    de Juan (de las activas) no entra."""
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
        ll.estado, ll.error = "armando", None
    _en_segundo_plano(f"general:{llamada_id}", _generar_general, llamada_id)
    return detalle(llamada_id)


def _generar_general(llamada_id: int) -> None:
    ctx = contexto()
    voz_juan.voz()  # se lee antes de abrir la sesión: si el classroom falla, no anula la transacción de Ops
    with db_session:
        ll = PizarraLlamada[llamada_id]
        usadas = [g.titulo for g in ll.generales]
        prompt = ("# Lo fijo de la marca\n" + _contexto_texto(ctx)
                  + ("\n\n# Ideas generales ya usadas de esta llamada\n" + "\n".join(f"- {t}" for t in usadas) if usadas else "")
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
            ll.estado, ll.error = "error", "Claude no encontró frases de Juan en esta llamada para apoyar las ideas. Revisá que en la transcripción figure quién habla."
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
        llamada_id = g.llamada.id
    _en_segundo_plano(f"variantes:{general_id}", _generar_variantes, general_id)
    return detalle(llamada_id)


def _generar_variantes(general_id: int) -> None:
    ctx = contexto()
    voz_juan.voz()  # se lee antes de abrir la sesión: si el classroom falla, no anula la transacción de Ops
    catalogo, claves = estructuras.catalogo_texto(), set(estructuras.activas())
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
        ll.delete()
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
- {"tipo": "grafico", "texto": "..."}  — el gráfico dibujado a mano en rojo (curva de retención, antes y después, barras): qué muestra.

Los recursos visuales son de Juan, no decoración: usalos como los usa él (están en la guía), no en todas las historias.

No inventes resultados, cifras ni nombres de clientes: si hace falta un caso, poné el hueco de imagen ("captura del resultado de un cliente, a elegir") y el texto sin cifras inventadas. Las cifras de Juan que están en la guía o en la frase sí se pueden usar.
Si la secuencia pide la palabra, la palabra es una sola, en mayúscula, y es la misma en las tres secuencias.

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"palabra": "NIVELES" | null, "secuencias": {"corta": [[bloque, ...], ...], "media": [...], "larga": [...]}}"""


def guia_secuencias() -> str:
    """La guía editable del cerebro; si todavía no se sembró, la del repo."""
    from src.services.cerebro_services import CEREBRO_DIR, SEMILLA_DIR

    for base in (CEREBRO_DIR, SEMILLA_DIR):
        ruta = base / "marketing" / "secuencias-historias.md"
        if ruta.exists():
            return ruta.read_text(encoding="utf-8")
    return ""


def validar_secuencias(data: dict) -> dict[str, list[list[dict]]]:
    """Las secuencias con bloques de tipos y tamaños fijos. Una secuencia más larga que su rango
    se corta; una más corta queda, pero sin historias vacías."""
    salida = {}
    for largo in LARGOS:
        historias = []
        for h in (data.get("secuencias") or {}).get(largo) or []:
            if not isinstance(h, list):
                continue
            bloques = []
            for b in h[:8]:
                if not isinstance(b, dict):
                    continue
                texto = str(b.get("texto") or "").strip()[:500]
                if not texto and b.get("tipo") != "flecha":
                    continue
                tipo = b.get("tipo")
                if tipo == "imagen":
                    marcas = [_limpio(m, 40) for m in b.get("marcas") or [] if isinstance(m, str) and _limpio(m, 40)][:5]
                    bloques.append({"tipo": "imagen", "texto": _limpio(texto, 200), **({"marcas": marcas} if marcas else {})})
                elif tipo == "flecha":
                    bloques.append({"tipo": "flecha", "color": "blanca" if b.get("color") == "blanca" else "roja", "texto": _limpio(texto, 60)})
                elif tipo == "diagrama":
                    pasos = [_limpio(x, 40) for x in re.split(r"\s*(?:→|->)\s*", texto) if _limpio(x, 40)][:7]
                    if len(pasos) >= 2:
                        bloques.append({"tipo": "diagrama", "texto": " → ".join(pasos), "ciclo": bool(b.get("ciclo"))})
                elif tipo == "grafico":
                    bloques.append({"tipo": "grafico", "texto": _limpio(texto, 160)})
                else:
                    tam = b.get("tamano") if b.get("tamano") in TAMANOS else "n"
                    bloques.append({"tipo": "texto", "tamano": tam, "texto": "\n".join(" ".join(l.split()) for l in texto.splitlines())})
            if bloques:
                historias.append(bloques)
        salida[largo] = historias[: RANGO_LARGO[largo][1]]
    return salida


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
        v = PizarraVariante[variante_id]
        g = v.general
        prompt = ("# Guía: cómo arma Juan sus secuencias\n" + guia_secuencias()
                  + "\n\n# Lo fijo de la marca\n" + _contexto_texto(ctx)
                  + f"\n\n# La idea general\n{g.titulo}\n{g.detalle or ''}\nFrase de Juan ({g.minuto or 's/m'}): \"{g.cita or ''}\""
                  + f"\n\n# La idea de historias aprobada\n{v.titulo}\n{v.detalle or ''}"
                  + _estructura_texto(todas.get(v.estructura or ""))
                  + "\n\n# Objetivo de cada secuencia\n" + "\n".join(f"- {l}: {OBJETIVOS[objetivos[l]]}" for l in LARGOS))
    secuencias = validar_secuencias(_claude(SYSTEM_SECUENCIAS, prompt, 8000))
    with db_session:
        v = PizarraVariante[variante_id]
        for s in list(v.secuencias):
            s.delete()
        for largo in LARGOS:
            if secuencias[largo]:
                PizarraSecuencia(variante=v, largo=largo, objetivo=objetivos[largo],
                                 historias_json=json.dumps(secuencias[largo], ensure_ascii=False))
