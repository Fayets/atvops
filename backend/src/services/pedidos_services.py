"""
Registro de pedidos abiertos (el "cerebro" de fulfillment).

Cada ronda (09, 13, 16, 19 AR) manda a Claude, por canal con mensajes nuevos,
los pedidos que estaban abiertos + solo los mensajes nuevos, y recibe la lista
actualizada. Así el estado se mantiene con pocos tokens y siempre al día.
El registro se exporta a markdown (cerebro/fulfillment/) después de cada ronda.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, desc, flush

from src.models import LedgerCanal, PedidoAbierto, RondaPendientes, UpdateConfirmado
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.pedidos")

HORARIOS_AR = ((9, 0), (13, 0), (16, 0), (19, 0))
MAX_MSGS_NUEVOS = 80
PARALELO = int(config("PEDIDOS_PARALELO", default=4))
MAX_CHARS = 14_000
TIPOS = ("consulta", "entregable", "agenda", "feedback", "seguimiento", "problema")
ESTADOS = ("esperando_equipo", "en_proceso", "esperando_cliente", "resuelto")
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
from src.services.cerebro_services import CEREBRO_DIR  # noqa: E402

_lock = threading.Lock()
version = 0
_progreso: dict = {"enCurso": False}


def _progreso_reset(origen: str, total: int) -> None:
    _progreso.clear()
    _progreso.update({
        "enCurso": True, "origen": origen, "inicioAt": datetime.now(AR_TZ).isoformat(), "finAt": None,
        "total": total, "procesados": 0, "leidos": 0, "saltados": 0, "cambios": 0, "errores": 0, "costoUsd": 0.0,
        "canalActual": None, "eventos": [],
    })


def _evento(texto: str, tipo: str = "info") -> None:
    _progreso.setdefault("eventos", []).append({"at": datetime.now(AR_TZ).strftime("%H:%M:%S"), "tipo": tipo, "texto": texto})
    del _progreso["eventos"][:-60]


def progreso() -> dict:
    return json.loads(json.dumps(_progreso))

SYSTEM_PROMPT = """Sos el asistente de operaciones de ATV. Mantenés el registro de PEDIDOS ABIERTOS de un
cliente: cada cosa que el cliente pidió al equipo (consulta, entregable, agenda de llamada, feedback,
seguimiento, problema) desde que la pide hasta que se resuelve DE VERDAD.

Te doy: los pedidos que ya estaban registrados (con id) y los mensajes NUEVOS del canal desde la última vez.
Devolvé ÚNICAMENTE un JSON con la lista completa actualizada:

{"pedidos": [
  {"id": "<mismo id si ya existía, o 'nuevo-1', 'nuevo-2'...>",
   "tipo": "consulta|entregable|agenda|feedback|seguimiento|problema",
   "tema": "2 a 6 palabras",
   "estado": "esperando_equipo|en_proceso|esperando_cliente|resuelto",
   "responsable": "nombre del miembro del equipo que debería resolverlo, o null",
   "creado_at": "YYYY-MM-DD HH:MM del mensaje del cliente que lo abrió",
   "nota": "una línea con el último avance, en tus palabras"}
]}

Reglas:
- esperando_equipo: el cliente pidió algo y el equipo todavía no respondió o no entregó.
- en_proceso: el equipo respondió y dijo que lo está haciendo, pero no entregó ("dale, mañana te lo mando" NO resuelve).
- esperando_cliente: el equipo pidió algo al cliente (datos, accesos, confirmar horario) y el cliente no contestó.
- resuelto: el equipo entregó / respondió completo / la llamada quedó agendada, y el cliente no volvió a insistir.
- Un saludo, un agradecimiento o un comentario sin pedido NO es un pedido. No inventes pedidos.
- Si un pedido registrado ya no tiene sentido (el cliente lo descartó), marcalo resuelto con nota.
- Mantené los ids de los pedidos existentes. Sin texto fuera del JSON."""


# --------------------------------------------------------------- helpers

def _ar(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc).astimezone(AR_TZ) if dt.tzinfo is None else dt.astimezone(AR_TZ)


def _pedido_a_dict(p: PedidoAbierto) -> dict:
    ahora = datetime.now(AR_TZ)
    creado = _ar(p.creado_at)
    return {
        "id": p.id,
        "clienteId": p.cliente_id,
        "canalId": p.canal_id,
        "canal": p.canal_id.split("/")[-1],
        "tipo": p.tipo,
        "tema": p.tema,
        "estado": p.estado,
        "responsable": p.responsable,
        "creadoAt": creado.isoformat(),
        "actualizadoAt": _ar(p.actualizado_at).isoformat(),
        "resueltoAt": _ar(p.resuelto_at).isoformat() if p.resuelto_at else None,
        "horasAbierto": round(((_ar(p.resuelto_at) if p.resuelto_at else ahora) - creado).total_seconds() / 3600, 1),
        "nota": p.nota,
    }


@db_session
def _abiertos_de(canal_id: str) -> list[PedidoAbierto]:
    return [p for p in PedidoAbierto.select() if p.canal_id == canal_id and p.estado != "resuelto"]


@db_session
def _ledger(canal_id: str) -> int:
    l = LedgerCanal.get(canal_id=canal_id)
    return l.analizado_hasta if l else 0


def _parsear_fecha(texto: str | None, default: datetime) -> datetime:
    if not texto:
        return default
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto, fmt).replace(tzinfo=AR_TZ)
        except ValueError:
            continue
    return default


# ---------------------------------------------------------------- ronda

def _actualizar_canal(cliente: dict, mensajes: list[dict], staff: set[str]) -> tuple[int, dict]:
    """Manda a Claude los abiertos + los mensajes nuevos, aplica la lista devuelta."""
    from src.services.activacion_ia_services import _extraer_json, invocar_claude_texto
    from src.services.clientes_services import _autor_es_cliente

    canal_id = cliente["canalId"]
    canal = canal_id.split("/")[-1]
    hasta = _ledger(canal_id)
    nuevos = mensajes[hasta:]
    if not nuevos:
        return 0, {}
    nuevos = nuevos[-MAX_MSGS_NUEVOS:]

    with db_session:
        abiertos = [_pedido_a_dict(p) | {"_obj": p.id} for p in _abiertos_de(canal_id)]
    existentes = [
        {"id": f"p{a['id']}", "tipo": a["tipo"], "tema": a["tema"], "estado": a["estado"], "responsable": a["responsable"], "creado_at": a["creadoAt"][:16].replace("T", " "), "nota": a["nota"]}
        for a in abiertos
    ]

    lineas = []
    for m in nuevos:
        rol = "cliente" if _autor_es_cliente(m["autor"], canal, staff) else "equipo"
        lineas.append(f"[{m['fecha_at'].strftime('%Y-%m-%d %H:%M')}] {m['autor']} ({rol}): {' '.join((m.get('contenido') or '').split())}{' [adjunto]' if m.get('adjuntos') else ''}")
    texto = "\n".join(lineas)[-MAX_CHARS:]

    user = (
        f"Cliente: {cliente['nombre']} · canal #{canal} · programa {cliente.get('categoria')} · coach habitual: {cliente.get('coachNombre') or '?'}\n"
        f"Hoy: {datetime.now(AR_TZ).strftime('%Y-%m-%d %H:%M')}\n\n"
        f"## Pedidos registrados\n{json.dumps(existentes, ensure_ascii=False) if existentes else '(ninguno)'}\n\n"
        f"## Mensajes nuevos del canal\n{texto}"
    )
    respuesta, meta = invocar_claude_texto(SYSTEM_PROMPT, user)
    data = _extraer_json(respuesta)
    lista = data.get("pedidos") if isinstance(data, dict) else None
    if not isinstance(lista, list):
        raise ValueError("Claude no devolvió 'pedidos'")

    ahora_utc = datetime.utcnow()
    cambios = 0
    with db_session:
        vistos: set[int] = set()
        for item in lista:
            if not isinstance(item, dict):
                continue
            tipo = str(item.get("tipo") or "consulta").lower()
            estado = str(item.get("estado") or "esperando_equipo").lower()
            if tipo not in TIPOS or estado not in ESTADOS:
                continue
            tema = str(item.get("tema") or "").strip()[:120] or "(sin tema)"
            raw_id = str(item.get("id") or "")
            obj = None
            if raw_id.startswith("p") and raw_id[1:].isdigit():
                obj = PedidoAbierto.get(id=int(raw_id[1:]))
                if obj is not None and obj.canal_id != canal_id:
                    obj = None
            if obj is None:
                if estado == "resuelto":
                    continue  # no registrar pedidos que nacen resueltos
                creado = _parsear_fecha(item.get("creado_at"), nuevos[0]["fecha_at"])
                campos = dict(
                    cliente_id=cliente["id"], canal_id=canal_id, tipo=tipo, tema=tema, estado=estado,
                    creado_at=creado.astimezone(timezone.utc).replace(tzinfo=None), actualizado_at=ahora_utc,
                )
                for k, v in (("responsable", item.get("responsable") or cliente.get("coachNombre")), ("nota", item.get("nota")), ("clave_ia", raw_id)):
                    if v:
                        campos[k] = str(v)[:200]
                obj = PedidoAbierto(**campos)
                flush()
                cambios += 1
            else:
                if obj.estado != estado or obj.tema != tema or (obj.nota or "") != (item.get("nota") or ""):
                    cambios += 1
                obj.tipo, obj.tema, obj.estado = tipo, tema, estado
                if item.get("responsable"):
                    obj.responsable = str(item["responsable"])[:200]
                if item.get("nota"):
                    obj.nota = str(item["nota"])[:500]
                obj.actualizado_at = ahora_utc
                if estado == "resuelto" and obj.resuelto_at is None:
                    obj.resuelto_at = ahora_utc
            vistos.add(obj.id)
        objetos = [PedidoAbierto.get(id=pid) for pid in vistos]
        resumen = {
            "abiertos": sum(1 for o in objetos if o is not None and o.estado != "resuelto"),
            "resueltos": sum(1 for o in objetos if o is not None and o.estado == "resuelto" and o.resuelto_at == ahora_utc),
        }
        # lo que estaba abierto y Claude no devolvió, se conserva (no se pierde nada por una omisión)
        led = LedgerCanal.get(canal_id=canal_id)
        if led is None:
            LedgerCanal(canal_id=canal_id, analizado_hasta=len(mensajes), actualizado_at=ahora_utc)
        else:
            led.analizado_hasta = len(mensajes)
            led.actualizado_at = ahora_utc
    meta = dict(meta, nuevos=len(nuevos), **resumen)
    return cambios, meta


def ejecutar_ronda(origen: str = "programada") -> dict:
    global version
    if not _lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay una ronda en curso.")
    canales_leidos = errores = cambios = 0
    tok_in = tok_out = 0
    costo = 0.0
    detalle: list[str] = []
    try:
        from src.services.activacion_ia_services import cli_disponible
        if not cli_disponible():
            raise HTTPException(status_code=503, detail="No se encuentra el CLI de Claude Code.")
        from src.controllers.clientes_controller import service as clientes_service
        from src.services.clientes_services import _staff_desde_canales

        data = clientes_service.listar()
        coaches = {c["id"]: c["nombre"] for c in data.get("coaches", [])}
        activos = [c | {"coachNombre": coaches.get(c.get("coachId"))} for c in data["clientes"] if c.get("estado") == "activo"]
        staff = _staff_desde_canales(clientes_service._canales_cliente())
        _progreso_reset(origen, len(activos))
        # Primero, qué canales tienen mensajes nuevos (barato, sin Claude).
        pendientes: list[tuple[dict, str, list[dict]]] = []
        for cliente in activos:
            categoria, _, canal = (cliente.get("canalId") or "").partition("/")
            try:
                mensajes = clientes_service._tx.obtener_canal(categoria, canal)["mensajes"]
            except HTTPException:
                _progreso["procesados"] += 1
                continue
            if len(mensajes) <= _ledger(cliente["canalId"]):
                _progreso["procesados"] += 1
                _progreso["saltados"] += 1
                continue
            pendientes.append((cliente, canal, mensajes))
        _evento(f"Arranca la ronda: {len(activos)} canales activos, {len(pendientes)} con mensajes nuevos, {PARALELO} en paralelo")
        estado_lock = threading.Lock()
        en_curso: list[str] = []

        def _procesar(item: tuple[dict, str, list[dict]]) -> None:
            nonlocal canales_leidos, cambios, tok_in, tok_out, costo, errores
            cliente, canal, mensajes = item
            with estado_lock:
                en_curso.append(canal)
                _progreso["canalActual"] = ", ".join(en_curso)
            try:
                n, meta = _actualizar_canal(cliente, mensajes, staff)
                with estado_lock:
                    canales_leidos += 1
                    cambios += n
                    tok_in += meta.get("tokens_entrada", 0)
                    tok_out += meta.get("tokens_salida", 0)
                    costo += meta.get("costo_usd", 0.0)
                    _evento(
                        f"#{canal}: {meta.get('nuevos', 0)} mensajes nuevos → {meta.get('abiertos', 0)} abiertos, {meta.get('resueltos', 0)} resueltos"
                        f"  ({meta.get('duracion_ms', 0) / 1000:.0f} s · {meta.get('tokens_entrada', 0) // 1000}k tokens · {meta.get('modelo', '')})",
                        "ok" if n else "info",
                    )
            except Exception as e:  # noqa: BLE001
                with estado_lock:
                    errores += 1
                    detalle.append(f"#{canal}: {str(e)[:120]}")
                    _evento(f"#{canal}: error ({str(e)[:80]})", "error")
                logger.warning("Ronda pedidos #%s: %s", canal, str(e)[:200])
            finally:
                with estado_lock:
                    if canal in en_curso:
                        en_curso.remove(canal)
                    _progreso["canalActual"] = ", ".join(en_curso) or None
                    _progreso["procesados"] += 1
                    _progreso.update(leidos=canales_leidos, cambios=cambios, errores=errores, costoUsd=round(costo, 4))

        with ThreadPoolExecutor(max_workers=max(1, PARALELO), thread_name_prefix="pedidos-canal") as pool:
            list(pool.map(_procesar, pendientes))
        version += 1
        with db_session:
            RondaPendientes(
                origen=origen, pendientes=json.dumps({"canales_leidos": canales_leidos, "cambios": cambios, "errores": errores}),
                resueltos="[]", etiquetados=cambios, tokens_entrada=tok_in, tokens_salida=tok_out, costo_usd=costo,
                error="\n".join(detalle)[:2000] or None,
            )
        try:
            exportar_cerebro()
        except Exception as e:  # noqa: BLE001
            logger.warning("Exportar cerebro: %s", e)
        logger.info("Ronda pedidos (%s): %s canales, %s cambios, %s errores, %.3f USD", origen, canales_leidos, cambios, errores, costo)
        _evento(f"Listo: {canales_leidos} canales leídos, {_progreso.get('saltados', 0)} sin novedades, {cambios} cambios, US$ {costo:.3f}", "fin")
    except Exception as e:  # noqa: BLE001
        _evento(f"La ronda falló: {str(e)[:120]}", "error")
        raise
    finally:
        _progreso["enCurso"] = False
        _progreso["canalActual"] = None
        _progreso["finAt"] = datetime.now(AR_TZ).isoformat()
        _lock.release()
    return estado()


def iniciar_ronda_en_fondo(origen: str = "manual") -> dict:
    """Dispara la ronda en un hilo y devuelve el progreso; el frontend lo va consultando."""
    if _lock.locked():
        return progreso()
    from src.services.activacion_ia_services import cli_disponible
    if not cli_disponible():
        raise HTTPException(status_code=503, detail="No se encuentra el CLI de Claude Code.")
    _progreso_reset(origen, 0)
    _evento("Preparando la cartera…")

    def _correr():
        try:
            ejecutar_ronda(origen)
        except Exception as e:  # noqa: BLE001
            logger.exception("Ronda en fondo falló: %s", e)

    threading.Thread(target=_correr, daemon=True, name="pedidos-manual").start()
    return progreso()


# ---------------------------------------------------------------- lectura

@db_session
def estado() -> dict:
    ahora = datetime.now(AR_TZ)
    hace7 = (ahora - timedelta(days=7)).astimezone(timezone.utc).replace(tzinfo=None)
    todos = [_pedido_a_dict(p) for p in PedidoAbierto.select()]
    abiertos = [p for p in todos if p["estado"] != "resuelto"]
    resueltos7 = [p for p in todos if p["estado"] == "resuelto" and p["resueltoAt"] and datetime.fromisoformat(p["resueltoAt"]).astimezone(timezone.utc).replace(tzinfo=None) >= hace7]

    por_resp: dict[str, dict] = {}
    for p in abiertos:
        r = p["responsable"] or "Sin asignar"
        b = por_resp.setdefault(r, {"responsable": r, "esperando_equipo": [], "en_proceso": [], "esperando_cliente": []})
        b[p["estado"]].append(p)
    for b in por_resp.values():
        for k in ("esperando_equipo", "en_proceso", "esperando_cliente"):
            b[k].sort(key=lambda p: -p["horasAbierto"])

    metricas = []
    for r in set([p["responsable"] or "Sin asignar" for p in todos]):
        res = [p for p in resueltos7 if (p["responsable"] or "Sin asignar") == r]
        ab = [p for p in abiertos if (p["responsable"] or "Sin asignar") == r]
        horas = sorted(p["horasAbierto"] for p in res)
        metricas.append({
            "responsable": r,
            "esperandoEquipo": sum(1 for p in ab if p["estado"] == "esperando_equipo"),
            "enProceso": sum(1 for p in ab if p["estado"] == "en_proceso"),
            "esperandoCliente": sum(1 for p in ab if p["estado"] == "esperando_cliente"),
            "masViejoHs": max((p["horasAbierto"] for p in ab if p["estado"] == "esperando_equipo"), default=0),
            "resueltos7d": len(res),
            "medianaResolucionHs": horas[len(horas) // 2] if horas else None,
        })
    metricas.sort(key=lambda m: (-m["esperandoEquipo"], -m["enProceso"]))

    ultima = RondaPendientes.select().order_by(desc(RondaPendientes.id)).first()
    inicio_mes = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    mes = [r for r in RondaPendientes.select() if r.ejecutado_at >= inicio_mes]
    return {
        "generadoAt": ahora.isoformat(),
        "horarios": [f"{h:02d}:{m:02d}" for h, m in HORARIOS_AR],
        "abiertos": len(abiertos),
        "esperandoEquipo": sum(1 for p in abiertos if p["estado"] == "esperando_equipo"),
        "enProceso": sum(1 for p in abiertos if p["estado"] == "en_proceso"),
        "esperandoCliente": sum(1 for p in abiertos if p["estado"] == "esperando_cliente"),
        "resueltos7d": len(resueltos7),
        "porResponsable": sorted(por_resp.values(), key=lambda b: -(len(b["esperando_equipo"]) * 10 + len(b["en_proceso"]))),
        "resueltosRecientes": sorted(resueltos7, key=lambda p: p["resueltoAt"], reverse=True)[:30],
        "metricas": metricas,
        "ultimaRonda": None if ultima is None else {
            "ejecutadoAt": ultima.ejecutado_at.replace(tzinfo=timezone.utc).astimezone(AR_TZ).isoformat(),
            "origen": ultima.origen,
            **json.loads(ultima.pendientes or "{}"),
            "costo_usd": ultima.costo_usd,
            "error": ultima.error,
        },
        "mes": {"rondas": len(mes), "costo_usd": round(sum(r.costo_usd for r in mes), 4), "tokens": sum(r.tokens_entrada + r.tokens_salida for r in mes)},
        "updateConfirmado": _ultimo_confirmado(),
        "cerebroDir": str(CEREBRO_DIR),
    }


def _ultimo_confirmado() -> dict | None:
    u = UpdateConfirmado.select().order_by(desc(UpdateConfirmado.id)).first()
    if u is None:
        return None
    return {
        "id": u.id, "texto": u.texto, "confirmadoPor": u.confirmado_por,
        "confirmadoAt": u.confirmado_at.replace(tzinfo=timezone.utc).astimezone(AR_TZ).isoformat(), "rondaId": u.ronda_id,
    }


def confirmar_update(texto: str, usuario: dict) -> dict:
    """Guarda el update tal como quedó (editado o no) y lo deja en el cerebro con fecha y hora."""
    texto = (texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="El update está vacío.")
    quien = usuario.get("nombre") or usuario.get("username") or "?"
    with db_session:
        ultima = RondaPendientes.select().order_by(desc(RondaPendientes.id)).first()
        u = UpdateConfirmado(texto=texto[:20000], confirmado_por=quien, ronda_id=ultima.id if ultima else None)
        flush()
        uid = u.id
    ahora = datetime.now(AR_TZ)
    carpeta = CEREBRO_DIR / "fulfillment" / "updates"
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / f"{ahora.strftime('%Y-%m-%d-%H%M')}.md").write_text(
        f"---\nfecha: {ahora.strftime('%Y-%m-%d %H:%M')}\nconfirmado_por: {quien}\n---\n\n```\n{texto}\n```\n", encoding="utf-8"
    )
    borrador = carpeta / "borrador.md"
    if borrador.exists():
        borrador.unlink()
    logger.info("Update confirmado por %s (#%s)", quien, uid)
    with db_session:
        return _ultimo_confirmado()


def texto_update(est: dict) -> str:
    hoy = datetime.now(AR_TZ)
    lineas = ["=" * 40, "Buenas, buenasss!!", f"Update: {hoy.strftime('%d-%m-%Y')} · {hoy.strftime('%H:%M')}", ""]
    for b in est["porResponsable"]:
        if not (b["esperando_equipo"] or b["en_proceso"] or b["esperando_cliente"]):
            continue
        lineas.append(f"• @{b['responsable']}")
        for p in b["esperando_equipo"]:
            lineas.append(f"⚠️ ⏳ {int(round(p['horasAbierto']))}h  # {p['canal']}  {p['tipo'].capitalize()}: {p['tema']}")
        for p in b["en_proceso"]:
            lineas.append(f"🔲  # {p['canal']}  {p['tipo'].capitalize()}: {p['tema']} | En proceso")
        for p in b["esperando_cliente"]:
            lineas.append(f"⏸️  # {p['canal']}  {p['tipo'].capitalize()}: {p['tema']} | Esperando al cliente")
        lineas.append("")
    hace24 = hoy - timedelta(hours=24)
    rec = [p for p in est["resueltosRecientes"] if datetime.fromisoformat(p["resueltoAt"]) >= hace24]
    if rec:
        lineas.append("Resueltos (últimas 24 h):")
        for p in rec:
            lineas.append(f"✅ # {p['canal']}  {p['tipo'].capitalize()}: {p['tema']}  ({int(round(p['horasAbierto']))}h)")
    return "\n".join(lineas).strip()


# -------------------------------------------------------------- cerebro

def exportar_cerebro() -> Path:
    """Escribe el registro en markdown: un archivo por canal con sus pedidos, y
    el update del día. Es la parte de fulfillment del cerebro compartido."""
    est = estado()
    base = CEREBRO_DIR / "fulfillment"
    (base / "pedidos").mkdir(parents=True, exist_ok=True)
    (base / "updates").mkdir(parents=True, exist_ok=True)
    with db_session:
        por_canal: dict[str, list[dict]] = {}
        for p in PedidoAbierto.select():
            por_canal.setdefault(p.canal_id, []).append(_pedido_a_dict(p))
    for canal_id, pedidos in por_canal.items():
        nombre = re.sub(r"[^a-z0-9_-]", "-", canal_id.split("/")[-1].lower())
        abiertos = [p for p in pedidos if p["estado"] != "resuelto"]
        resueltos = sorted([p for p in pedidos if p["estado"] == "resuelto"], key=lambda p: p["resueltoAt"] or "", reverse=True)[:20]
        md = [f"---\ncanal: {canal_id}\nactualizado: {datetime.now(AR_TZ).isoformat()}\nabiertos: {len(abiertos)}\n---", f"# #{canal_id.split('/')[-1]}", "", "## Abiertos"]
        for p in sorted(abiertos, key=lambda p: -p["horasAbierto"]):
            md.append(f"- [{p['estado']}] **{p['tipo']}**: {p['tema']} · responsable {p['responsable'] or '—'} · desde {p['creadoAt'][:16].replace('T', ' ')} ({int(p['horasAbierto'])} h)" + (f"\n  - {p['nota']}" if p["nota"] else ""))
        if not abiertos:
            md.append("- (nada abierto)")
        md += ["", "## Resueltos recientes"] + [f"- ✅ **{p['tipo']}**: {p['tema']} · {p['resueltoAt'][:10]} · tardó {int(p['horasAbierto'])} h" for p in resueltos]
        (base / "pedidos" / f"{nombre}.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    (base / "updates" / "borrador.md").write_text(
        f"---\nfecha: {datetime.now(AR_TZ).strftime('%Y-%m-%d %H:%M')}\nestado: borrador (sin confirmar)\n---\n\n```\n{texto_update(est)}\n```\n", encoding="utf-8"
    )
    return base


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
                    logger.exception("Ronda de pedidos falló: %s", e)
        stop.wait(30)
