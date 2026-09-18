"""
Las sesiones de notas del setter: grabar o subir una llamada, transcribirla y sacar las
notas del prospecto que lee el closer antes de entrar.

Es la pestaña Notes de SetSystem. El audio vive en `data/notas/`; lo demás, en la base.

Lo pesado —transcribir, redactar— corre en un hilo aparte y la sesión va contando por
dónde va en `proceso`. Una llamada de veinte minutos puede tardar minutos en transcribirse
y la pantalla no puede quedarse colgada esperando eso.
"""

from __future__ import annotations

import json
import logging
import shutil
import threading
from datetime import date, datetime
from pathlib import Path

from src.services import transcripcion_services as transcripcion
from src.services.setting_services import ROLES_VEN_TODO, hoy_ar

logger = logging.getLogger("atv_ops.notas")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
NOTAS_DIR = DATA_DIR / "notas"
TIPOS = ("call", "dm")
ORIGENES = ("grabacion", "subida", "texto")
EXTENSIONES = {"audio/webm": "webm", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a",
               "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav",
               "audio/ogg": "ogg", "audio/aac": "aac", "video/webm": "webm"}
MAX_CHARS_TRANSCRIPCION = 120_000

_en_proceso: set[int] = set()
_lock = threading.Lock()

SYSTEM_NOTAS = """Sos el asistente del equipo de ventas de ATV, una agencia de growth para creadores, consultores y dueños de negocios que venden servicios. Leés la transcripción de una llamada de setting (o una conversación por mensajes) entre el setter y un prospecto y escribís las Notas del Prospecto que el closer lee antes de entrar a la llamada de cierre.

Escribí en español rioplatense neutro, en prosa, sin viñetas ni markdown. Citá al prospecto de forma textual entre comillas cada vez que puedas: lo que dijo con sus palabras vale más que tu interpretación. No inventes nada: si algo no se habló, decilo ("No se discutió."). Distinguí lo que dijo el prospecto de lo que planteó el setter y el prospecto no objetó.

Usá exactamente esta estructura, con cada sección en su propio párrafo precedido por el título y dos puntos:

Notas del Prospecto – <Nombre> (<Qué hace / nicho / país>)

Situación: qué negocio tiene, qué vende, cuánto factura, qué tiene armado hoy (equipo, contenido, sistemas) y cómo llegan sus clientes.
Contexto: de dónde viene, cómo llegó a ATV, qué probó antes, qué relación tiene con el contenido de Juan.
Qué quiere conseguir: objetivos concretos en plata, clientes y modelo; visión a mediano plazo.
Problema o desafíos: el cuello de botella con sus palabras; tensiones declaradas; capital si apareció.
Qué está buscando: qué pidió de forma explícita; qué aceptó de lo que se le ofreció; tiempo que puede dedicar.
Timeline: cuándo quiere arrancar y cuándo quedó la próxima llamada.
Budget: facturación actual, disponibilidad de capital y qué se dijo de inversión, sin inventar montos.
Booked: día, hora y con quién quedó la llamada; qué se le manda antes.
Decision Maker: quién decide; socios o pareja si se mencionaron.
Nota: un párrafo final para el closer: por dónde abrir, cuál es la palanca más fuerte (con la cita textual), y qué manejar con cuidado. Sin inspiración, sin teoría: lo que le sirve en la llamada.
"""


# ------------------------------------------------------------------ utilitarios

def _alcance(usuario: dict) -> str | None:
    if usuario.get("rol") in ROLES_VEN_TODO:
        return None
    return usuario.get("username")


def _fecha(v) -> date | None:
    if not v:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _a_dict(s, completo: bool = False) -> dict:
    d = {
        "id": s.id, "externoId": s.externo_id, "setter": s.setter, "pitchId": s.pitch_id,
        "contacto": s.contacto, "tipo": s.tipo, "fecha": s.fecha.isoformat(), "origen": s.origen,
        "tieneAudio": bool(s.audio_path), "tieneAudioMic": bool(s.audio_mic_path),
        "duracionSeg": s.duracion_seg, "diarizado": s.diarizado, "motor": s.motor,
        "tieneTranscripcion": bool(s.transcripcion), "tieneResumen": bool(s.resumen),
        "proceso": s.proceso, "procesoError": s.proceso_error,
        "creadoAt": s.creado_at.isoformat(), "actualizadoAt": s.actualizado_at.isoformat(),
    }
    if completo:
        d["transcripcion"] = s.transcripcion or ""
        try:
            d["segmentos"] = json.loads(s.segmentos) if s.segmentos else []
        except json.JSONDecodeError:
            d["segmentos"] = []
        d["resumen"] = s.resumen or ""
    return d


def _propia(s, usuario: dict) -> bool:
    setter = _alcance(usuario)
    return setter is None or s.setter == setter


def _sesion(sesion_id: int, usuario: dict):
    from src.models import SesionNota

    s = SesionNota.get(id=sesion_id)
    if s is None or s.borrado_at is not None or not _propia(s, usuario):
        raise LookupError("Esa sesión no existe.")
    return s


# ------------------------------------------------------------------ lectura

def listar(usuario: dict, completo: bool = False) -> list[dict]:
    from pony.orm import db_session

    from src.models import SesionNota

    setter = _alcance(usuario)
    with db_session:
        filas = [s for s in list(SesionNota.select()) if s.borrado_at is None
                 and (setter is None or s.setter == setter)]
        return sorted((_a_dict(s, completo) for s in filas), key=lambda s: (s["fecha"], s["id"]), reverse=True)


def detalle(sesion_id: int, usuario: dict) -> dict:
    from pony.orm import db_session

    with db_session:
        return _a_dict(_sesion(sesion_id, usuario), completo=True)


def estado_motor() -> dict:
    """Qué hay para transcribir y redactar: la pantalla lo dice antes de que alguien grabe."""
    from src.services.activacion_ia_services import cli_o_api_disponible

    return {"transcripcion": transcripcion.motor(), "notas": bool(cli_o_api_disponible())}


# ------------------------------------------------------------------ escritura

def crear(datos: dict, usuario: dict) -> dict:
    from pony.orm import db_session

    from src.models import SesionNota

    tipo = str(datos.get("tipo") or "call").lower()
    origen = str(datos.get("origen") or "grabacion").lower()
    if tipo not in TIPOS or origen not in ORIGENES:
        raise ValueError("Tipo u origen inválido.")
    texto = str(datos.get("texto") or "").strip()
    if origen == "texto" and not texto:
        raise ValueError("Pegá el texto de la conversación.")
    with db_session:
        s = SesionNota(
            setter=usuario.get("username"), pitch_id=(int(datos["pitchId"]) if datos.get("pitchId") else None),
            contacto=(str(datos.get("contacto") or "").strip()[:200] or None), tipo=tipo,
            fecha=_fecha(datos.get("fecha")) or hoy_ar(), origen=origen,
            transcripcion=(texto[:MAX_CHARS_TRANSCRIPCION] if texto else None),
            motor=("pegado" if texto else None), diarizado=("no" if texto else None),
        )
        s.flush()
        return _a_dict(s, completo=True)


def actualizar(sesion_id: int, datos: dict, usuario: dict) -> dict:
    from pony.orm import db_session

    with db_session:
        s = _sesion(sesion_id, usuario)
        if "contacto" in datos:
            s.contacto = str(datos.get("contacto") or "").strip()[:200] or None
        if "pitchId" in datos:
            s.pitch_id = int(datos["pitchId"]) if datos.get("pitchId") else None
        if "fecha" in datos and _fecha(datos.get("fecha")):
            s.fecha = _fecha(datos.get("fecha"))
        if "tipo" in datos and str(datos["tipo"]).lower() in TIPOS:
            s.tipo = str(datos["tipo"]).lower()
        if "resumen" in datos:
            s.resumen = str(datos.get("resumen") or "").strip() or None
        if "transcripcion" in datos:
            s.transcripcion = str(datos.get("transcripcion") or "").strip()[:MAX_CHARS_TRANSCRIPCION] or None
            s.motor = "pegado"
        if "duracionSeg" in datos and datos.get("duracionSeg") is not None:
            s.duracion_seg = max(0, int(datos["duracionSeg"]))
        s.actualizado_at = datetime.utcnow()
        return _a_dict(s, completo=True)


def borrar(sesion_id: int, usuario: dict) -> dict:
    from pony.orm import db_session

    with db_session:
        s = _sesion(sesion_id, usuario)
        s.borrado_at = datetime.utcnow()
        return {"ok": True, "id": sesion_id}


# ------------------------------------------------------------------ audio

def _extension(content_type: str, nombre: str = "") -> str:
    tipo = (content_type or "").split(";")[0].strip().lower()
    if tipo in EXTENSIONES:
        return EXTENSIONES[tipo]
    suf = Path(nombre).suffix.lstrip(".").lower()
    return suf if suf in set(EXTENSIONES.values()) else "webm"


def guardar_audio(sesion_id: int, cuerpo: bytes, content_type: str, usuario: dict,
                  pista: str = "", nombre: str = "") -> dict:
    """Guarda el audio en disco y deja el camino relativo en la sesión."""
    from pony.orm import db_session

    if not cuerpo:
        raise ValueError("El audio llegó vacío.")
    NOTAS_DIR.mkdir(parents=True, exist_ok=True)
    ext = _extension(content_type, nombre)
    sufijo = "-mic" if pista == "mic" else ""
    with db_session:
        s = _sesion(sesion_id, usuario)
        relativo = f"notas/{s.id}{sufijo}.{ext}"
        (DATA_DIR / relativo).write_bytes(cuerpo)
        if pista == "mic":
            s.audio_mic_path = relativo
        else:
            s.audio_path = relativo
        s.actualizado_at = datetime.utcnow()
        return _a_dict(s)


def ruta_audio(sesion_id: int, usuario: dict, pista: str = "") -> Path:
    from pony.orm import db_session

    with db_session:
        s = _sesion(sesion_id, usuario)
        relativo = s.audio_mic_path if pista == "mic" else s.audio_path
    if not relativo or not (DATA_DIR / relativo).exists():
        raise LookupError("Esa sesión no tiene audio guardado.")
    return DATA_DIR / relativo


# ------------------------------------------------------------------ transcribir y redactar

def _redactar(transcripcion_texto: str, resumen_previo: str = "", pedido: str = "") -> tuple[str, dict]:
    from src.services.activacion_ia_services import invocar_claude_texto

    texto = transcripcion_texto[:MAX_CHARS_TRANSCRIPCION]
    if pedido:
        user = (f"Esta es la transcripción:\n\n{texto}\n\n---\nEstas son las notas que ya redactaste:\n\n"
                f"{resumen_previo}\n\n---\nAjustalas según este pedido y devolvé las notas completas, "
                f"con la misma estructura:\n{pedido}")
    else:
        user = f"Esta es la transcripción. Escribí las Notas del Prospecto siguiendo la estructura y las reglas:\n\n{texto}"
    return invocar_claude_texto(SYSTEM_NOTAS, user)


def _mezclar_pistas(sistema: dict, mic: dict) -> tuple[str, list[dict]]:
    """Dos pistas grabadas a la vez: se intercalan por tiempo con quién habló."""
    segs = ([{**s, "hablante": "Prospecto"} for s in sistema["segmentos"]]
            + [{**s, "hablante": "Setter"} for s in mic["segmentos"]])
    segs.sort(key=lambda s: s["inicio"])
    texto = "\n".join(f"{s['hablante']}: {s['texto']}" for s in segs if s["texto"])
    return texto, segs


def _procesar(sesion_id: int, usuario: dict, con_notas: bool) -> None:
    from pony.orm import db_session

    from src.models import SesionNota

    def marcar(**campos) -> None:
        with db_session:
            s = SesionNota.get(id=sesion_id)
            if s is None:
                return
            for k, v in campos.items():
                setattr(s, k, v)
            s.actualizado_at = datetime.utcnow()

    try:
        with db_session:
            s = SesionNota.get(id=sesion_id)
            audio, mic, texto = s.audio_path, s.audio_mic_path, (s.transcripcion or "")
        if not texto and audio:
            marcar(proceso="transcribiendo", proceso_error=None)
            principal = transcripcion.transcribir(DATA_DIR / audio)
            duracion = principal["duracion"]
            if mic and (DATA_DIR / mic).exists():
                del_mic = transcripcion.transcribir(DATA_DIR / mic)
                texto, segmentos = _mezclar_pistas(principal, del_mic)
                duracion = max(duracion, del_mic["duracion"])
                diarizado = "pistas"
            else:
                texto, segmentos, diarizado = principal["texto"], principal["segmentos"], "no"
            if not texto.strip():
                raise RuntimeError("No se entendió nada en el audio.")
            marcar(transcripcion=texto[:MAX_CHARS_TRANSCRIPCION], segmentos=json.dumps(segmentos, ensure_ascii=False),
                   diarizado=diarizado, motor="whisper", duracion_seg=int(round(duracion)) if duracion else None)
        if con_notas and texto:
            marcar(proceso="notas")
            resumen, meta = _redactar(texto)
            if not resumen.strip():
                raise RuntimeError("El modelo no devolvió notas.")
            marcar(resumen=resumen.strip())
            logger.info("Notas de la sesión %s redactadas (%s, %.4f USD)", sesion_id, meta.get("via"), meta.get("costo_usd", 0))
        marcar(proceso=None, proceso_error=None)
    except Exception as e:  # noqa: BLE001
        logger.exception("Falló procesar la sesión %s", sesion_id)
        marcar(proceso="error", proceso_error=str(e)[:400])
    finally:
        with _lock:
            _en_proceso.discard(sesion_id)


def procesar(sesion_id: int, usuario: dict, con_notas: bool = True) -> dict:
    """Transcribe si falta y redacta las notas, en segundo plano."""
    from pony.orm import db_session

    with db_session:
        s = _sesion(sesion_id, usuario)
        if not s.transcripcion and not s.audio_path:
            raise ValueError("La sesión no tiene ni audio ni texto para procesar.")
        if not s.transcripcion and transcripcion.motor() is None:
            raise ValueError("No hay motor de transcripción configurado. Pegá el texto de la llamada o pedile a ops que configure OPENAI_API_KEY.")
    with _lock:
        if sesion_id in _en_proceso:
            return {"ok": True, "enCurso": True}
        _en_proceso.add(sesion_id)
    threading.Thread(target=_procesar, args=(sesion_id, usuario, con_notas), daemon=True,
                     name=f"notas-{sesion_id}").start()
    return {"ok": True, "enCurso": True}


def refinar(sesion_id: int, pedido: str, usuario: dict) -> dict:
    """Ajusta las notas con un pedido del setter ("ponele más énfasis en el presupuesto")."""
    from pony.orm import db_session

    pedido = str(pedido or "").strip()
    if not pedido:
        raise ValueError("Decí qué querés ajustar.")
    with db_session:
        s = _sesion(sesion_id, usuario)
        if not s.transcripcion:
            raise ValueError("Esa sesión no tiene transcripción.")
        texto, previo = s.transcripcion, s.resumen or ""
    resumen, _meta = _redactar(texto, previo, pedido)
    with db_session:
        s = _sesion(sesion_id, usuario)
        s.resumen = resumen.strip() or s.resumen
        s.actualizado_at = datetime.utcnow()
        return _a_dict(s, completo=True)


# ------------------------------------------------------------------ respaldo

def importar(sesiones: list, usuario: dict) -> dict:
    """Las sesiones de un respaldo: por id externo se pisan, sin él se crean."""
    from pony.orm import db_session

    from src.models import SesionNota

    creadas = actualizadas = 0
    with db_session:
        existentes = {s.externo_id: s for s in list(SesionNota.select()) if s.externo_id}
        for fila in sesiones:
            if not isinstance(fila, dict):
                continue
            externo = str(fila.get("externoId") or fila.get("id") or "").strip() or None
            fecha = _fecha(fila.get("fecha"))
            if fecha is None:
                continue
            campos = dict(
                contacto=(str(fila.get("contacto") or fila.get("lead_name") or "").strip()[:200] or None),
                tipo=(fila.get("tipo") if fila.get("tipo") in TIPOS else "call"), fecha=fecha,
                origen=(fila.get("origen") if fila.get("origen") in ORIGENES else "subida"),
                duracion_seg=(int(fila["duracionSeg"]) if fila.get("duracionSeg") else
                              int(fila["duracion_seg"]) if fila.get("duracion_seg") else None),
                transcripcion=(str(fila.get("transcripcion") or "")[:MAX_CHARS_TRANSCRIPCION] or None),
                segmentos=(json.dumps(fila["segmentos"], ensure_ascii=False) if isinstance(fila.get("segmentos"), list)
                           else str(fila.get("segmentos") or "") or None),
                diarizado=fila.get("diarizado"), motor=fila.get("motor"),
                resumen=(str(fila.get("resumen") or "") or None),
            )
            s = existentes.get(externo) if externo else None
            if s is not None and _propia(s, usuario):
                for k, v in campos.items():
                    setattr(s, k, v)
                s.borrado_at = None
                s.actualizado_at = datetime.utcnow()
                actualizadas += 1
            else:
                nueva = SesionNota(setter=usuario.get("username"), externo_id=externo, **campos)
                nueva.flush()
                if externo:
                    existentes[externo] = nueva
                creadas += 1
    return {"creadas": creadas, "actualizadas": actualizadas}


def guardar_audio_importado(sesion_id: int, origen: Path, pista: str = "") -> None:
    """Copia un audio ya bajado (importación) al lugar de la sesión."""
    from pony.orm import db_session

    from src.models import SesionNota

    NOTAS_DIR.mkdir(parents=True, exist_ok=True)
    with db_session:
        s = SesionNota.get(id=sesion_id)
        if s is None:
            return
        relativo = f"notas/{s.id}{'-mic' if pista == 'mic' else ''}{origen.suffix.lower()}"
        shutil.copyfile(origen, DATA_DIR / relativo)
        if pista == "mic":
            s.audio_mic_path = relativo
        else:
            s.audio_path = relativo
