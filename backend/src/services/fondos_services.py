"""
Banco de fondos de las historias: el álbum compartido de Google Photos de ATV.

- El álbum se lee como lo ve cualquiera con el link: la página trae cada foto como
  "https://lh3.googleusercontent.com/pw/…",ancho,alto. No hay API ni cuenta de por medio.
- Sincronizar suma las fotos nuevas y deja inactivas las que salieron del álbum. Nunca se
  borra una: una secuencia editada puede estar usándola de fondo.
- Cada foto se describe una sola vez con Claude (qué se ve, oscura o clara) para buscarla
  y para que la pizarra pueda proponerla de fondo. Sin Claude quedan sin descripción y se
  listan igual.
- Los tamaños los da lh3 con parámetros al final de la dirección (=w360-h640-c, =w1080).
"""

from __future__ import annotations

import logging
import re
import threading
import unicodedata
import urllib.request
from datetime import datetime
from pathlib import Path

from decouple import config
from pony.orm import db_session

from src.models import FondoFoto

logger = logging.getLogger("atv_ops.fondos")

ALBUM_URL = config(
    "FONDOS_ALBUM_URL",
    default="https://photos.google.com/share/AF1QipPHX7BW43WvUsB0rHZlMC6JabOAvL0HCbg2cONNZFx1uZ-CK80Smywjm1YWDqHb0g"
            "?key=dDJxeVFlUTJQWE9sV2tXWFU2OWpBN3VMOGd1bHZn",
)
CARPETA = Path(__file__).resolve().parents[2] / "data" / "fondos"
# Google sirve la versión liviana del álbum (sin las fotos) a lo que no parece un navegador.
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
_FOTO = re.compile(r'"(https://lh3\.googleusercontent\.com/pw/[A-Za-z0-9_\-]+)",(\d+),(\d+)')

MINIATURA = "=w360-h640-c"   # recortada a 9:16, como la tarjeta
GRANDE = "=w1080"
PARA_CLAUDE = "=w512"        # alcanza para decir qué se ve y pesa poco
POR_TANDA = 10               # fotos por pedido a Claude
POR_VUELTA = 30              # fotos que se describen en cada pasada del programador
PARA_IA = 60                 # fotos que se le ofrecen a la pizarra al armar secuencias

_describiendo = threading.Lock()


def miniatura(url: str) -> str:
    return url + MINIATURA


def grande(url: str) -> str:
    return url + GRANDE


# ------------------------------------------------------------------ álbum

def leer_album(html: str) -> list[dict]:
    """Las fotos del álbum en el orden en que vienen, sin repetir."""
    vistas, salida = set(), []
    for url, ancho, alto in _FOTO.findall(html or ""):
        if url in vistas:
            continue
        vistas.add(url)
        salida.append({"url": url, "ancho": int(ancho), "alto": int(alto)})
    return salida


def bajar_album(url: str = ALBUM_URL) -> str:
    pedido = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-AR,es;q=0.9"})
    with urllib.request.urlopen(pedido, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def sincronizar(html: str | None = None) -> dict:
    """Suma las fotos nuevas, reactiva las que volvieron y deja inactivas las que salieron.
    Si la página no trae ninguna foto (Google cambió algo o falló), no toca nada: un álbum
    vacío así no se distingue de un error."""
    fotos = leer_album(html if html is not None else bajar_album())
    if not fotos:
        logger.warning("Fondos: el álbum no trajo fotos; no se tocó nada.")
        return {"total": 0, "nuevas": 0, "inactivas": 0}
    ahora = datetime.utcnow()
    en_album = {f["url"]: f for f in fotos}
    nuevas = inactivas = 0
    with db_session:
        guardadas = {x.url: x for x in FondoFoto.select()}
        for url, f in en_album.items():
            x = guardadas.get(url)
            if x is None:
                FondoFoto(url=url, ancho=f["ancho"], alto=f["alto"], visto_at=ahora)
                nuevas += 1
            else:
                x.activo, x.visto_at, x.ancho, x.alto = True, ahora, f["ancho"], f["alto"]
        for url, x in guardadas.items():
            if url not in en_album and x.activo:
                x.activo = False
                inactivas += 1
    logger.info("Fondos: %s en el álbum, %s nuevas, %s salieron", len(fotos), nuevas, inactivas)
    return {"total": len(fotos), "nuevas": nuevas, "inactivas": inactivas}


# ------------------------------------------------------------------ descripciones

SYSTEM_DESCRIBIR = """Te paso fotos de un álbum de Juan Carrizo (ATV) que se usan de fondo en sus historias de Instagram.
Leelas con la herramienta Read, una por una. Para cada una decí en una línea qué se ve, con palabras que alguien usaría para buscarla: lugar, momento del día, quién está (si es Juan, decí "Juan"), qué hace, objetos, y si la foto es oscura o clara. Si se lee texto o números, copialos tal cual. No interpretes ni opines.
Devolvé SOLO un objeto JSON: {"fotos": [{"archivo": "12.jpg", "que": "..."}]}"""


def _bajar(url: str, destino: Path) -> bool:
    try:
        pedido = urllib.request.Request(url + PARA_CLAUDE, headers={"User-Agent": UA})
        with urllib.request.urlopen(pedido, timeout=40) as r:
            destino.write_bytes(r.read())
        return True
    except OSError as e:
        logger.info("Fondos: no se pudo bajar %s: %s", destino.name, str(e)[:120])
        return False


def describir_nuevas(limite: int = POR_VUELTA) -> int:
    """Describe las fotos activas que todavía no tienen descripción, de a tandas. Devuelve
    cuántas describió. Si Claude no está, no describe ninguna y se reintenta la próxima vez."""
    if not _describiendo.acquire(blocking=False):
        return 0   # ya hay otra pasada describiendo
    try:
        with db_session:
            faltan = [(x.id, x.url) for x in FondoFoto.select(lambda x: x.activo and x.descripcion is None).order_by(FondoFoto.id)[:limite]]
        if not faltan:
            return 0
        from src.services import narrativa_services as nv

        CARPETA.mkdir(parents=True, exist_ok=True)
        hechas = 0
        for i in range(0, len(faltan), POR_TANDA):
            tanda = []
            for foto_id, url in faltan[i:i + POR_TANDA]:
                ruta = CARPETA / f"{foto_id}.jpg"
                if ruta.exists() or _bajar(url, ruta):
                    tanda.append((foto_id, ruta))
            if not tanda:
                continue
            try:
                data = nv._claude("Fotos:\n" + "\n".join(str(r) for _i, r in tanda), [str(r) for _i, r in tanda],
                                  system=SYSTEM_DESCRIBIR, carpeta=CARPETA)
            except Exception as e:  # noqa: BLE001 — sin descripción se listan igual
                logger.info("Fondos: no se pudieron describir: %s", str(e)[:200])
                break
            textos = {str(x.get("archivo")): " ".join(str(x.get("que") or "").split())[:400]
                      for x in data.get("fotos") or [] if isinstance(x, dict) and x.get("que")}
            with db_session:
                for foto_id, ruta in tanda:
                    x = FondoFoto.get(id=foto_id)
                    if x is not None and textos.get(ruta.name):
                        x.descripcion = textos[ruta.name]
                        hechas += 1
        logger.info("Fondos: %s descriptas", hechas)
        return hechas
    finally:
        _describiendo.release()


def tarea() -> None:
    """La pasada del programador: el álbum al día y algunas fotos más descriptas."""
    sincronizar()
    describir_nuevas()


def sincronizar_ahora() -> dict:
    """El botón de la pizarra: el álbum se lee ya; las descripciones siguen en segundo plano."""
    try:
        r = sincronizar()
    except OSError as e:
        from fastapi import HTTPException

        raise HTTPException(status_code=502, detail=f"No se pudo leer el álbum: {str(e)[:160]}") from e
    threading.Thread(target=describir_nuevas, args=(PARA_IA,), daemon=True, name="fondos").start()
    return {**r, **listar()}


# ------------------------------------------------------------------ búsqueda

def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t).split())


def _dict(x: FondoFoto) -> dict:
    return {"id": x.id, "thumb": miniatura(x.url), "url": grande(x.url), "descripcion": x.descripcion,
            "ancho": x.ancho, "alto": x.alto}


def coincide(descripcion: str | None, q: str) -> bool:
    """Todas las palabras buscadas están en la descripción, sin tildes ni mayúsculas."""
    palabras = _norm(q).split()
    if not palabras:
        return True
    texto = _norm(descripcion or "")
    return all(p in texto for p in palabras)


def listar(q: str = "") -> dict:
    with db_session:
        fotos = [x for x in FondoFoto.select(lambda x: x.activo).order_by(FondoFoto.id) if coincide(x.descripcion, q)]
        return {"fotos": [_dict(x) for x in fotos],
                "total": FondoFoto.select(lambda x: x.activo).count(),
                "sinDescribir": FondoFoto.select(lambda x: x.activo and x.descripcion is None).count()}


def existentes(ids) -> dict[int, str]:
    """De esos ids, los que existen, con la foto grande. Una inactiva sigue sirviendo de fondo
    en lo que ya se guardó."""
    ids = {i for i in ids if isinstance(i, int)}
    if not ids:
        return {}
    with db_session:
        return {x.id: grande(x.url) for x in FondoFoto.select(lambda x: x.id in ids)}


def descripciones(ids) -> dict[int, str]:
    ids = {i for i in ids if isinstance(i, int)}
    if not ids:
        return {}
    with db_session:
        return {x.id: x.descripcion or "" for x in FondoFoto.select(lambda x: x.id in ids)}


def para_ia(preferidas: list[int] | None = None, limite: int = PARA_IA) -> list[dict]:
    """Las fotos descriptas que se le ofrecen a la pizarra: primero las que Juan ya eligió de
    fondo, después las más nuevas del álbum."""
    with db_session:
        fotos = list(FondoFoto.select(lambda x: x.activo and x.descripcion is not None))
    orden = {i: k for k, i in enumerate(preferidas or [])}
    fotos.sort(key=lambda x: (orden.get(x.id, len(orden)), -x.id))
    return [{"id": x.id, "descripcion": x.descripcion} for x in fotos[:limite]]


def bloque_para_ia(fotos: list[dict]) -> str:
    """El tramo del pedido con los fondos que da `para_ia`, o "" si todavía no hay ninguno descripto."""
    if not fotos:
        return ""
    filas = "\n".join(f"- fondo {f['id']}: {' '.join(f['descripcion'].split())[:160]}" for f in fotos)
    return ("\n\n# Fondos del álbum de ATV (fotos reales)\n" + filas
            + "\nUna historia puede ir sobre una de estas fotos: sumale el bloque {\"tipo\": \"fondo\", \"foto\": id}. "
              "La foto se oscurece y el texto va en blanco encima. Usá solo ids de esta lista; si ninguna le queda, sin fondo.")
