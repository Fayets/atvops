"""
El cerebro: notas markdown por área (general, fulfillment, ventas, marketing, sistemas).

- Las notas "semilla" viven en el repo (backend/cerebro) y se copian a CEREBRO_DIR
  la primera vez (nunca se pisa lo que ya existe: ahí edita el equipo desde Obsidian).
- El sistema escribe solo en fulfillment/pedidos y fulfillment/updates.
- ATV AI pide `contexto(areas, pregunta)`: las notas con `siempre: true` de esas áreas
  más las que coinciden con la pregunta, con tope de caracteres.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import unicodedata
from pathlib import Path

from decouple import config

logger = logging.getLogger("atv_ops.cerebro")

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
SEMILLA_DIR = _BACKEND_ROOT / "cerebro"
CEREBRO_DIR = Path(config("CEREBRO_DIR", default=str(_BACKEND_ROOT / "data" / "cerebro")))
AREAS = ("general", "fulfillment", "ventas", "marketing", "sistemas")
AREAS_POR_ROL = {
    "csm": ("general", "fulfillment"),
    "operaciones": ("general", "fulfillment", "sistemas"),
    "ventas": ("general", "ventas"),
    "closer": ("general", "ventas"),
    "setter": ("general", "ventas"),
    "marketing": ("general", "marketing"),
}
MAX_CHARS_SIEMPRE = 16_000
MAX_CHARS_RELEVANTES = 8_000
CARPETAS_SISTEMA = ("pedidos", "updates", "clientes")  # las escribe el sistema; no entran al ranking


def areas_para(rol: str | None) -> tuple[str, ...]:
    return AREAS_POR_ROL.get(rol or "", AREAS)


def sembrar() -> int:
    """Copia las notas del repo a CEREBRO_DIR. Nunca pisa una nota que el equipo editó:
    guarda en .semilla.json el hash de lo que escribió, y solo actualiza si el archivo
    sigue igual a esa versión. Devuelve cuántas escribió."""
    import hashlib

    if not SEMILLA_DIR.exists():
        return 0
    registro_path = CEREBRO_DIR / ".semilla.json"
    try:
        registro = json.loads(registro_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        registro = {}
    escritas = 0
    for origen in SEMILLA_DIR.rglob("*"):
        if origen.is_dir() or origen.name.startswith("."):
            continue
        rel = str(origen.relative_to(SEMILLA_DIR))
        destino = CEREBRO_DIR / rel
        nuevo = origen.read_bytes()
        h_nuevo = hashlib.sha256(nuevo).hexdigest()
        if destino.exists():
            h_actual = hashlib.sha256(destino.read_bytes()).hexdigest()
            if h_actual == h_nuevo:
                registro[rel] = h_nuevo
                continue
            if registro.get(rel) != h_actual:
                continue  # la editó el equipo: se respeta
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(nuevo)
        registro[rel] = h_nuevo
        escritas += 1
    for area in AREAS:
        (CEREBRO_DIR / area).mkdir(parents=True, exist_ok=True)
    try:
        CEREBRO_DIR.mkdir(parents=True, exist_ok=True)
        registro_path.write_text(json.dumps(registro, indent=1), encoding="utf-8")
    except OSError:
        pass
    if escritas:
        logger.info("Cerebro: %s notas sembradas/actualizadas en %s", escritas, CEREBRO_DIR)
    return escritas


def _frontmatter(texto: str) -> tuple[dict, str]:
    if not texto.startswith("---"):
        return {}, texto
    fin = texto.find("\n---", 3)
    if fin < 0:
        return {}, texto
    meta: dict = {}
    for linea in texto[3:fin].splitlines():
        if ":" in linea:
            k, _, v = linea.partition(":")
            meta[k.strip()] = v.strip()
    return meta, texto[fin + 4:].lstrip("\n")


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9\s-]", " ", t)


def notas(areas: tuple[str, ...] | list[str]) -> list[dict]:
    """Todas las notas de esas áreas (sin las carpetas que escribe el sistema)."""
    salida = []
    for area in areas:
        base = CEREBRO_DIR / area
        if not base.exists():
            continue
        for ruta in sorted(base.rglob("*.md")):
            rel = ruta.relative_to(CEREBRO_DIR)
            if any(parte in CARPETAS_SISTEMA for parte in rel.parts[1:-1]):
                continue
            try:
                texto = ruta.read_text(encoding="utf-8")
            except OSError:
                continue
            meta, cuerpo = _frontmatter(texto)
            salida.append({
                "ruta": str(rel), "area": area, "titulo": ruta.stem, "meta": meta, "cuerpo": cuerpo.strip(),
                "siempre": str(meta.get("siempre", "")).lower() in ("true", "si", "sí", "yes", "1"),
                "tags": _norm(meta.get("tags", "")).split(),
            })
    return salida


def contexto(areas: tuple[str, ...] | list[str], pregunta: str = "") -> str:
    """Notas 'siempre' + notas relevantes a la pregunta, como texto para el prompt."""
    todas = notas(areas)
    palabras = [w for w in _norm(pregunta).split() if len(w) >= 5]
    bloques, usados = [], 0
    for n in todas:
        if n["siempre"] and usados < MAX_CHARS_SIEMPRE:
            bloques.append(f"### {n['ruta']}\n{n['cuerpo']}")
            usados += len(n["cuerpo"])
    if palabras:
        puntuadas = []
        for n in todas:
            if n["siempre"]:
                continue
            cuerpo_n = _norm(n["cuerpo"])
            titulo_n = _norm(n["titulo"])
            puntaje = sum((3 if w in titulo_n else 0) + (2 if w in n["tags"] else 0) + min(cuerpo_n.count(w), 5) for w in palabras)
            if puntaje:
                puntuadas.append((puntaje, n))
        puntuadas.sort(key=lambda x: -x[0])
        usados_rel = 0
        for _, n in puntuadas:
            if usados_rel >= MAX_CHARS_RELEVANTES:
                break
            cuerpo = n["cuerpo"][: MAX_CHARS_RELEVANTES - usados_rel]
            bloques.append(f"### {n['ruta']}\n{cuerpo}")
            usados_rel += len(cuerpo)
    return "\n\n".join(bloques)


def pedidos_de(canal: str) -> str | None:
    """La nota del cliente (ficha + pedidos, la escribe el sistema), si existe."""
    nombre = re.sub(r"[^a-z0-9_-]", "-", canal.lower())
    ruta = CEREBRO_DIR / "fulfillment" / "clientes" / f"{nombre}.md"
    if not ruta.exists():
        return None
    _, cuerpo = _frontmatter(ruta.read_text(encoding="utf-8"))
    return cuerpo.strip()


def ultimo_update() -> str | None:
    """El último update confirmado por el CSM (lo escribe el sistema en fulfillment/updates)."""
    carpeta = CEREBRO_DIR / "fulfillment" / "updates"
    if not carpeta.exists():
        return None
    archivos = sorted(p for p in carpeta.glob("*.md") if p.name != "borrador.md")
    if not archivos:
        return None
    _, cuerpo = _frontmatter(archivos[-1].read_text(encoding="utf-8"))
    return f"({archivos[-1].stem})\n" + cuerpo.strip().strip("`").strip()


def equipo() -> list[dict]:
    """[{nombre, alias:[...]}] leídos de general/equipo.md (editable en Obsidian)."""
    ruta = CEREBRO_DIR / "general" / "equipo.md"
    if not ruta.exists():
        ruta = SEMILLA_DIR / "general" / "equipo.md"
    salida = []
    try:
        _, cuerpo = _frontmatter(ruta.read_text(encoding="utf-8"))
    except OSError:
        return salida
    for linea in cuerpo.splitlines():
        m = re.match(r"^\s*-\s*([^·\n]+?)\s*(?:·\s*alias:\s*(.*))?$", linea)
        if m and not linea.strip().startswith("- id:"):
            nombre = m.group(1).strip()
            alias = [a.strip() for a in (m.group(2) or "").split(",") if a.strip()]
            salida.append({"nombre": nombre, "alias": alias})
    return salida


def normalizar_responsable(nombre: str | None) -> str | None:
    """Lleva 'Juan pablo', 'Fayet' o 'Emi Enrique' al nombre canónico de la nota de equipo."""
    if not nombre:
        return nombre
    n = _norm(nombre).strip()
    if not n:
        return nombre
    miembros = equipo()
    for m in miembros:
        if n == _norm(m["nombre"]).strip() or n in {_norm(a).strip() for a in m["alias"]}:
            return m["nombre"]
    primero = n.split()[0]
    candidatos = [m for m in miembros if _norm(m["nombre"]).split()[:1] == [primero] or any(_norm(a).split()[:1] == [primero] for a in m["alias"])]
    if len(candidatos) == 1:
        return candidatos[0]["nombre"]
    return nombre.strip()


def resumen() -> dict:
    conteo = {a: sum(1 for _ in (CEREBRO_DIR / a).rglob("*.md")) if (CEREBRO_DIR / a).exists() else 0 for a in AREAS}
    return {"dir": str(CEREBRO_DIR), "notas": conteo, "total": sum(conteo.values())}
