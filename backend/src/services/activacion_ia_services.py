"""
Activación analizada por Claude Code (CLI), dos veces al día.

Decisión de Franco (sept 2026): usar el CLI de Claude Code con su suscripción
en vez de la API, un mes a prueba. Cada corrida guarda tokens y costo por
cliente para poder evaluarlo con números.

Recorte para no leer todo el historial:
- Clientes que entraron hace ≤ 60 días: se lee desde la entrada (activación
  todavía es accionable).
- Clientes más viejos: solo los últimos 30 días (sirve para blocker actual e
  intención de baja; la activación se conserva de la heurística o del análisis
  anterior).
"""

from __future__ import annotations

import json
import os
import logging
import re
import shutil
import subprocess
import threading
import time
from datetime import date, datetime, timedelta, timezone

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, desc, flush

from src.models import AnalisisActivacion, AnalisisCorrida
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.activacion_ia")

CLAUDE_BIN = config("CLAUDE_CLI_BIN", default="claude")
MODELO = config("ACTIVACION_IA_MODEL", default="claude-haiku-4-5")
TIMEOUT_S = int(config("ACTIVACION_IA_TIMEOUT", default="180"))
HORARIOS_AR = ((8, 0), (18, 0))
VENTANA_NUEVOS_DIAS = 60
VENTANA_VIEJOS_DIAS = 30
REANALISIS_ACTIVADO_DIAS = 7   # un activado se vuelve a mirar cada tanto (blocker / baja)
MAX_CHARS = 60_000

# Se incrementa cuando hay resultados nuevos; la cartera lo usa para saber si
# tiene que volver a leer los análisis (sin consultar la base en cada request).
version = 0

_lock = threading.Lock()
_en_ejecucion = False

SYSTEM_PROMPT = """Sos el analista de activación de ATV, una agencia de growth para creadores y emprendedores.
Leés la conversación del canal privado de Discord entre un cliente y el equipo de ATV y devolvés
UN SOLO objeto JSON, sin texto antes ni después, con exactamente estas claves:

{
  "activado": boolean,               // true si el CLIENTE reportó un primer resultado tangible ya ocurrido
  "primer_resultado_at": "YYYY-MM-DD" | null,   // fecha del mensaje donde lo cuenta
  "descripcion": string | null,      // frase TEXTUAL del cliente (máx 220 caracteres), no tu interpretación
  "tipo": "venta" | "cobro" | "cliente_nuevo" | "metrica" | "otro" | null,
  "confianza": number,               // 0 a 100
  "blocker": "cliente_ausente" | "no_implementa" | "bloqueo_tecnico" | "expectativa" | "esperando_equipo" | null,
  "blocker_detalle": string | null,  // una línea, concreta, qué lo frena hoy
  "intencion_baja": boolean,         // habla de reembolso, cancelar, irse, no seguir
  "intencion_baja_extracto": string | null,   // frase textual si aplica
  "resumen": string                  // 1 o 2 líneas: en qué está el cliente hoy
}

Reglas:
- Solo cuentan los mensajes del CLIENTE (marcados como "cliente"). Lo que dice el equipo no es evidencia.
- Resultado tangible = algo económico o de negocio que YA pasó: una venta, un cobro, un cliente cerrado,
  una métrica concreta que subió (leads, agendas, seguidores con número). Intenciones, planes o
  entusiasmo NO cuentan. "Todavía no vendí" NO es activación.
- Si hay varios resultados, primer_resultado_at es el PRIMERO en el tiempo.
- Si no hay resultado, activado=false y elegí el blocker que mejor describe por qué, con detalle en
  las palabras del cliente. Si el cliente casi no escribe, blocker=cliente_ausente.
- No inventes fechas ni frases. Si dudás, confianza baja.
- Respondé únicamente el JSON."""


# ------------------------------------------------------------------ CLI

def cli_disponible() -> bool:
    """Hay forma de hablar con Claude: API key o CLI instalado."""
    return bool(config("ANTHROPIC_API_KEY", default="")) or shutil.which(CLAUDE_BIN) is not None


def _extraer_json(texto: str) -> dict:
    texto = (texto or "").strip()
    texto = re.sub(r"^```(?:json)?\s*", "", texto)
    texto = re.sub(r"\s*```$", "", texto)
    try:
        data = json.loads(texto)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", texto)
        if not m:
            raise ValueError("Claude no devolvió JSON")
        data = json.loads(m.group())
    if not isinstance(data, dict):
        raise ValueError("La respuesta no es un objeto JSON")
    return data


API_KEY = config("ANTHROPIC_API_KEY", default="")
# Precio por millón de tokens (entrada, salida) para estimar el costo cuando va por API.
PRECIOS_USD = {"claude-haiku-4-5": (1.0, 5.0), "claude-sonnet-5": (3.0, 15.0), "claude-opus-5": (5.0, 25.0)}
_cliente_api = None


def via_api() -> bool:
    """Si hay ANTHROPIC_API_KEY, las llamadas van directo por HTTP (3-5 s) en vez del CLI (30-160 s en el VPS)."""
    return bool(API_KEY)


def cli_o_api_disponible() -> bool:
    return via_api() or cli_disponible()


def _invocar_api(system_prompt: str, user_prompt: str, modelo: str) -> tuple[str, dict]:
    global _cliente_api
    import anthropic

    if _cliente_api is None:
        _cliente_api = anthropic.Anthropic(api_key=API_KEY, timeout=TIMEOUT_S, max_retries=2)
    t = time.perf_counter()
    msg = _cliente_api.messages.create(
        model=modelo, max_tokens=4000, system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    duracion_ms = int((time.perf_counter() - t) * 1000)
    texto = "".join(getattr(b, "text", "") for b in msg.content)
    uso = msg.usage
    entrada = int(getattr(uso, "input_tokens", 0) or 0) + int(getattr(uso, "cache_read_input_tokens", 0) or 0) + int(getattr(uso, "cache_creation_input_tokens", 0) or 0)
    salida = int(getattr(uso, "output_tokens", 0) or 0)
    p_in, p_out = next((v for k, v in PRECIOS_USD.items() if modelo.startswith(k)), (1.0, 5.0))
    return texto.strip(), {
        "modelo": msg.model, "tokens_entrada": entrada, "tokens_salida": salida,
        "costo_usd": round(entrada / 1e6 * p_in + salida / 1e6 * p_out, 6), "duracion_ms": duracion_ms, "via": "api",
    }


def invocar_claude_texto(system_prompt: str, user_prompt: str, modelo: str | None = None) -> tuple[str, dict]:
    """Devuelve (texto_de_respuesta, meta con tokens y costo). Por API si hay clave; si no, `claude -p`."""
    if via_api():
        return _invocar_api(system_prompt, user_prompt, modelo or MODELO)
    cmd = [
        CLAUDE_BIN, "-p",
        "--model", modelo or MODELO,
        "--output-format", "json",
        "--max-turns", "1",
        "--no-session-persistence",
        # Sin herramientas ni MCP: solo texto → arranque más rápido y muchos menos tokens por llamada.
        "--tools", "",
        "--strict-mcp-config",
        "--system-prompt", system_prompt,
    ]
    env = dict(os.environ, DISABLE_AUTOUPDATER="1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1")
    t = time.perf_counter()
    proc = subprocess.run(cmd, input=user_prompt, capture_output=True, text=True, timeout=TIMEOUT_S, env=env)
    duracion_ms = int((time.perf_counter() - t) * 1000)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "").strip()[:400] or f"exit {proc.returncode}")
    try:
        envoltura = json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"Salida no JSON del CLI: {proc.stdout[:200]!r}")
    if envoltura.get("is_error") or envoltura.get("subtype") not in (None, "success"):
        raise RuntimeError(str(envoltura.get("result") or envoltura.get("subtype"))[:400])
    uso = envoltura.get("usage") or {}
    meta = {
        "modelo": next(iter((envoltura.get("modelUsage") or {}).keys()), modelo or MODELO),
        "tokens_entrada": int(uso.get("input_tokens") or 0) + int(uso.get("cache_read_input_tokens") or 0)
        + int(uso.get("cache_creation_input_tokens") or 0),
        "tokens_salida": int(uso.get("output_tokens") or 0),
        "costo_usd": float(envoltura.get("total_cost_usd") or 0.0),
        "duracion_ms": duracion_ms,
        "via": "cli",
    }
    return str(envoltura.get("result") or "").strip(), meta


def invocar_claude(system_prompt: str, user_prompt: str) -> tuple[dict, dict]:
    """Variante JSON: (json_del_analisis, meta)."""
    texto, meta = invocar_claude_texto(system_prompt, user_prompt)
    return _extraer_json(texto), meta


# ------------------------------------------------------------ selección

def _hoy_ar() -> date:
    return datetime.now(AR_TZ).date()


def _ventana_para(cliente: dict) -> tuple[date | None, str]:
    """Desde qué fecha leer: entrada completa para nuevos, 30 días para viejos."""
    entrada = date.fromisoformat(cliente["entradaAt"]) if cliente.get("entradaAt") else None
    hoy = _hoy_ar()
    if entrada and (hoy - entrada).days <= VENTANA_NUEVOS_DIAS:
        return entrada, "desde_entrada"
    return hoy - timedelta(days=VENTANA_VIEJOS_DIAS), "ultimos_30"


def _transcript_texto(mensajes: list[dict], desde: date | None, staff: set[str], canal: str) -> tuple[str, int]:
    from src.services.clientes_services import _autor_es_cliente

    lineas = []
    for m in mensajes:
        f = m["fecha_at"]
        if desde and f.date() < desde:
            continue
        rol = "cliente" if _autor_es_cliente(m["autor"], canal, staff) else "equipo"
        contenido = " ".join((m.get("contenido") or "").split())
        adj = f" [adjuntos: {len(m.get('adjuntos') or [])}]" if m.get("adjuntos") else ""
        lineas.append(f"[{f.strftime('%Y-%m-%d %H:%M')}] {m['autor']} ({rol}): {contenido}{adj}")
    texto = "\n".join(lineas)
    if len(texto) > MAX_CHARS:
        # Activación suele aparecer al principio; lo reciente importa para blocker y baja.
        cabeza, cola = texto[: MAX_CHARS * 2 // 3], texto[-MAX_CHARS // 3 :]
        texto = cabeza + "\n[… se omitió un tramo del medio por longitud …]\n" + cola
    return texto, len(lineas)


def _user_prompt(cliente: dict, transcript: str, desde: date | None, modo: str) -> str:
    return (
        f"Cliente: {cliente['nombre']}\n"
        f"Programa: {cliente.get('categoria')}\n"
        f"Entrada al programa (primer mensaje del canal): {cliente.get('entradaAt')}\n"
        f"Hoy: {_hoy_ar().isoformat()}\n"
        f"Ventana leída: {'desde la entrada' if modo == 'desde_entrada' else 'últimos 30 días'} (desde {desde})\n"
        f"Formato: [fecha hora] autor (cliente|equipo): mensaje\n\n"
        f"{transcript}"
    )


# ---------------------------------------------------------- persistencia

@db_session
def _cargar_existentes() -> dict[str, dict]:
    out = {}
    for a in AnalisisActivacion.select():
        try:
            res = json.loads(a.resultado)
        except (TypeError, ValueError):
            res = {}
        out[a.cliente_id] = {
            "resultado": res,
            "analizado_hasta": a.analizado_hasta,
            "analizado_at": a.analizado_at,
            "modelo": a.modelo,
            "error": a.error,
        }
    return out


@db_session
def _guardar(cliente: dict, resultado: dict | None, meta: dict | None, vistos: int, error: str | None) -> None:
    fila = AnalisisActivacion.get(cliente_id=cliente["id"])
    datos = dict(
        canal_id=cliente.get("canalId") or "",
        analizado_hasta=vistos,
        analizado_at=datetime.utcnow(),
        modelo=(meta or {}).get("modelo") or MODELO,
        tokens_entrada=(meta or {}).get("tokens_entrada", 0),
        tokens_salida=(meta or {}).get("tokens_salida", 0),
        costo_usd=(meta or {}).get("costo_usd", 0.0),
        error=error,
    )
    if resultado is not None:
        datos["resultado"] = json.dumps(resultado, ensure_ascii=False)
    if fila is None:
        AnalisisActivacion(cliente_id=cliente["id"], resultado=datos.pop("resultado", "{}"), **datos)
    else:
        for k, v in datos.items():
            setattr(fila, k, v)
    flush()


def resultados_actuales() -> dict[str, dict]:
    """cliente_id → análisis (para que la cartera lo superponga)."""
    return _cargar_existentes()


# ------------------------------------------------------------ corrida

def _debe_analizar(cliente: dict, previo: dict | None, total_msgs: int) -> tuple[bool, str]:
    if previo is None:
        return True, "primera vez"
    if total_msgs <= previo["analizado_hasta"]:
        return False, "sin mensajes nuevos"
    res = previo.get("resultado") or {}
    if res.get("activado"):
        edad = (datetime.utcnow() - previo["analizado_at"]).days
        if edad < REANALISIS_ACTIVADO_DIAS:
            return False, "activado, revisado hace poco"
    return True, "mensajes nuevos"


def ejecutar(origen: str = "programado") -> dict:
    global _en_ejecucion, version
    if not _lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay un análisis en ejecución.")
    _en_ejecucion = True
    inicio = time.perf_counter()
    analizados = omitidos = errores = 0
    tok_in = tok_out = 0
    costo = 0.0
    detalle: list[str] = []
    try:
        if not cli_disponible():
            raise HTTPException(status_code=503, detail=f"No se encuentra el CLI de Claude Code ({CLAUDE_BIN}).")
        from src.controllers.clientes_controller import service as clientes_service
        from src.services.clientes_services import _staff_desde_canales

        base = clientes_service.listar_base()
        activos = [c for c in base["clientes"] if c.get("estado") == "activo"]
        staff = _staff_desde_canales(clientes_service._canales_cliente())
        previos = _cargar_existentes()
        logger.info("Activación IA (%s): %s clientes activos", origen, len(activos))

        for cliente in activos:
            categoria, _, canal = (cliente.get("canalId") or "").partition("/")
            try:
                mensajes = clientes_service._tx.obtener_canal(categoria, canal)["mensajes"]
            except HTTPException:
                omitidos += 1
                continue
            hacer, motivo = _debe_analizar(cliente, previos.get(cliente["id"]), len(mensajes))
            if not hacer:
                omitidos += 1
                continue
            desde, modo = _ventana_para(cliente)
            transcript, n = _transcript_texto(mensajes, desde, staff, canal)
            if n == 0:
                omitidos += 1
                continue
            try:
                resultado, meta = invocar_claude(SYSTEM_PROMPT, _user_prompt(cliente, transcript, desde, modo))
                resultado["_modo"] = modo
                resultado["_mensajes_leidos"] = n
                _guardar(cliente, resultado, meta, len(mensajes), None)
                analizados += 1
                tok_in += meta["tokens_entrada"]
                tok_out += meta["tokens_salida"]
                costo += meta["costo_usd"]
                logger.info("  ✓ %s (%s, %s msgs) activado=%s costo=%.4f", cliente["nombre"], modo, n, resultado.get("activado"), meta["costo_usd"])
            except Exception as e:  # noqa: BLE001 — un cliente roto no frena la corrida
                errores += 1
                _guardar(cliente, None, None, len(mensajes) if previos.get(cliente["id"]) else 0, str(e)[:400])
                detalle.append(f"{cliente['nombre']}: {str(e)[:120]}")
                logger.warning("  ✗ %s: %s", cliente["nombre"], str(e)[:200])
            time.sleep(0.5)
        version += 1
    finally:
        duracion = time.perf_counter() - inicio
        with db_session:
            AnalisisCorrida(
                origen=origen, clientes_analizados=analizados, clientes_omitidos=omitidos, errores=errores,
                tokens_entrada=tok_in, tokens_salida=tok_out, costo_usd=costo, duracion_s=round(duracion, 1),
                detalle="\n".join(detalle)[:2000] or None,
            )
        _en_ejecucion = False
        _lock.release()
        logger.info("Activación IA: %s analizados, %s omitidos, %s errores, %.2f USD, %.0fs", analizados, omitidos, errores, costo, duracion)
    return estado()


def _proximo_slot() -> datetime:
    ahora = datetime.now(AR_TZ)
    candidatos = []
    for offset in range(0, 3):
        d = ahora.date() + timedelta(days=offset)
        for h, m in HORARIOS_AR:
            slot = datetime(d.year, d.month, d.day, h, m, tzinfo=AR_TZ)
            if slot > ahora:
                candidatos.append(slot)
    return min(candidatos)


@db_session
def estado() -> dict:
    ultima = AnalisisCorrida.select().order_by(desc(AnalisisCorrida.id)).first()
    inicio_mes = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    mes = [c for c in AnalisisCorrida.select() if c.ejecutado_at >= inicio_mes]
    n_analisis = AnalisisActivacion.select().count()
    activados = sum(1 for a in AnalisisActivacion.select() if '"activado": true' in (a.resultado or ""))
    return {
        "cli_disponible": cli_disponible(),
        "cli": CLAUDE_BIN,
        "modelo": MODELO,
        "token_configurado": bool(config("CLAUDE_CODE_OAUTH_TOKEN", default="") or config("ANTHROPIC_API_KEY", default="")),
        "en_ejecucion": _en_ejecucion,
        "horarios": [f"{h:02d}:{m:02d}" for h, m in HORARIOS_AR],
        "proximo_at": _proximo_slot().isoformat(),
        "ultima_corrida": None if ultima is None else {
            "ejecutado_at": ultima.ejecutado_at.replace(tzinfo=timezone.utc).astimezone(AR_TZ).isoformat(),
            "origen": ultima.origen,
            "clientes_analizados": ultima.clientes_analizados,
            "clientes_omitidos": ultima.clientes_omitidos,
            "errores": ultima.errores,
            "costo_usd": ultima.costo_usd,
            "tokens_entrada": ultima.tokens_entrada,
            "tokens_salida": ultima.tokens_salida,
            "duracion_s": ultima.duracion_s,
            "detalle": ultima.detalle,
        },
        "mes": {
            "corridas": len(mes),
            "clientes_analizados": sum(c.clientes_analizados for c in mes),
            "tokens_entrada": sum(c.tokens_entrada for c in mes),
            "tokens_salida": sum(c.tokens_salida for c in mes),
            "costo_usd": round(sum(c.costo_usd for c in mes), 4),
        },
        "clientes_con_analisis": n_analisis,
        "clientes_activados_ia": activados,
    }


def iniciar_scheduler(stop: threading.Event) -> None:
    """Corre a las 08:00 y 18:00 (Argentina). Sin APScheduler: un hilo que mira
    el reloj cada 30 s y no repite el mismo slot."""
    ultimo_slot: str | None = None
    while not stop.is_set():
        ahora = datetime.now(AR_TZ)
        for h, m in HORARIOS_AR:
            clave = f"{ahora.date()}-{h:02d}:{m:02d}"
            if ahora.hour == h and ahora.minute == m and ultimo_slot != clave:
                ultimo_slot = clave
                try:
                    ejecutar(origen="programado")
                except HTTPException as e:
                    logger.warning("Activación IA programada omitida: %s", e.detail)
                except Exception as e:  # noqa: BLE001
                    logger.exception("Activación IA programada falló: %s", e)
        stop.wait(30)
