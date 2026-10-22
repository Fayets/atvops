"""
Los dibujos de Juan en la llamada: lo que dibuja en la pizarra (Miro, embudos, cuentas)
sacado del video, para usarlo como imagen real en las historias.

Sin IA: es medir píxeles.
- Fathom sirve el video de un link de compartir en trozos de 6 s (HLS). No se baja entero:
  se mira el primer cuadro de un trozo cada `PASO_S` segundos, achicado y en grises.
- Un cuadro es pizarra cuando, dejando afuera la barra del navegador y las franjas negras
  de Zoom, casi todo lo que se ve es fondo claro. La "tinta" es lo que no es fondo: los trazos.
- Los dibujos se van completando: de cada tramo de pizarra queda el cuadro con más tinta.
  Si la tinta cae a menos de la mitad, borró y empezó otro dibujo. Con demasiada tinta
  es un documento con texto, no un dibujo.
- Juan vuelve al mismo tablero, lo corre y le agrega cosas: si los trazos de un dibujo ya
  están (corridos o no) en otro, queda solo el más completo.
- De cada dibujo se guarda la captura en grande y lo que Juan decía en ese momento.
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import HTTPException
from pony.orm import db_session

from src.models import PizarraDibujo, PizarraLlamada

logger = logging.getLogger("atv_ops.dibujos")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
CARPETA = DATA_DIR / "pizarra" / "dibujos"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"
PASO_S = 30           # cada cuánto se mira un cuadro
HILOS = 2              # el VPS es chico: más ffmpeg a la vez lo dejan sin memoria
W, H = 160, 90        # tamaño del cuadro que se mide
FONDO = 200           # gris a partir del cual un píxel es fondo claro
NEGRO = 40            # por debajo es franja negra de Zoom
MIN_PIZARRA = 0.80    # de lo que no es franja negra, cuánto tiene que ser fondo claro
MIN_VISIBLE = 0.30    # cuánto del cuadro no es franja negra
MIN_TINTA = 0.004     # una pizarra en blanco no es un dibujo
MAX_TINTA = 0.07      # más que esto es un documento con texto, no un dibujo
CORTE_TINTA = 0.5     # si la tinta cae a menos de la mitad, es otro dibujo
MAX_DIBUJOS = 12
MISMO_TABLERO = 0.5   # parte de los trazos compartidos para que sea el mismo tablero
MISMO_CORRIMIENTO = 6 # celdas que el tablero puede estar corrido

_lock = threading.Lock()
_en_curso: set[int] = set()


# ------------------------------------------------------------------ video

def _get(url: str, timeout: int = 30) -> str:
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout).read().decode()


def trozos_fathom(pagina: str) -> list[tuple[float, str]]:
    """[(segundo de inicio, url del trozo)] del video de un link de compartir de Fathom."""
    m = re.search(r'data-page="([^"]+)"', _get(pagina))
    import html as _html

    props = json.loads(_html.unescape(m.group(1))).get("props") or {} if m else {}
    video = (props.get("call") or {}).get("video_url") or ""
    if not video:
        raise RuntimeError("Fathom no muestra el video de este link.")
    base = "https://fathom.video"
    lista, t, dur = [], 0.0, 0.0
    for linea in _get(video if video.startswith("http") else base + video).splitlines():
        if linea.startswith("#EXTINF:"):
            dur = float(linea[8:].split(",")[0])
        elif linea and not linea.startswith("#"):
            lista.append((t, linea if linea.startswith("http") else base + linea))
            t += dur
    return lista


def _cuadro(url: str, ancho: int | None = None, destino: Path | None = None) -> bytes | None:
    """El primer cuadro del trozo: en grises y chico para medir, o en jpg grande para guardar."""
    if destino is not None:
        cmd = ["ffmpeg", "-loglevel", "error", "-y", "-threads", "1", "-user_agent", UA, "-i", url, "-frames:v", "1",
               "-vf", f"scale={ancho or 1280}:-2", "-q:v", "3", str(destino)]
    else:
        cmd = ["ffmpeg", "-loglevel", "error", "-threads", "1", "-user_agent", UA, "-i", url, "-frames:v", "1",
               "-vf", f"scale={W}:{H},format=gray", "-f", "rawvideo", "-"]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=90)
    except (subprocess.TimeoutExpired, OSError):
        return None
    return r.stdout if destino is None else (b"ok" if destino.exists() else None)


def medir(raw: bytes) -> dict | None:
    """Cuánto del cuadro es pizarra y cuánta tinta tiene. Se deja afuera la barra de arriba
    (navegador y la cámara de Zoom) y un margen a los costados (herramientas de Miro)."""
    if not raw or len(raw) < W * H:
        return None
    zona = [raw[y * W + x] for y in range(int(H * 0.16), int(H * 0.95)) for x in range(int(W * 0.06), int(W * 0.94))]
    visibles = [p for p in zona if p > NEGRO]
    if not zona or len(visibles) / len(zona) < MIN_VISIBLE:
        return {"pizarra": False, "tinta": 0.0}
    claros = sum(1 for p in visibles if p >= FONDO) / len(visibles)
    tinta = sum(1 for p in visibles if p < 170) / len(visibles)
    return {"pizarra": claros >= MIN_PIZARRA, "tinta": round(tinta, 4), "trazos": _trazos(raw)}


CELDA = 4  # la grilla de trazos: celdas de 4×4 píxeles del cuadro medido


def _trazos(raw: bytes) -> frozenset[tuple[int, int]]:
    """Qué celdas de la zona útil tienen trazo (ni fondo ni franja negra)."""
    celdas = set()
    for y in range(int(H * 0.16), int(H * 0.95)):
        for x in range(int(W * 0.06), int(W * 0.94)):
            p = raw[y * W + x]
            if NEGRO < p < 170:
                celdas.add((x // CELDA, y // CELDA))
    return frozenset(celdas)


def contenido(a: frozenset, b: frozenset, corrimiento: int = 3) -> float:
    """Cuánto de los trazos de `a` aparece en `b`, permitiendo que el tablero esté corrido."""
    if not a:
        return 1.0
    mejor = 0
    for dx in range(-corrimiento, corrimiento + 1):
        for dy in range(-corrimiento, corrimiento + 1):
            mejor = max(mejor, sum(1 for (x, y) in a if (x + dx, y + dy) in b))
    return mejor / len(a)


def elegir(muestras: list[tuple[float, str, dict | None]]) -> list[tuple[float, str, float]]:
    """De los cuadros medidos, el más completo de cada dibujo: [(segundo, url, cuándo empezó)].
    La imagen es la del momento más completo; lo que decía Juan se toma de cuando lo dibujó."""
    dibujos, actual = [], None  # actual = [mejor_tinta, segundo, url, trazos]
    for t, url, m in muestras:
        if not m or not m["pizarra"]:
            if actual:
                dibujos.append(actual)
            actual = None
            continue
        if actual and m["tinta"] < actual[0] * CORTE_TINTA:
            dibujos.append(actual)  # borró: empieza otro
            actual = None
        if m["tinta"] > MAX_TINTA:
            continue  # un documento con texto en pantalla
        if actual is None:
            actual = [m["tinta"], t, url, m.get("trazos") or frozenset(), t]
        elif m["tinta"] >= actual[0]:
            actual[:4] = [m["tinta"], t, url, m.get("trazos") or frozenset()]
    if actual:
        dibujos.append(actual)
    dibujos = [d for d in dibujos if MIN_TINTA <= d[0] <= MAX_TINTA]
    # Sin repetidos: los que comparten la mitad de los trazos (aunque el tablero esté corrido)
    # son el mismo tablero, y queda el último, que es el más completo: Juan va sumando.
    grupo = list(range(len(dibujos)))

    def raiz(i: int) -> int:
        while grupo[i] != i:
            i = grupo[i]
        return i

    for i in range(len(dibujos)):
        for j in range(i + 1, len(dibujos)):
            a, b = dibujos[i][3], dibujos[j][3]
            if max(contenido(a, b, MISMO_CORRIMIENTO), contenido(b, a, MISMO_CORRIMIENTO)) >= MISMO_TABLERO:
                grupo[raiz(j)] = raiz(i)
    ultimos: dict[int, list] = {}
    primero: dict[int, float] = {}
    for i, d in enumerate(dibujos):
        r = raiz(i)
        primero[r] = min(primero.get(r, d[4]), d[4])
        if r not in ultimos or d[1] > ultimos[r][1]:
            ultimos[r] = d
    salida = sorted(((d[1], d[2], primero[r]) for r, d in ultimos.items()), key=lambda x: x[0])
    return salida[:MAX_DIBUJOS]


# ------------------------------------------------------------------ lo que decía

def _segundos(ts: str | None) -> int | None:
    if not ts:
        return None
    partes = [int(p) for p in ts.split(":") if p.isdigit()]
    if len(partes) == 2:
        return partes[0] * 60 + partes[1]
    if len(partes) == 3:
        return partes[0] * 3600 + partes[1] * 60 + partes[2]
    return None


def dicho_en(transcripcion: str, segundo: float, antes: int = 75, despues: int = 15) -> str:
    """Lo que se dijo alrededor de ese momento, con quién lo dijo."""
    from src.services.pizarra_services import segmentos

    ini, fin = segundo - antes, segundo + despues
    con_tiempo = [(t, s) for s in segmentos(transcripcion) if (t := _segundos(s["ts"])) is not None]
    # También la intervención que ya venía hablando cuando empieza el tramo: hay transcripciones
    # con intervenciones largas que arrancan antes del dibujo.
    # Si esa intervención es larga, se toma desde la parte que cae en el tramo, a ritmo parejo.
    lineas = []
    for i, (t, seg) in enumerate(con_tiempo):
        texto = seg["texto"]
        if t < ini and i + 1 < len(con_tiempo) and con_tiempo[i + 1][0] >= ini:
            palabras, dura = texto.split(), max(1, con_tiempo[i + 1][0] - t)
            texto = " ".join(palabras[int(len(palabras) * (ini - t) / dura):])
        elif not ini <= t <= fin:
            continue
        if texto:
            lineas.append(f"{seg['quien'] or ''}: {texto}".strip(": "))
    return " ".join(lineas)[:900]


def minuto(segundo: int) -> str:
    h, r = divmod(int(segundo), 3600)
    m, s = divmod(r, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


# ------------------------------------------------------------------ búsqueda

def buscar(llamada_id: int) -> None:
    """Arranca la búsqueda en segundo plano. Solo hay video para las llamadas de Fathom."""
    with db_session:
        ll = PizarraLlamada.get(id=llamada_id)
        if ll is None:
            raise HTTPException(status_code=404, detail="Esa llamada no está en la pizarra.")
        if ll.fuente != "fathom" or not (ll.url or "").startswith("https://fathom.video/share/"):
            ll.dibujos_estado, ll.dibujos_error = "sin_video", None
            return
        ll.dibujos_estado, ll.dibujos_error = "buscando", None
    with _lock:
        if llamada_id in _en_curso:
            return
        _en_curso.add(llamada_id)
    threading.Thread(target=_buscar, args=(llamada_id,), daemon=True).start()


def _buscar(llamada_id: int) -> None:
    try:
        with db_session:
            ll = PizarraLlamada[llamada_id]
            pagina, transcripcion = ll.url, ll.transcripcion
        trozos = trozos_fathom(pagina)
        paso = max(1, round(PASO_S / 6))
        elegidos = trozos[::paso]
        with ThreadPoolExecutor(HILOS) as pool:
            medidas = list(pool.map(lambda c: medir(_cuadro(c[1])), elegidos))
        dibujos = elegir([(t, url, m) for (t, url), m in zip(elegidos, medidas)])
        carpeta = CARPETA / str(llamada_id)
        carpeta.mkdir(parents=True, exist_ok=True)
        nuevos = []
        for t, url, inicio in dibujos:
            destino = carpeta / f"{int(t)}.jpg"
            if _cuadro(url, ancho=1280, destino=destino):
                # Lo que decía mientras lo dibujaba: desde que apareció el tablero hasta el cuadro elegido.
                dicho = dicho_en(transcripcion, t, antes=int(t - inicio) + 60, despues=15) if t - inicio < 600 else dicho_en(transcripcion, inicio + 90, antes=90, despues=60)
                nuevos.append((int(t), f"/uploads/pizarra/dibujos/{llamada_id}/{destino.name}", dicho))
        descripciones = describir([CARPETA / str(llamada_id) / Path(a).name for _, a, _ in nuevos])
        with db_session:
            ll = PizarraLlamada[llamada_id]
            for d in list(ll.dibujos):
                d.delete()
            for seg, archivo, dicho in nuevos:
                PizarraDibujo(llamada=ll, segundo=seg, archivo=archivo, dicho=dicho or None,
                              descripcion=descripciones.get(Path(archivo).name))
            ll.dibujos_estado, ll.dibujos_error = "listos", None
        logger.info("Dibujos: llamada %s, %s trozos mirados, %s dibujos", llamada_id, len(elegidos), len(nuevos))
    except Exception as e:  # noqa: BLE001 — queda escrito en la llamada
        logger.exception("Dibujos: falló la llamada %s", llamada_id)
        with db_session:
            ll = PizarraLlamada.get(id=llamada_id)
            if ll is not None:
                ll.dibujos_estado, ll.dibujos_error = "error", str(e)[:300]
    finally:
        _en_curso.discard(llamada_id)


SYSTEM_DESCRIBIR = """Te paso capturas de una llamada de Juan Carrizo (ATV) en las que dibuja en una pizarra (Miro).
Leelas con la herramienta Read, una por una. Para cada una decí en una línea QUÉ dibujó, con los números y las palabras que se leen tal cual: "embudo en rojo: 2000 → 1000 R → 1600 chats → 1000 conv → 30 agendas → 20 cierres → $12k/cc", "una planta: la idea = 21k, semillas en la maceta, 30%/40%". Ignorá la barra del navegador, las herramientas de Miro y la cámara de Zoom. No interpretes ni opines.
Devolvé SOLO un objeto JSON: {"dibujos": [{"archivo": "nombre.jpg", "que": "..."}]}"""


def describir(fotos: list[Path]) -> dict[str, str]:
    """Qué muestra cada dibujo, en una línea. Si Claude no está, quedan sin descripción."""
    fotos = [f for f in fotos if f.exists()]
    if not fotos:
        return {}
    from src.services import narrativa_services as nv

    try:
        data = nv._claude("Capturas:\n" + "\n".join(str(f) for f in fotos), [str(f) for f in fotos],
                          system=SYSTEM_DESCRIBIR, carpeta=CARPETA)
    except Exception as e:  # noqa: BLE001 — sin descripción igual sirven
        logger.info("Dibujos: no se pudieron describir: %s", str(e)[:200])
        return {}
    nombres = {f.name for f in fotos}
    return {str(x.get("archivo")): " ".join(str(x.get("que") or "").split())[:400]
            for x in data.get("dibujos") or [] if isinstance(x, dict) and x.get("archivo") in nombres and x.get("que")}


def completar_descripciones(llamada_id: int) -> None:
    """Describe los dibujos que todavía no tienen descripción (los encontrados antes de que
    existiera este paso)."""
    with db_session:
        ll = PizarraLlamada.get(id=llamada_id)
        faltan = [d for d in ll.dibujos if d.estado == "visible" and not d.descripcion] if ll else []
        rutas = {d.id: CARPETA / str(llamada_id) / Path(d.archivo).name for d in faltan}
    if not rutas:
        return
    hechas = describir(list(rutas.values()))
    with db_session:
        for dib_id, ruta in rutas.items():
            d = PizarraDibujo.get(id=dib_id)
            if d is not None and hechas.get(ruta.name):
                d.descripcion = hechas[ruta.name]


def buscando(llamada_id: int) -> bool:
    return llamada_id in _en_curso


def estado(ll) -> tuple[str | None, str | None]:
    """El estado de la búsqueda. Si el backend se reinició a mitad de camino, la base dice
    "buscando" pero nadie está buscando: queda como error para poder reintentar."""
    if buscando(ll.id):
        return "buscando", None
    if ll.dibujos_estado == "buscando":
        return "error", "La búsqueda se cortó (se reinició el servidor). Volvé a buscar."
    return ll.dibujos_estado, ll.dibujos_error


def descartar(dibujo_id: int, estado: str) -> int:
    if estado not in ("visible", "descartado"):
        raise HTTPException(status_code=422, detail="Se muestra o se descarta.")
    with db_session:
        d = PizarraDibujo.get(id=dibujo_id)
        if d is None:
            raise HTTPException(status_code=404, detail="Ese dibujo no existe.")
        d.estado = estado
        return d.llamada.id


def para_ia(llamada_id: int) -> list[dict]:
    """Los dibujos visibles de la llamada, para que Claude los use en las secuencias."""
    with db_session:
        ll = PizarraLlamada.get(id=llamada_id)
        if ll is None:
            return []
        return [{"id": d.id, "minuto": minuto(d.segundo), "dicho": d.dicho or "", "src": d.archivo, "descripcion": d.descripcion or ""}
                for d in sorted(ll.dibujos, key=lambda d: d.segundo) if d.estado == "visible"]
