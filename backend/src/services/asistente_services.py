"""
Asistente para el equipo: responde sobre la cartera, los transcripts y cómo
funciona cada vista. Corre sobre Claude Code (misma decisión que activación).

Recuperación antes de preguntar (para no mandar 66k mensajes):
- La cartera completa, una línea por cliente (score, silencio, activación, blocker, resumen IA).
- Los canales de los clientes mencionados en la pregunta: sus últimos mensajes.
- Búsqueda por palabras clave en todos los transcripts: las líneas que coinciden.
- El manual de vistas.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta

from decouple import config
from fastapi import HTTPException

from src.services.activacion_ia_services import cli_disponible, invocar_claude_texto
from src.services.asistente_manual import MANUAL
from src.services.transcripts_services import AR_TZ

MODELO = config("ASISTENTE_MODEL", default="claude-sonnet-5")
MAX_CLIENTES_DETALLE = 3
MENSAJES_POR_CANAL = 60
MAX_CHARS_CANAL = 12_000
MAX_HITS_BUSQUEDA = 40
STOPWORDS = set("""
que como cual cuales quien quienes donde cuando cuanto cuantos cuanta cuantas para por con sin sobre entre
desde hasta este esta estos estas ese esa esos esas aquel el la los las un una unos unas de del al lo le les
se su sus mi mis tu tus nos vos yo ya no si mas pero porque tiene tienen tengo hay esta estan son ser fue
hace dias semana semanas mes meses cliente clientes canal canales chat chats decime mostrame resumime
quiero saber ultimo ultima ultimos ultimas todo todos toda todas algo alguien cosa cosas
""".split())

SYSTEM_PROMPT = """Sos el asistente interno de ATV Ops para el equipo de fulfillment de ATV (agencia de growth
para creadores y emprendedores). Respondés en español rioplatense, directo y corto, como un colega que
conoce la cartera. Tenés: el manual de cómo funciona cada vista, la cartera de clientes con sus métricas,
y extractos de los transcripts de Discord relevantes a la pregunta.

Reglas:
- Respondé con los datos que te di. Si no están, decilo ("no tengo ese dato" / "no aparece en el transcript"),
  no inventes. Nunca inventes frases de clientes.
- Cuando cites algo de un transcript, indicá el canal y la fecha: (#canal, 5 sep).
- Si preguntan cómo funciona una vista o un número, explicá con el manual, en 3-6 líneas.
- Si la pregunta es sobre un cliente puntual, empezá por su estado (score, silencio, activación) y después el detalle.
- Formato: texto plano con párrafos cortos; listas con guiones solo si ayudan. Sin títulos, sin markdown pesado.
- Cerrá, cuando corresponda, con una acción concreta sugerida en una línea."""


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9#\s-]", " ", t)


def _palabras_clave(pregunta: str) -> list[str]:
    return [w for w in _norm(pregunta).split() if len(w) >= 5 and w not in STOPWORDS and not w.startswith("#")]


def _clientes_mencionados(pregunta: str, clientes: list[dict]) -> list[dict]:
    q = _norm(pregunta)
    tokens = set(q.split())
    hallados = []
    for c in clientes:
        canal = (c.get("canalId") or "").split("/")[-1]
        nombre_tokens = [t for t in _norm(c["nombre"]).split() if len(t) >= 4]
        if f"#{canal}" in q or canal in tokens or (nombre_tokens and all(t in tokens for t in nombre_tokens)):
            hallados.append(c)
        elif nombre_tokens and any(t in tokens for t in nombre_tokens) and len(nombre_tokens) == 1:
            hallados.append(c)
    return hallados[:MAX_CLIENTES_DETALLE]


def _linea_cliente(c: dict) -> str:
    act = c.get("activacion") or {}
    eng = c.get("engagement") or {}
    salud = c.get("salud") or {}
    partes = [
        f"{c['nombre']} · #{(c.get('canalId') or '').split('/')[-1]} · {c.get('categoria')} · coach {c.get('coachNombre') or '?'}",
        f"score {salud.get('score', '?')} ({salud.get('semaforo', '?')})" if salud else "",
        f"{eng.get('diasSinMensaje', '?')} d sin mensaje · {eng.get('mensajesClienteSemana', '?')} msgs/sem · tendencia {eng.get('tendencia', 0)}%",
        f"activado el {act.get('primerResultadoAt')} ({act.get('fuente', 'heuristica')})" if act.get("activado") else f"sin activar · blocker {act.get('blocker') or '—'}",
    ]
    if act.get("blockerDetalle"):
        partes.append(f"detalle: {act['blockerDetalle']}")
    if act.get("resumen"):
        partes.append(f"IA: {act['resumen']}")
    if (c.get("churnIntent") or {}).get("detectado"):
        partes.append("⚠ intención de baja")
    return " | ".join(p for p in partes if p)


def _extracto_canal(tx, cliente: dict, staff: set[str]) -> str:
    from src.services.clientes_services import _autor_es_cliente

    categoria, _, canal = (cliente.get("canalId") or "").partition("/")
    try:
        mensajes = tx.obtener_canal(categoria, canal)["mensajes"]
    except HTTPException:
        return ""
    ultimos = mensajes[-MENSAJES_POR_CANAL:]
    lineas = []
    for m in ultimos:
        rol = "cliente" if _autor_es_cliente(m["autor"], canal, staff) else "equipo"
        texto = " ".join((m.get("contenido") or "").split())
        lineas.append(f"[{m['fecha_at'].strftime('%Y-%m-%d %H:%M')}] {m['autor']} ({rol}): {texto}")
    out = "\n".join(lineas)
    return out[-MAX_CHARS_CANAL:]


def _buscar(tx, palabras: list[str], canales: list[dict], excluir: set[str]) -> list[str]:
    if not palabras:
        return []
    # Cualquier palabra clave cuenta; primero los mensajes que juntan más, después los más recientes.
    hits: list[tuple[int, datetime, str]] = []
    for canal in canales:
        if canal["id"] in excluir:
            continue
        for m in canal.get("_mensajes") or []:
            texto = _norm(m.get("contenido") or "")
            puntaje = sum(1 for p in palabras if p in texto)
            if puntaje:
                hits.append((puntaje, m["fecha_at"], f"[{m['fecha_at'].strftime('%Y-%m-%d')}] #{canal['canal']} · {m['autor']}: {' '.join((m.get('contenido') or '').split())[:220]}"))
    hits.sort(key=lambda h: (h[0], h[1]), reverse=True)
    return [h[2] for h in hits[:MAX_HITS_BUSQUEDA]]


def preguntar(pregunta: str, historial: list[dict] | None, usuario: dict) -> dict:
    pregunta = (pregunta or "").strip()
    if not pregunta:
        raise HTTPException(status_code=400, detail="Escribí una pregunta.")
    if not cli_disponible():
        raise HTTPException(status_code=503, detail="El asistente no está disponible: falta el CLI de Claude Code en este servidor.")

    from src.controllers.clientes_controller import service as clientes_service
    from src.services.clientes_services import _staff_desde_canales

    data = clientes_service.listar()
    activos = [c for c in data["clientes"] if c.get("estado") == "activo"]
    canales = clientes_service._canales_cliente()
    staff = _staff_desde_canales(canales)

    mencionados = _clientes_mencionados(pregunta, activos)
    palabras = _palabras_clave(pregunta)
    hits = _buscar(clientes_service._tx, palabras, canales, {(c.get("canalId") or "") for c in mencionados}) if palabras else []

    contexto = [f"Hoy: {datetime.now(AR_TZ).strftime('%Y-%m-%d %H:%M')} (Argentina). Usuario: {usuario.get('nombre') or usuario.get('username')} ({usuario.get('rol')})."]
    contexto.append("\n## Cartera (clientes activos)\n" + "\n".join(_linea_cliente(c) for c in activos))
    for c in mencionados:
        extracto = _extracto_canal(clientes_service._tx, c, staff)
        if extracto:
            contexto.append(f"\n## Últimos mensajes de #{(c.get('canalId') or '').split('/')[-1]} ({c['nombre']})\n{extracto}")
    if hits:
        contexto.append("\n## Mensajes que coinciden con la búsqueda (" + ", ".join(palabras) + ")\n" + "\n".join(hits))

    conversacion = ""
    for turno in (historial or [])[-8:]:
        rol = "Usuario" if turno.get("rol") == "usuario" else "Asistente"
        conversacion += f"{rol}: {turno.get('texto', '')}\n"

    user_prompt = (
        "\n".join(contexto)
        + "\n\n## Manual del sistema\n" + MANUAL
        + ("\n\n## Conversación previa\n" + conversacion if conversacion else "")
        + f"\n\n## Pregunta\n{pregunta}"
    )

    respuesta, meta = invocar_claude_texto(SYSTEM_PROMPT, user_prompt, modelo=MODELO)
    citas = [{"nombre": c["nombre"], "canalId": c.get("canalId"), "canal": (c.get("canalId") or "").split("/")[-1]} for c in mencionados]
    return {
        "respuesta": respuesta,
        "citas": citas,
        "coincidencias": len(hits),
        "modelo": meta.get("modelo"),
        "tokens_entrada": meta.get("tokens_entrada", 0),
        "tokens_salida": meta.get("tokens_salida", 0),
        "costo_usd": meta.get("costo_usd", 0.0),
        "duracion_ms": meta.get("duracion_ms", 0),
    }
