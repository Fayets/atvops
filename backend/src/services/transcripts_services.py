"""
Lectura y parseo de los transcripts que escribe el bot de ATV Clients.

Regla del módulo: es de solo lectura. No abre conexión a Discord, no escribe en
los .txt y no toca la base de atv-clients. Si el bot cambia de cadencia o de
canales, esto lo refleja solo.

Formato del archivo (lo produce `_format_mensaje` en atv-clients):

    [YYYY-MM-DD HH:MM] Autor
    contenido
      📎 https://...

    [YYYY-MM-DD HH:MM] Otro autor
    ...

Los timestamps se escriben en UTC sin tzinfo; acá se interpretan como UTC y se
exponen en hora de Argentina, que es como los lee el equipo.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException

from src.transcripts_source import CANONICAL_BASE, base_disponible, get_transcripts_base

AR_TZ = timezone(timedelta(hours=-3))

# Encabezado que el bot escribe solo en la primera corrida de cada canal.
_HEADER_SEP = "=" * 20
_MSG_RE = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (.+)$", re.MULTILINE)
_ADJUNTO_RE = re.compile(r"^\s*📎\s*(\S+)\s*$")


class TranscriptsServices:
    """Servicio de solo lectura sobre el directorio de transcripts."""

    def __init__(self) -> None:
        # Cache por archivo: evita re-parsear en cada request. Se invalida sola
        # cuando el bot escribe (cambia mtime o tamaño).
        self._cache: dict[str, tuple[float, int, dict]] = {}

    # ------------------------------------------------------------- parseo

    @staticmethod
    def _a_ar(fecha_naive_utc: datetime) -> datetime:
        return fecha_naive_utc.replace(tzinfo=timezone.utc).astimezone(AR_TZ)

    @staticmethod
    def _sin_header(texto: str) -> str:
        """Descarta el encabezado del bot si el archivo lo tiene."""
        if not texto.startswith("Canal:"):
            return texto
        corte = texto.find(_HEADER_SEP)
        if corte == -1:
            return texto
        fin = texto.find("\n", corte)
        return texto[fin + 1:] if fin != -1 else texto

    def _parsear(self, texto: str) -> list[dict]:
        cuerpo = self._sin_header(texto)
        matches = list(_MSG_RE.finditer(cuerpo))
        mensajes: list[dict] = []

        for i, match in enumerate(matches):
            inicio = match.end()
            fin = matches[i + 1].start() if i + 1 < len(matches) else len(cuerpo)
            bloque = cuerpo[inicio:fin]

            lineas: list[str] = []
            adjuntos: list[str] = []
            for linea in bloque.splitlines():
                adjunto = _ADJUNTO_RE.match(linea)
                if adjunto:
                    adjuntos.append(adjunto.group(1))
                else:
                    lineas.append(linea)

            try:
                fecha = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M")
            except ValueError:
                continue

            mensajes.append({
                "indice": len(mensajes),
                "fecha_at": self._a_ar(fecha),
                "autor": match.group(2).strip(),
                "contenido": "\n".join(lineas).strip(),
                "adjuntos": adjuntos,
            })

        return mensajes

    # -------------------------------------------------------- archivo → dict

    @staticmethod
    def _archivo_de_canal(carpeta: Path) -> Path | None:
        """El .txt del canal. Se prioriza <canal>.txt; si no, cualquier .txt."""
        preferido = carpeta / f"{carpeta.name}.txt"
        if preferido.is_file():
            return preferido
        txts = sorted(carpeta.glob("*.txt"))
        return txts[0] if txts else None

    def _leer_canal(self, categoria: str, carpeta: Path) -> dict | None:
        archivo = self._archivo_de_canal(carpeta)
        if not archivo:
            return None

        stat = archivo.stat()
        clave = str(archivo)
        cacheado = self._cache.get(clave)
        if cacheado and cacheado[0] == stat.st_mtime and cacheado[1] == stat.st_size:
            return cacheado[2]

        try:
            texto = archivo.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None

        # El bot escribe el encabezado SOLO en la primera corrida de un canal
        # (cuando todavía no hay `ultimo_mensaje_id` en la base). Un archivo sin
        # encabezado es un fragmento: la historia previa quedó en otra máquina.
        tiene_header = texto.startswith("Canal:")
        mensajes = self._parsear(texto)
        autores: dict[str, dict] = {}
        adjuntos = 0
        caracteres = 0

        for msg in mensajes:
            adjuntos += len(msg["adjuntos"])
            caracteres += len(msg["contenido"])
            autor = autores.setdefault(
                msg["autor"],
                {"nombre": msg["autor"], "mensajes": 0, "primero_at": None, "ultimo_at": None},
            )
            autor["mensajes"] += 1
            if autor["primero_at"] is None or msg["fecha_at"] < autor["primero_at"]:
                autor["primero_at"] = msg["fecha_at"]
            if autor["ultimo_at"] is None or msg["fecha_at"] > autor["ultimo_at"]:
                autor["ultimo_at"] = msg["fecha_at"]

        primero = mensajes[0]["fecha_at"] if mensajes else None
        ultimo = max((m["fecha_at"] for m in mensajes), default=None)
        ahora = datetime.now(AR_TZ)

        # Vista previa del último mensaje: es lo que se lee en la lista de chats.
        ultimo_msg = mensajes[-1] if mensajes else None
        ultimo_texto = None
        if ultimo_msg:
            crudo = " ".join((ultimo_msg["contenido"] or "").split())
            if not crudo and ultimo_msg["adjuntos"]:
                crudo = f"📎 {len(ultimo_msg['adjuntos'])} adjunto(s)"
            ultimo_texto = crudo[:160]

        datos = {
            "id": f"{categoria}/{carpeta.name}",
            "canal": carpeta.name,
            "categoria": categoria,
            "mensajes": len(mensajes),
            "autores": sorted(autores.values(), key=lambda a: -a["mensajes"]),
            "adjuntos": adjuntos,
            "caracteres": caracteres,
            "primer_mensaje_at": primero,
            "ultimo_mensaje_at": ultimo,
            "dias_sin_actividad": (ahora - ultimo).days if ultimo else None,
            "ultimo_autor": ultimo_msg["autor"] if ultimo_msg else None,
            "ultimo_texto": ultimo_texto,
            "archivo": str(archivo),
            "bytes": stat.st_size,
            "completo": tiene_header,
            "actualizado_at": datetime.fromtimestamp(stat.st_mtime, AR_TZ),
            "_mensajes": mensajes,
        }

        self._cache[clave] = (stat.st_mtime, stat.st_size, datos)
        return datos

    # ---------------------------------------------------------------- API

    def _recorrer(self) -> list[dict]:
        base = get_transcripts_base()
        if not base.is_dir():
            return []

        canales: list[dict] = []
        for categoria_dir in sorted(p for p in base.iterdir() if p.is_dir()):
            for canal_dir in sorted(p for p in categoria_dir.iterdir() if p.is_dir()):
                datos = self._leer_canal(categoria_dir.name, canal_dir)
                if datos:
                    canales.append(datos)
        return canales

    @staticmethod
    def _sin_mensajes(datos: dict) -> dict:
        return {k: v for k, v in datos.items() if k != "_mensajes"}

    def listar(self) -> dict:
        """Todos los canales con su actividad agregada, sin el contenido."""
        canales = self._recorrer()
        base = get_transcripts_base()

        autores_unicos: set[str] = set()
        por_categoria: dict[str, int] = {}
        mensajes_por_categoria: dict[str, int] = {}
        primeros: list[datetime] = []
        ultimos: list[datetime] = []

        for canal in canales:
            for autor in canal["autores"]:
                autores_unicos.add(autor["nombre"])
            por_categoria[canal["categoria"]] = por_categoria.get(canal["categoria"], 0) + 1
            mensajes_por_categoria[canal["categoria"]] = (
                mensajes_por_categoria.get(canal["categoria"], 0) + canal["mensajes"]
            )
            if canal["primer_mensaje_at"]:
                primeros.append(canal["primer_mensaje_at"])
            if canal["ultimo_mensaje_at"]:
                ultimos.append(canal["ultimo_mensaje_at"])

        completos = sum(1 for c in canales if c["completo"])
        resumen = {
            "base_path": str(base),
            "base_disponible": base_disponible(),
            "base_es_canonica": base == CANONICAL_BASE,
            "canales_completos": completos,
            # Si ningún archivo tiene encabezado, todos son deltas: el bot los
            # apendeó sobre un cursor que vive en la base de ATV Clients, así que
            # el histórico completo está en otro lado (el server).
            "parcial": bool(canales) and completos == 0,
            "canales": len(canales),
            "mensajes": sum(c["mensajes"] for c in canales),
            "autores": len(autores_unicos),
            "adjuntos": sum(c["adjuntos"] for c in canales),
            "bytes": sum(c["bytes"] for c in canales),
            "primer_mensaje_at": min(primeros) if primeros else None,
            "ultimo_mensaje_at": max(ultimos) if ultimos else None,
            "por_categoria": por_categoria,
            "mensajes_por_categoria": mensajes_por_categoria,
        }

        ordenados = sorted(
            canales,
            key=lambda c: c["ultimo_mensaje_at"] or datetime.min.replace(tzinfo=AR_TZ),
            reverse=True,
        )
        return {"resumen": resumen, "canales": [self._sin_mensajes(c) for c in ordenados]}

    def obtener_canal(self, categoria: str, canal: str) -> dict:
        """Un canal con todos sus mensajes."""
        base = get_transcripts_base()
        carpeta = base / categoria / canal
        if not carpeta.is_dir():
            raise HTTPException(status_code=404, detail=f"No existe el canal #{canal}.")

        datos = self._leer_canal(categoria, carpeta)
        if not datos:
            raise HTTPException(status_code=404, detail=f"El canal #{canal} no tiene transcript.")

        return {"canal": self._sin_mensajes(datos), "mensajes": datos["_mensajes"]}
