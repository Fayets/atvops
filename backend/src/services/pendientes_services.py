"""
Pendientes de respuesta: lo que Mauri revisa a mano cuatro veces por día.

Para cada canal de cliente: si el último mensaje es del cliente y nadie del
equipo respondió, es un pendiente. Se calcula en vivo desde los transcripts.
Las rondas (09, 13, 16, 19 AR) sacan la foto, etiquetan los pendientes nuevos
con Claude (una sola llamada) y marcan qué se resolvió desde la anterior.
El tiempo de respuesta por coach sale de todo el historial, no de las rondas.
"""

from __future__ import annotations

import json
import logging
import statistics
import threading
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from pony.orm import db_session, desc

from src.models import RondaPendientes
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.pendientes")

HORARIOS_AR = ((9, 0), (13, 0), (16, 0), (19, 0))
MAX_EXTRACTO = 160
VENTANA_RESPUESTA_DIAS = 30
MAX_RESPUESTA_HS = 96  # gaps más largos no son "respuesta", son otra conversación

_lock = threading.Lock()
_etiquetas_cache: dict[str, str] = {}   # clave pendiente → etiqueta de Claude
version = 0

SYSTEM_ETIQUETAS = """Sos el asistente de operaciones de ATV. Te doy una lista de pedidos de clientes que están
esperando respuesta del equipo (los últimos mensajes del cliente en su canal de Discord).
Para cada uno devolvé una etiqueta corta en este formato exacto: "Tipo: Tema", donde Tipo es uno de
Consulta, Entregable, Agenda, Feedback, Seguimiento, Problema, Cortesía; y Tema son 2 a 6 palabras que
resumen qué pide. Ejemplos: "Consulta: Gestión de leads", "Entregable: Guía de contenidos",
"Agenda: Coordinar llamada". Usá "Cortesía: no requiere respuesta" cuando el último mensaje del cliente
es un saludo, un agradecimiento o un cierre ("gracias!", "buen finde", "dale, perfecto") y no pide nada.
Respondé ÚNICAMENTE un objeto JSON {"<id>": "<etiqueta>", ...} con todos los ids que te di, sin texto extra."""


def _clave(p: dict) -> str:
    return f"{p['canalId']}|{p['desdeAt']}"


def calcular_pendientes() -> dict:
    """Foto en vivo: pendientes por coach + métricas de respuesta por coach."""
    from src.controllers.clientes_controller import service as clientes_service
    from src.services.clientes_services import _autor_es_cliente, _staff_desde_canales

    data = clientes_service.listar()
    activos = [c for c in data["clientes"] if c.get("estado") == "activo"]
    canales = clientes_service._canales_cliente()
    staff = _staff_desde_canales(canales)
    ahora = datetime.now(AR_TZ)
    desde_metricas = ahora - timedelta(days=VENTANA_RESPUESTA_DIAS)

    pendientes: list[dict] = []
    respuestas_por_coach: dict[str, list[float]] = defaultdict(list)
    esperando_cliente = 0

    for c in activos:
        categoria, _, canal = (c.get("canalId") or "").partition("/")
        try:
            mensajes = clientes_service._tx.obtener_canal(categoria, canal)["mensajes"]
        except HTTPException:
            continue
        if not mensajes:
            continue

        # Tiempos de respuesta históricos: primer mensaje del cliente sin responder → primera respuesta del equipo.
        pendiente_desde = None
        ultimo_staff = None
        for m in mensajes:
            es_cli = _autor_es_cliente(m["autor"], canal, staff)
            if es_cli:
                if pendiente_desde is None:
                    pendiente_desde = m["fecha_at"]
            else:
                ultimo_staff = m["autor"]
                if pendiente_desde is not None:
                    horas = (m["fecha_at"] - pendiente_desde).total_seconds() / 3600
                    if 0 < horas <= MAX_RESPUESTA_HS and m["fecha_at"] >= desde_metricas:
                        respuestas_por_coach[m["autor"]].append(horas)
                    pendiente_desde = None

        ultimo = mensajes[-1]
        if _autor_es_cliente(ultimo["autor"], canal, staff) and pendiente_desde is not None:
            sin_responder = [m for m in mensajes if m["fecha_at"] >= pendiente_desde]
            texto = " ".join((sin_responder[-1].get("contenido") or "").split())
            pendientes.append({
                "clienteId": c["id"],
                "canalId": c.get("canalId"),
                "canal": canal,
                "nombre": c["nombre"],
                "categoria": c.get("categoria"),
                "coach": ultimo_staff or c.get("coachNombre") or "Equipo",
                "desdeAt": pendiente_desde.isoformat(),
                "horas": round((ahora - pendiente_desde).total_seconds() / 3600, 1),
                "mensajesSinResponder": len(sin_responder),
                "extracto": (texto[: MAX_EXTRACTO - 1] + "…") if len(texto) > MAX_EXTRACTO else texto,
                "adjuntos": sum(len(m.get("adjuntos") or []) for m in sin_responder),
            })
        else:
            esperando_cliente += 1

    for p in pendientes:
        p["etiqueta"] = _etiquetas_cache.get(_clave(p))
        p["cortesia"] = bool(p["etiqueta"] and p["etiqueta"].lower().startswith("cortes"))
    pendientes.sort(key=lambda p: (p["cortesia"], -p["horas"]))

    por_coach: dict[str, list[dict]] = defaultdict(list)
    for p in pendientes:
        por_coach[p["coach"]].append(p)

    metricas = []
    coaches = set(por_coach) | set(respuestas_por_coach)
    for coach in coaches:
        gaps = respuestas_por_coach.get(coach, [])
        metricas.append({
            "coach": coach,
            "pendientes": sum(1 for p in por_coach.get(coach, []) if not p["cortesia"]),
            "pendienteMaxHs": max((p["horas"] for p in por_coach.get(coach, []) if not p["cortesia"]), default=0),
            "respuestas30d": len(gaps),
            "medianaHs": round(statistics.median(gaps), 1) if gaps else None,
            "p90Hs": round(sorted(gaps)[int(len(gaps) * 0.9) - 1] if len(gaps) >= 10 else max(gaps), 1) if gaps else None,
        })
    metricas.sort(key=lambda m: (-m["pendientes"], -(m["medianaHs"] or 0)))

    return {
        "generadoAt": ahora.isoformat(),
        "total": sum(1 for p in pendientes if not p["cortesia"]),
        "cortesias": sum(1 for p in pendientes if p["cortesia"]),
        "esperandoCliente": esperando_cliente,
        "porCoach": [{"coach": k, "items": v} for k, v in sorted(por_coach.items(), key=lambda kv: -len(kv[1]))],
        "pendientes": pendientes,
        "metricas": metricas,
        "horarios": [f"{h:02d}:{m:02d}" for h, m in HORARIOS_AR],
        "ultimaRonda": _ultima_ronda(),
    }


# ---------------------------------------------------------------- rondas

@db_session
def _ultima_ronda() -> dict | None:
    r = RondaPendientes.select().order_by(desc(RondaPendientes.id)).first()
    if r is None:
        return None
    try:
        resueltos = json.loads(r.resueltos)
    except ValueError:
        resueltos = []
    return {
        "id": r.id,
        "ejecutadoAt": r.ejecutado_at.replace(tzinfo=timezone.utc).astimezone(AR_TZ).isoformat(),
        "origen": r.origen,
        "pendientes": len(json.loads(r.pendientes)) if r.pendientes else 0,
        "resueltos": resueltos,
        "etiquetados": r.etiquetados,
        "costo_usd": r.costo_usd,
        "error": r.error,
    }


def _etiquetar(pendientes: list[dict]) -> tuple[int, dict]:
    """Una sola llamada a Claude para todos los pendientes sin etiqueta."""
    from src.services.activacion_ia_services import _extraer_json, cli_disponible, invocar_claude_texto

    nuevos = [p for p in pendientes if not p.get("etiqueta")]
    if not nuevos or not cli_disponible():
        return 0, {}
    items = []
    for i, p in enumerate(nuevos):
        items.append(f"[{i}] #{p['canal']} ({p['nombre']}, {p['categoria']}): {p['extracto']}")
    texto, meta = invocar_claude_texto(SYSTEM_ETIQUETAS, "\n".join(items))
    data = _extraer_json(texto)
    n = 0
    for i, p in enumerate(nuevos):
        et = data.get(str(i))
        if isinstance(et, str) and et.strip():
            p["etiqueta"] = et.strip()[:80]
            _etiquetas_cache[_clave(p)] = p["etiqueta"]
            n += 1
    return n, meta


def ejecutar_ronda(origen: str = "programada") -> dict:
    global version
    if not _lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay una ronda en curso.")
    try:
        anterior = _ultima_ronda()
        foto = calcular_pendientes()
        etiquetados, meta, error = 0, {}, None
        try:
            etiquetados, meta = _etiquetar(foto["pendientes"])
        except Exception as e:  # noqa: BLE001 — sin etiquetas la ronda igual sirve
            error = f"etiquetas: {str(e)[:200]}"
            logger.warning("Ronda: no se pudieron etiquetar: %s", e)

        # Resueltos: estaban pendientes en la ronda anterior y ya no.
        resueltos: list[dict] = []
        if anterior:
            with db_session:
                prev = json.loads(RondaPendientes[anterior["id"]].pendientes)
            actuales = {_clave(p) for p in foto["pendientes"]}
            ahora = datetime.now(AR_TZ)
            for p in prev:
                if _clave(p) in actuales:
                    continue
                resueltos.append({**p, "resueltoAt": ahora.isoformat(), "horasEspera": p["horas"]})
        with db_session:
            RondaPendientes(
                origen=origen,
                pendientes=json.dumps(foto["pendientes"], ensure_ascii=False),
                resueltos=json.dumps(resueltos, ensure_ascii=False),
                etiquetados=etiquetados,
                tokens_entrada=meta.get("tokens_entrada", 0),
                tokens_salida=meta.get("tokens_salida", 0),
                costo_usd=meta.get("costo_usd", 0.0),
                error=error,
            )
        version += 1
        logger.info("Ronda %s: %s pendientes, %s etiquetados, %s resueltos", origen, len(foto["pendientes"]), etiquetados, len(resueltos))
    finally:
        _lock.release()
    return calcular_pendientes()


def texto_update(foto: dict) -> str:
    """El update en el formato que usa el equipo en #updates."""
    hoy = datetime.now(AR_TZ)
    lineas = ["=" * 40, "Buenas, buenasss!!", f"Update: {hoy.strftime('%d-%m-%Y')} · {hoy.strftime('%H:%M')}", ""]
    for bloque in foto["porCoach"]:
        lineas.append(f"• @{bloque['coach']}")
        for p in bloque["items"]:
            if p.get("cortesia"):
                continue
            h = int(round(p["horas"]))
            etiqueta = p.get("etiqueta") or p.get("extracto") or ""
            lineas.append(f"⚠️ ⏳ {h}h  # {p['canal']}  {etiqueta}")
        lineas.append("")
    resueltos = (foto.get("ultimaRonda") or {}).get("resueltos") or []
    if resueltos:
        lineas.append("Resueltos desde la última ronda:")
        for r in resueltos:
            lineas.append(f"✅ # {r['canal']}  {r.get('etiqueta') or r.get('extracto') or ''}  ({int(round(r['horasEspera']))}h de espera)")
    return "\n".join(lineas).strip()


def iniciar_scheduler(stop: threading.Event) -> None:
    ultimo_slot: str | None = None
    while not stop.is_set():
        ahora = datetime.now(AR_TZ)
        for h, m in HORARIOS_AR:
            clave = f"{ahora.date()}-{h:02d}:{m:02d}"
            if ahora.hour == h and ahora.minute == m and ultimo_slot != clave:
                ultimo_slot = clave
                try:
                    ejecutar_ronda(origen="programada")
                except Exception as e:  # noqa: BLE001
                    logger.exception("Ronda programada falló: %s", e)
        stop.wait(30)
