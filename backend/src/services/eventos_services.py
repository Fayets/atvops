"""
Log de eventos por cliente.

Los escribe Claude en la ronda (hitos, intenciones, blockers, riesgos) y el sistema
en los cambios que calcula solo (cambio de fase, silencio). Se consultan por tipo,
tag, responsable, estado o fecha; ATV AI los usa para responder sobre el historial.
El vocabulario de tipos y tags vive en cerebro/fulfillment/log-cliente.md.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from datetime import datetime, timedelta, timezone

from pony.orm import db_session, desc

from src.models import EventoCliente
from src.services import cerebro_services as cerebro
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.eventos")
version = 0
TIPOS_DEFAULT = ["hito", "intencion", "cambio_fase", "blocker", "silencio", "riesgo"]
TAGS_DEFAULT = ["problema_tecnico", "bajo_engagement", "ready_to_scale", "falta_oferta", "falta_trafico",
                "problema_ventas", "problema_entrega", "espera_equipo", "espera_cliente", "dinero", "equipo", "personal"]
DIAS_SILENCIO = 3


def _nota() -> str:
    ruta = cerebro.CEREBRO_DIR / "fulfillment" / "log-cliente.md"
    if not ruta.exists():
        ruta = cerebro.SEMILLA_DIR / "fulfillment" / "log-cliente.md"
    try:
        _, cuerpo = cerebro._frontmatter(ruta.read_text(encoding="utf-8"))
        return cuerpo
    except OSError:
        return ""


def _lista(prefijo: str, default: list[str]) -> list[dict]:
    salida = []
    for linea in _nota().splitlines():
        m = re.match(rf"^\s*-\s*{prefijo}:\s*([a-z_]+)\s*(?:·\s*([^·]+?)\s*)?(?:·\s*(.*))?$", linea)
        if m:
            salida.append({"id": m.group(1), "label": (m.group(2) or m.group(1)).strip(), "descripcion": (m.group(3) or "").strip()})
    return salida or [{"id": x, "label": x, "descripcion": ""} for x in default]


def tipos() -> list[dict]:
    return _lista("id", TIPOS_DEFAULT)


def tags() -> list[dict]:
    return _lista("tag", TAGS_DEFAULT)


def vocabulario_para_prompt() -> str:
    t = "\n".join(f"- {x['id']}: {x['descripcion'] or x['label']}" for x in tipos())
    g = ", ".join(x["id"] for x in tags())
    return f"### Tipos de evento\n{t}\n\n### Tags permitidos (no inventes otros)\n{g}"


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def _clave(canal_id: str, fecha: datetime, tipo: str, titulo: str) -> str:
    return f"{canal_id}|{fecha.date()}|{tipo}|{_norm(titulo)[:60]}"


def _a_dict(e: EventoCliente) -> dict:
    return {
        "id": e.id, "clienteId": e.cliente_id, "canalId": e.canal_id, "canal": e.canal_id.split("/")[-1],
        "fecha": e.fecha.replace(tzinfo=timezone.utc).astimezone(AR_TZ).isoformat(),
        "tipo": e.tipo, "titulo": e.titulo, "extracto": e.extracto or None, "responsable": e.responsable or None,
        "tags": json.loads(e.tags or "[]"), "estado": e.estado or None,
        "resueltoAt": e.resuelto_at.replace(tzinfo=timezone.utc).astimezone(AR_TZ).isoformat() if e.resuelto_at else None,
        "fase": e.fase or None, "score": e.score, "fuente": e.fuente,
        "diasAbierto": round((datetime.utcnow() - e.fecha).total_seconds() / 86400, 1) if e.estado == "abierto" else None,
    }


def _parsear_fecha(texto: str | None, default: datetime) -> datetime:
    if not texto:
        return default
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(texto)[:16 if " " in str(texto) else 10], fmt).replace(tzinfo=AR_TZ).astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            continue
    return default


def registrar(cliente_id: str, canal_id: str, eventos: list[dict], fuente: str = "claude", contexto: dict | None = None) -> int:
    """Guarda eventos nuevos (dedupe por canal+día+tipo+título) y cierra blockers resueltos."""
    global version
    if not eventos:
        return 0
    tipos_ok = {t["id"] for t in tipos()}
    tags_ok = {t["id"] for t in tags()}
    ahora = datetime.utcnow()
    nuevos = 0
    with db_session:
        abiertos = {e.clave: e for e in EventoCliente.select() if e.canal_id == canal_id and e.estado == "abierto"}
        for ev in eventos:
            if not isinstance(ev, dict):
                continue
            tipo = str(ev.get("tipo") or "").lower()
            titulo = str(ev.get("titulo") or "").strip()[:200]
            if tipo not in tipos_ok or not titulo:
                continue
            fecha = _parsear_fecha(ev.get("fecha"), ahora)
            estado = str(ev.get("estado") or "").lower()
            estado = estado if estado in ("abierto", "resuelto") else ("abierto" if tipo == "blocker" else "")
            clave = _clave(canal_id, fecha, tipo, titulo)
            previo = EventoCliente.get(clave=clave)
            if previo is not None:
                if estado == "resuelto" and previo.estado == "abierto":
                    previo.estado, previo.resuelto_at = "resuelto", ahora
                continue
            campos = {
                "cliente_id": cliente_id, "canal_id": canal_id, "fecha": fecha, "tipo": tipo, "titulo": titulo,
                "tags": json.dumps([t for t in (ev.get("tags") or []) if t in tags_ok][:4], ensure_ascii=False),
                "clave": clave, "fuente": fuente, "registrado_at": ahora,
            }
            for k, v in (("extracto", ev.get("extracto")), ("responsable", ev.get("responsable")), ("estado", estado),
                         ("fase", (contexto or {}).get("fase"))):
                if v:
                    campos[k] = str(v)[:500]
            if (contexto or {}).get("score") is not None:
                campos["score"] = int(contexto["score"])
            if estado == "resuelto":
                campos["resuelto_at"] = ahora
            EventoCliente(**campos)
            nuevos += 1
        # Blockers viejos que Claude ya no menciona y el cliente siguió: se cierran solos.
        limite = ahora - timedelta(days=14)
        vistos = {_clave(canal_id, _parsear_fecha(e.get("fecha"), ahora), str(e.get("tipo") or ""), str(e.get("titulo") or "")) for e in eventos if isinstance(e, dict)}
        for clave, e in abiertos.items():
            if clave not in vistos and e.fecha < limite:
                e.estado, e.resuelto_at = "resuelto", ahora
    version += 1
    return nuevos


@db_session
def listar(cliente_id: str | None = None, tipo: str | None = None, tag: str | None = None,
           estado: str | None = None, responsable: str | None = None, desde_dias: int | None = None,
           abiertos_hace: int | None = None, limite: int = 200) -> list[dict]:
    """Consulta estructurada. abiertos_hace=7 → blockers abiertos hace 7 días o más."""
    q = EventoCliente.select()
    salida = []
    corte = datetime.utcnow() - timedelta(days=desde_dias) if desde_dias else None
    corte_abierto = datetime.utcnow() - timedelta(days=abiertos_hace) if abiertos_hace is not None else None
    for e in q.order_by(desc(EventoCliente.fecha)):
        if cliente_id and e.cliente_id != cliente_id:
            continue
        if tipo and e.tipo != tipo:
            continue
        if estado and (e.estado or "") != estado:
            continue
        if responsable and _norm(e.responsable or "") != _norm(responsable):
            continue
        if corte and e.fecha < corte:
            continue
        if corte_abierto is not None and not (e.estado == "abierto" and e.fecha <= corte_abierto):
            continue
        if tag and tag not in json.loads(e.tags or "[]"):
            continue
        salida.append(_a_dict(e))
        if len(salida) >= limite:
            break
    return salida


@db_session
def resumen() -> dict:
    todos = [_a_dict(e) for e in EventoCliente.select()]
    hace30 = datetime.now(AR_TZ) - timedelta(days=30)
    recientes = [e for e in todos if datetime.fromisoformat(e["fecha"]) >= hace30]
    por_tag: dict[str, int] = {}
    for e in recientes:
        for t in e["tags"]:
            por_tag[t] = por_tag.get(t, 0) + 1
    abiertos = [e for e in todos if e["estado"] == "abierto"]
    return {
        "total": len(todos),
        "ultimos30": len(recientes),
        "porTipo": {t["id"]: sum(1 for e in recientes if e["tipo"] == t["id"]) for t in tipos()},
        "porTag": dict(sorted(por_tag.items(), key=lambda x: -x[1])),
        "blockersAbiertos": len(abiertos),
        "blockersViejos": sorted([e for e in abiertos if (e["diasAbierto"] or 0) >= 7], key=lambda e: -(e["diasAbierto"] or 0))[:20],
    }


def markdown(eventos: list[dict], limite: int = 25) -> str:
    if not eventos:
        return ""
    lineas = ["## Log de eventos", ""]
    for e in eventos[:limite]:
        marca = {"hito": "🏆", "intencion": "📣", "cambio_fase": "🔄", "blocker": "🚧", "silencio": "🔇", "riesgo": "⚠️"}.get(e["tipo"], "•")
        estado = f" · {e['estado']}" if e["estado"] else ""
        tags = f" · {' '.join('#' + t for t in e['tags'])}" if e["tags"] else ""
        lineas.append(f"- {marca} **{e['fecha'][:10]}** · {e['titulo']}{estado}{tags}" + (f"\n  - «{e['extracto']}»" if e["extracto"] else ""))
    return "\n".join(lineas)
