"""
Revisión semanal de la narrativa de Juan.

La narrativa vive en el cuadro "Narrativa" de la pizarra (PizarraContexto 'narrativa') y
es lo que Claude respeta en cada idea. Tiene que mantenerse, pero cambia a medida que
Juan publica: cada lunes se leen los reels, los videos de YouTube y las historias de la
semana anterior y Claude propone cambios a la narrativa. Nada se aplica solo: marketing
acepta o descarta cada cambio desde la pizarra.

Qué decide la IA y qué decide el código:
- La IA propone agregar, cambiar o sacar líneas, cada cambio con la pieza de la semana y
  la frase que lo justifica.
- El código descarta el cambio si la pieza no es de esa semana, si la frase no está en el
  texto del reel o del video, o si la línea a cambiar no existe en la narrativa. Las
  historias son imágenes: de ellas se acepta la pieza pero la frase queda "sin verificar".
- Aplicar un cambio aceptado lo hace el código, línea por línea.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import subprocess
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, desc, flush

from src.models import PizarraContexto, PizarraPropuesta, PublicacionIg, PublicacionYt
from src.services import activacion_ia_services as ia
from src.services import pizarra_services as pz
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.narrativa")

MODELO = config("NARRATIVA_MODEL", default=pz.MODELO)
TIMEOUT_S = int(config("NARRATIVA_TIMEOUT", default="900"))
ACTIVA = config("NARRATIVA_REVISION", default="1") != "0"
HORA_AR = (9, 30)                 # lunes 09:30 de Argentina
MAX_HISTORIAS = 60
ACCIONES = ("agregar", "cambiar", "quitar")
DATA_DIR = Path(__file__).resolve().parents[2] / "data"

_en_curso = threading.Lock()


# ------------------------------------------------------------------ semana

def semana_anterior(hoy: date | None = None) -> tuple[date, date]:
    """De lunes a domingo de la semana pasada."""
    hoy = hoy or datetime.now(AR_TZ).date()
    lunes = hoy - timedelta(days=hoy.weekday())
    return lunes - timedelta(days=7), lunes - timedelta(days=1)


def _ruta_foto(thumbnail: str | None) -> str | None:
    t = str(thumbnail or "")
    if not t.startswith("/uploads/"):
        return None
    ruta = DATA_DIR / t[len("/uploads/"):]
    return str(ruta) if ruta.exists() else None


def contenido_semana(desde: date, hasta: date) -> dict:
    """Lo que Juan publicó entre esas fechas, con una clave por pieza para citarla."""
    ini, fin = datetime.combine(desde, datetime.min.time()), datetime.combine(hasta + timedelta(days=1), datetime.min.time())
    with db_session:
        pubs = sorted(PublicacionIg.select(lambda p: p.publicado_at >= ini and p.publicado_at < fin), key=lambda p: p.publicado_at)
        videos = sorted(PublicacionYt.select(lambda v: v.publicado_at >= ini and v.publicado_at < fin), key=lambda v: v.publicado_at)
        reels = [{"ref": f"reel:{p.ig_id}", "fecha": p.publicado_at.date().isoformat(), "texto": p.caption or ""}
                 for p in pubs if p.tipo == "reel"]
        historias = [{"ref": f"historia:{p.ig_id}", "fecha": p.publicado_at.date().isoformat(), "foto": _ruta_foto(p.thumbnail)}
                     for p in pubs if p.tipo == "historia"]
        yts = [{"ref": f"youtube:{v.yt_id}", "fecha": v.publicado_at.date().isoformat(),
                "texto": f"{v.titulo or ''}\n{v.descripcion or ''}".strip()} for v in videos]
    historias = [h for h in historias if h["foto"]][:MAX_HISTORIAS]
    return {"reels": reels, "youtube": yts, "historias": historias}


# ------------------------------------------------------------------ narrativa

def narrativa_actual() -> str:
    with db_session:
        fila = PizarraContexto.get(clave="narrativa")
        return (fila.texto or "") if fila else ""


def _lineas(texto: str) -> list[str]:
    return [l.strip() for l in (texto or "").splitlines() if l.strip()]


def _buscar_linea(texto: str, linea: str) -> int | None:
    """Posición de la línea en la narrativa, comparando sin tildes ni puntuación."""
    buscada = pz._norm(linea)
    for i, l in enumerate(_lineas(texto)):
        if pz._norm(l) == buscada:
            return i
    return None


def aplicar(texto: str, cambio: dict) -> str:
    """La narrativa con ese cambio aplicado. Si la línea ya no está (alguien la editó),
    el cambio no se aplica."""
    lineas = _lineas(texto)
    accion = cambio["accion"]
    if accion == "agregar":
        if _buscar_linea(texto, cambio["linea_nueva"]) is None:
            lineas.append(cambio["linea_nueva"])
        return "\n".join(lineas)
    i = _buscar_linea(texto, cambio.get("linea_actual") or "")
    if i is None:
        raise HTTPException(status_code=409, detail="Esa línea ya no está en la narrativa: alguien la cambió. Descartá este cambio.")
    if accion == "quitar":
        del lineas[i]
    else:
        lineas[i] = cambio["linea_nueva"]
    return "\n".join(lineas)


# ------------------------------------------------------------------ validación

def validar(data: dict, narrativa: str, semana: dict) -> list[dict]:
    """Los cambios que se pueden mostrar. Un cambio sin una pieza de la semana que lo
    sostenga no entra, aunque la idea sea buena."""
    piezas = {p["ref"]: p for grupo in semana.values() for p in grupo}
    buenos = []
    for c in (data.get("cambios") or [])[:8]:
        if not isinstance(c, dict) or c.get("accion") not in ACCIONES:
            continue
        nueva, actual = pz._limpio(c.get("linea_nueva"), 400), pz._limpio(c.get("linea_actual"), 400)
        if c["accion"] in ("agregar", "cambiar") and not nueva:
            continue
        if c["accion"] in ("cambiar", "quitar") and _buscar_linea(narrativa, actual) is None:
            continue
        if c["accion"] == "agregar" and _buscar_linea(narrativa, nueva) is not None:
            continue
        evidencias = []
        for e in (c.get("evidencias") or [])[:4]:
            pieza = piezas.get(str((e or {}).get("ref") or ""))
            cita = pz._limpio((e or {}).get("cita"), 400)
            if not pieza or not cita:
                continue
            if "texto" in pieza:
                if pz._norm(cita) not in pz._norm(pieza["texto"]):
                    continue
                evidencias.append({"ref": pieza["ref"], "fecha": pieza["fecha"], "cita": cita, "verificada": True})
            else:
                evidencias.append({"ref": pieza["ref"], "fecha": pieza["fecha"], "cita": cita, "verificada": False})
        if not evidencias:
            continue
        buenos.append({"id": len(buenos), "accion": c["accion"], "linea_actual": actual or None, "linea_nueva": nueva or None,
                       "motivo": pz._limpio(c.get("motivo"), 400) or None, "evidencias": evidencias, "estado": "pendiente"})
    return buenos


# ------------------------------------------------------------------ Claude

SYSTEM = pz.MARCA + """

Mantenés la NARRATIVA de Juan: lo que todo su contenido tiene que sostener. Te paso la narrativa vigente (una idea por línea, numeradas) y lo que Juan publicó la semana pasada: el texto de sus reels, el título y la descripción de sus videos de YouTube y, si hay, las fotos de sus historias (leelas con la herramienta Read, una por una).

La narrativa se mantiene: ATV vende implementación, no información, y la comunicación es B2B, al dueño de un negocio que ya factura. Proponé cambios solo cuando lo de la semana lo justifique:
- agregar: una idea, una prueba (cliente con cifra y plazo) o una frase que Juan empezó a decir y no está.
- cambiar: una línea que quedó vieja (por ejemplo una cifra que subió).
- quitar: una línea que Juan contradijo en la semana.
Si la semana no trae nada nuevo, no propongas nada: está bien que no haya cambios. Como mucho 5.

Cada cambio necesita al menos una evidencia: la pieza (su "ref", tal cual te la paso) y la frase TEXTUAL de esa pieza que lo sostiene. Para cambiar o quitar, copiá la línea actual tal cual está. Escribí las líneas nuevas en el mismo estilo que las de la narrativa.

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"cambios": [{"accion": "agregar" | "cambiar" | "quitar", "linea_actual": "..." | null, "linea_nueva": "..." | null, "motivo": "...", "evidencias": [{"ref": "reel:...", "cita": "..."}]}]}"""


def _prompt(narrativa: str, semana: dict, desde: date, hasta: date) -> str:
    lineas = "\n".join(f"{i + 1}. {l}" for i, l in enumerate(_lineas(narrativa))) or "(todavía vacía)"
    partes = [f"# La narrativa vigente\n{lineas}", f"# Semana del {desde.isoformat()} al {hasta.isoformat()}"]
    if semana["reels"]:
        partes.append("## Reels\n" + "\n\n".join(f"[{r['ref']}] {r['fecha']}\n{r['texto']}" for r in semana["reels"]))
    if semana["youtube"]:
        partes.append("## Videos de YouTube (título y descripción)\n" + "\n\n".join(f"[{v['ref']}] {v['fecha']}\n{v['texto']}" for v in semana["youtube"]))
    if semana["historias"]:
        partes.append("## Historias (fotos para leer con Read, en orden)\n" + "\n".join(f"[{h['ref']}] {h['fecha']} {h['foto']}" for h in semana["historias"]))
    return "\n\n".join(partes)


def _claude(prompt: str, fotos: list[str]) -> dict:
    """Con API, las fotos van en el mensaje; con el CLI, Claude las lee con Read."""
    if ia.via_api():
        import anthropic

        contenido = [{"type": "text", "text": prompt}]
        for f in fotos:
            contenido.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                          "data": base64.b64encode(Path(f).read_bytes()).decode()}})
        msg = anthropic.Anthropic(api_key=ia.API_KEY, timeout=TIMEOUT_S).messages.create(
            model=MODELO, max_tokens=4000, system=SYSTEM, messages=[{"role": "user", "content": contenido}])
        return ia._extraer_json("".join(getattr(b, "text", "") for b in msg.content))
    cmd = [ia.CLAUDE_BIN, "-p", "--model", MODELO, "--output-format", "json", "--max-turns", str(len(fotos) + 5),
           "--no-session-persistence", "--strict-mcp-config", "--system-prompt", SYSTEM]
    if fotos:
        # Solo puede leer: ni escribir ni ejecutar nada.
        cmd += ["--tools", "Read", "--allowedTools", "Read", "--add-dir", str(DATA_DIR / "ig")]
    else:
        cmd += ["--tools", ""]
    env = dict(os.environ, DISABLE_AUTOUPDATER="1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1")
    proc = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=TIMEOUT_S, env=env)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "").strip()[:400] or f"exit {proc.returncode}")
    envoltura = json.loads(proc.stdout)
    if envoltura.get("is_error"):
        raise RuntimeError(str(envoltura.get("result") or envoltura.get("subtype"))[:400])
    return ia._extraer_json(str(envoltura.get("result") or ""))


# ------------------------------------------------------------------ revisión

def _dict(p: PizarraPropuesta) -> dict:
    return {"id": p.id, "desde": p.desde.isoformat(), "hasta": p.hasta.isoformat(), "estado": p.estado, "error": p.error,
            "origen": p.origen, "creadoAt": p.creado_at.isoformat(), "fuentes": json.loads(p.fuentes_json or "{}"),
            "cambios": json.loads(p.cambios_json or "[]")}


def propuestas(limite: int = 6) -> dict:
    with db_session:
        filas = list(PizarraPropuesta.select().order_by(desc(PizarraPropuesta.id)).limit(limite))
        return {"propuestas": [_dict(p) for p in filas], "armando": _en_curso.locked()}


def pendientes() -> int:
    """Cuántos cambios esperan respuesta: es el aviso del cuadro Narrativa."""
    with db_session:
        return sum(1 for p in PizarraPropuesta.select(lambda p: p.estado == "lista")
                   for c in json.loads(p.cambios_json or "[]") if c.get("estado") == "pendiente")


def revisar(origen: str = "manual", hoy: date | None = None) -> dict:
    """Arranca la revisión de la semana pasada en segundo plano."""
    if _en_curso.locked():
        return propuestas()
    desde, hasta = semana_anterior(hoy)
    with db_session:
        p = PizarraPropuesta(desde=desde, hasta=hasta, origen=origen)
        flush()
        pid = p.id
    threading.Thread(target=_revisar_seguro, args=(pid,), daemon=True).start()
    return propuestas()


def _revisar_seguro(pid: int) -> None:
    with _en_curso:
        try:
            _revisar(pid)
        except Exception as e:  # noqa: BLE001 — la falla queda escrita en la propuesta
            logger.exception("Narrativa: falló la revisión %s", pid)
            with db_session:
                p = PizarraPropuesta.get(id=pid)
                if p is not None:
                    p.estado, p.error = "error", str(e)[:400]


def _revisar(pid: int) -> None:
    with db_session:
        p = PizarraPropuesta[pid]
        desde, hasta = p.desde, p.hasta
    semana = contenido_semana(desde, hasta)
    narrativa = narrativa_actual()
    fuentes = {k: len(v) for k, v in semana.items()}
    if not any(fuentes.values()):
        cambios = []
    else:
        data = _claude(_prompt(narrativa, semana, desde, hasta), [h["foto"] for h in semana["historias"]])
        cambios = validar(data, narrativa, semana)
    with db_session:
        p = PizarraPropuesta[pid]
        p.fuentes_json = json.dumps(fuentes)
        p.cambios_json = json.dumps(cambios, ensure_ascii=False)
        p.estado = "lista" if cambios else "sin_cambios"
    logger.info("Narrativa: semana %s → %s cambios (%s)", desde, len(cambios), fuentes)


def decidir(pid: int, cambio_id: int, estado: str, por: str | None) -> dict:
    """Aceptar aplica el cambio a la narrativa; descartar solo lo marca."""
    if estado not in ("aceptado", "descartado"):
        raise HTTPException(status_code=422, detail="Estado inválido.")
    with db_session:
        p = PizarraPropuesta.get(id=pid)
        if p is None:
            raise HTTPException(status_code=404, detail="Esa propuesta no existe.")
        cambios = json.loads(p.cambios_json or "[]")
        c = next((x for x in cambios if x.get("id") == cambio_id), None)
        if c is None:
            raise HTTPException(status_code=404, detail="Ese cambio no existe.")
        if c["estado"] != "pendiente":
            raise HTTPException(status_code=409, detail="Ese cambio ya se respondió.")
        if estado == "aceptado":
            fila = PizarraContexto.get(clave="narrativa") or PizarraContexto(clave="narrativa")
            fila.texto = aplicar(fila.texto or "", c)
            fila.editado_por, fila.editado_at = por, datetime.utcnow()
        c["estado"], c["decidido_por"] = estado, por
        p.cambios_json = json.dumps(cambios, ensure_ascii=False)
    return {"propuestas": propuestas()["propuestas"], "contexto": pz.contexto()}


def iniciar_scheduler(stop: threading.Event) -> None:
    """Los lunes a las 09:30 (Argentina) revisa la semana anterior, una sola vez."""
    if not ACTIVA:
        return
    while not stop.is_set():
        ahora = datetime.now(AR_TZ)
        if ahora.weekday() == 0 and (ahora.hour, ahora.minute) == HORA_AR:
            desde, _ = semana_anterior(ahora.date())
            with db_session:
                ya = PizarraPropuesta.select(lambda p: p.desde == desde and p.origen == "programado").exists()
            if not ya:
                try:
                    revisar(origen="programado", hoy=ahora.date())
                except Exception:  # noqa: BLE001
                    logger.exception("Narrativa: la revisión programada falló al arrancar")
        stop.wait(30)
