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
from datetime import date, datetime

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import PizarraContexto, PizarraGeneral, PizarraLlamada, PizarraSecuencia, PizarraVariante
from src.services import activacion_ia_services as ia

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


def ubicar_cita(cita: str, segs: list[dict]) -> dict | None:
    """Dónde está la cita en la transcripción: {ts, quien}, o None si no está tal cual.
    Se compara sin tildes, mayúsculas ni puntuación; una cita puede cruzar dos tramos
    seguidos de la misma persona."""
    buscada = _norm(cita)
    if len(buscada) < 12:
        return None
    unido, inicios = "", []
    for s in segs:
        inicios.append(len(unido))
        unido += _norm(s["texto"]) + " "
    pos = unido.find(buscada)
    if pos < 0:
        return None
    i = max(k for k, ini in enumerate(inicios) if ini <= pos)
    fin = pos + len(buscada)
    tramo = [s for k, s in enumerate(segs) if inicios[k] < fin and k >= i]
    if len({s["quien"] for s in tramo}) > 1:
        return None  # pegó frases de dos personas
    return {"ts": segs[i]["ts"], "quien": segs[i]["quien"]}


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
    titulo = re.sub(r"^\d+[.\s]*", "", re.sub(r"\.txt$", "", nombre or "", flags=re.I)).replace("_", " ").strip()
    return crear(texto, _cabecera(texto)["titulo"] or titulo or None, por, fuente="archivo", tipo=tipo)


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
        "decididoPor": v.decidido_por,
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
        return {"llamadas": [_dict_llamada(l) for l in llamadas], "contexto": contexto()}


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
Escribís como habla Juan: español rioplatense, directo, de vos, sin clickbait vacío, sin emojis, sin frases de manual de marketing."""

SYSTEM_GENERAL = MARCA + """

Juan saca sus mejores ideas de contenido de sus 1 a 1 y clases. Te paso la transcripción de una y lo fijo de la marca.
Tu trabajo: encontrar LA idea general más fuerte del video. Una sola: la que más contenido puede dar en YouTube, Reels e historias, y que más sirve a la narrativa.

Reglas:
- La idea se apoya en UNA frase que dijo Juan. Copiala TEXTUAL de la transcripción, sin corregirla ni resumirla, entre 8 y 40 palabras. Nunca uses frases del cliente ni de otra persona del equipo.
- Nada de datos del cliente (nombre, facturación, negocio): el contenido es de Juan para su audiencia.
- "titulo": la idea en una frase corta, como la diría Juan.
- "detalle": en 2 a 4 frases, qué sostiene la idea y por qué le importa a la audiencia.
- "dolor": a qué dolor de la audiencia apunta. Si coincide con uno de la lista, usá ese texto.
- No repitas las ideas que te paso como ya usadas.

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"titulo": "...", "detalle": "...", "dolor": "...", "cita": "..."}"""

SYSTEM_VARIANTES = MARCA + """

Te paso una idea general aprobada por Juan (con la frase de la llamada de donde salió), un tramo de la llamada y lo fijo de la marca.
Tu trabajo: bajarla a variantes por canal. Todas cuentan la misma idea general, cada una con un ángulo distinto, para que la narrativa sea una sola.

- yt: %(n)s ideas de video de YouTube. "titulo": el título del video. "detalle": el ángulo y qué se lleva el que lo mira, en 1 o 2 frases.
- reel: %(n)s ideas de reel. "titulo": el gancho (lo primero que se dice o se lee). "detalle": de qué va, en 1 o 2 frases.
- story: %(n)s ideas de secuencia de historias. "titulo": de qué va la secuencia. "detalle": con qué arranca y qué le pide a la gente al final (encuesta, caja de preguntas, palabra por DM).

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"yt": [{"titulo": "...", "detalle": "..."}], "reel": [...], "story": [...]}"""


def _contexto_texto(ctx: dict) -> str:
    nombres = {"dolores": "Dolores de la audiencia", "objeciones": "Objeciones de la audiencia",
               "diferenciales": "Diferenciales de la marca", "narrativa": "Narrativa actual"}
    return "\n\n".join(f"## {nombres[k]}\n{(ctx[k]['texto'] or '(todavía no cargado)').strip()}" for k in CONTEXTO)


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
            "dolor": _limpio(data.get("dolor"), 200) or None, "cita": cita, "minuto": lugar["ts"]}


def validar_variantes(data: dict) -> dict[str, list[dict]]:
    salida = {}
    for canal in CANALES:
        items = data.get(canal) if isinstance(data.get(canal), list) else []
        salida[canal] = [{"titulo": _limpio(i.get("titulo"), 300), "detalle": _limpio(i.get("detalle"), 1200) or None}
                         for i in items[:VARIANTES_POR_CANAL + 2] if isinstance(i, dict) and _limpio(i.get("titulo"), 300)]
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
    """Propone la idea general del video. Si había una propuesta sin aprobar, la reemplaza."""
    with db_session:
        ll = PizarraLlamada.get(id=llamada_id)
        if ll is None:
            raise HTTPException(status_code=404, detail="Esa llamada no está en la pizarra.")
        ll.estado, ll.error = "armando", None
    _en_segundo_plano(f"general:{llamada_id}", _generar_general, llamada_id)
    return detalle(llamada_id)


def _generar_general(llamada_id: int) -> None:
    ctx = contexto()
    with db_session:
        ll = PizarraLlamada[llamada_id]
        usadas = [g.titulo for g in ll.generales]
        prompt = ("# Lo fijo de la marca\n" + _contexto_texto(ctx)
                  + ("\n\n# Ideas generales ya usadas de esta llamada\n" + "\n".join(f"- {t}" for t in usadas) if usadas else "")
                  + f"\n\n# La llamada ({'1 a 1' if ll.tipo == '1a1' else 'clase grupal'}): {ll.titulo}\n{_recortar(ll.transcripcion)}")
        segs = segmentos(ll.transcripcion)
    idea = validar_general(_claude(SYSTEM_GENERAL, prompt, 2000), segs)
    with db_session:
        ll = PizarraLlamada[llamada_id]
        if idea is None:
            ll.estado, ll.error = "error", "La idea no traía una frase de Juan que esté tal cual en la llamada. Probá de nuevo."
            return
        for g in list(ll.generales):
            if g.estado == "propuesta":
                g.estado = "descartada"
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
    with db_session:
        g = PizarraGeneral[general_id]
        aprobadas = [f"- ({v.canal}) {v.titulo}" for v in g.variantes if v.estado == "aprobada"]
        prompt = ("# Lo fijo de la marca\n" + _contexto_texto(ctx)
                  + f"\n\n# La idea general aprobada\n{g.titulo}\n{g.detalle or ''}\nDolor: {g.dolor or '-'}\nFrase de Juan ({g.minuto or 's/m'}): \"{g.cita or ''}\""
                  + ("\n\n# Variantes ya aprobadas (no las repitas)\n" + "\n".join(aprobadas) if aprobadas else "")
                  + f"\n\n# La llamada: {g.llamada.titulo}\n{_recortar(g.llamada.transcripcion)}")
    variantes = validar_variantes(_claude(SYSTEM_VARIANTES % {"n": VARIANTES_POR_CANAL}, prompt, 4000))
    with db_session:
        g = PizarraGeneral[general_id]
        for v in list(g.variantes):
            if v.estado != "aprobada" and not v.secuencias:
                v.delete()
        for canal, items in variantes.items():
            for i in items:
                PizarraVariante(general=g, canal=canal, titulo=i["titulo"], detalle=i["detalle"])
        hay = any(variantes.values())
        g.variantes_estado = "listas" if hay else "error"
        g.error = None if hay else "Claude no devolvió variantes. Probá de nuevo."


# --- variantes

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


def borrar(llamada_id: int) -> dict:
    with db_session:
        ll = PizarraLlamada.get(id=llamada_id)
        if ll is None:
            raise HTTPException(status_code=404, detail="Esa llamada no está en la pizarra.")
        if any(g.estado == "aprobada" for g in ll.generales):
            raise HTTPException(status_code=409, detail="Tiene una idea general aprobada: no se borra.")
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

SYSTEM_SECUENCIAS = MARCA + """

Armás secuencias de historias de Instagram para Juan, como los bocetos que hace marketing: una tarjeta vertical por historia con el texto tal cual va en pantalla y el lugar de cada imagen marcado. No diseñás: decís qué va escrito y qué imagen va.

Te paso la guía de cómo arma Juan sus secuencias (sacada de sus historias reales, con números), la idea aprobada, la idea general con la frase de Juan, y lo fijo de la marca. Seguí la guía: el largo, la estructura de cada largo, cómo escribe (minúscula, una idea por línea, punto al final, plata en dólares con k, la frase que importa en negrita) y cómo pide la palabra.

Armá TRES secuencias de la misma idea:
- corta: entre 2 y 4 historias.
- media: entre 5 y 8 historias.
- larga: entre 9 y 13 historias.
El objetivo de cada una te lo digo abajo.

Cada historia es una lista de bloques, en el orden en que se ven de arriba a abajo:
- {"tipo": "texto", "tamano": "g" | "n" | "c", "texto": "..."}  — g grande, n normal, c chico. Marcá la negrita con **así**. Un salto de línea dentro del bloque con \\n.
- {"tipo": "imagen", "texto": "..."}  — qué imagen va ahí, dicho para que el equipo la busque o la arme: "captura del chat de un cliente con su resultado", "mockup del documento", "meme 3 doritos después", "selfie de Juan a cámara de noche".

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
            for b in h[:6]:
                if not isinstance(b, dict):
                    continue
                texto = str(b.get("texto") or "").strip()[:500]
                if not texto:
                    continue
                if b.get("tipo") == "imagen":
                    bloques.append({"tipo": "imagen", "texto": _limpio(texto, 200)})
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
    with db_session:
        v = PizarraVariante[variante_id]
        g = v.general
        prompt = ("# Guía: cómo arma Juan sus secuencias\n" + guia_secuencias()
                  + "\n\n# Lo fijo de la marca\n" + _contexto_texto(ctx)
                  + f"\n\n# La idea general\n{g.titulo}\n{g.detalle or ''}\nFrase de Juan ({g.minuto or 's/m'}): \"{g.cita or ''}\""
                  + f"\n\n# La idea de historias aprobada\n{v.titulo}\n{v.detalle or ''}"
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
