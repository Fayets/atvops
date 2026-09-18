"""
Pasar un audio a texto.

Dos motores, y se usa el primero que esté:

- Whisper por API de OpenAI si hay `OPENAI_API_KEY`: rápido (un minuto para una llamada
  de veinte) y barato. Es lo que usaba SetSystem.
- `faster-whisper` en la misma máquina si está instalado: no depende de nadie pero en el
  VPS tarda varios minutos por llamada.

Si no hay ninguno, el audio queda guardado igual y el setter puede pegar el texto: la
sesión no se pierde, solo falta la transcripción.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import uuid
from pathlib import Path

from decouple import config

logger = logging.getLogger("atv_ops.transcripcion")

OPENAI_API_KEY = config("OPENAI_API_KEY", default="")
OPENAI_MODELO = config("OPENAI_TRANSCRIPCION_MODEL", default="whisper-1")
WHISPER_MODELO = config("WHISPER_MODEL", default="small")
IDIOMA = config("TRANSCRIPCION_IDIOMA", default="es")

_modelo_local = None


def _local_disponible() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False


def motor() -> str | None:
    """openai | local | None."""
    if OPENAI_API_KEY:
        return "openai"
    if _local_disponible():
        return "local"
    return None


def _por_openai(path: Path) -> dict:
    import urllib.request

    limite = f"----atvops{uuid.uuid4().hex}"
    tipo = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    partes: list[bytes] = []

    def campo(nombre: str, valor: str) -> None:
        partes.append(f"--{limite}\r\nContent-Disposition: form-data; name=\"{nombre}\"\r\n\r\n{valor}\r\n".encode())

    campo("model", OPENAI_MODELO)
    campo("language", IDIOMA)
    campo("response_format", "verbose_json")
    partes.append((f"--{limite}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
                   f"Content-Type: {tipo}\r\n\r\n").encode() + path.read_bytes() + b"\r\n")
    partes.append(f"--{limite}--\r\n".encode())
    cuerpo = b"".join(partes)

    pedido = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions", data=cuerpo, method="POST",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                 "Content-Type": f"multipart/form-data; boundary={limite}"},
    )
    with urllib.request.urlopen(pedido, timeout=600) as r:
        datos = json.loads(r.read())
    segmentos = [{"inicio": round(float(s.get("start", 0)), 2), "fin": round(float(s.get("end", 0)), 2),
                  "texto": str(s.get("text", "")).strip()} for s in (datos.get("segments") or [])]
    return {"texto": str(datos.get("text", "")).strip(), "segmentos": segmentos,
            "duracion": float(datos.get("duration") or (segmentos[-1]["fin"] if segmentos else 0))}


def _por_local(path: Path) -> dict:
    global _modelo_local
    from faster_whisper import WhisperModel

    if _modelo_local is None:
        _modelo_local = WhisperModel(WHISPER_MODELO, device="cpu", compute_type="int8")
    segs, info = _modelo_local.transcribe(str(path), language=IDIOMA, vad_filter=True)
    segmentos = [{"inicio": round(s.start, 2), "fin": round(s.end, 2), "texto": s.text.strip()} for s in segs]
    return {"texto": " ".join(s["texto"] for s in segmentos).strip(), "segmentos": segmentos,
            "duracion": float(getattr(info, "duration", 0) or (segmentos[-1]["fin"] if segmentos else 0))}


def transcribir(path: Path) -> dict:
    """Devuelve {texto, segmentos, duracion}. Levanta RuntimeError si no hay motor."""
    m = motor()
    if m == "openai":
        return _por_openai(path)
    if m == "local":
        return _por_local(path)
    raise RuntimeError("No hay motor de transcripción: falta OPENAI_API_KEY o instalar faster-whisper.")
