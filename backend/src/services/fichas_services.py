"""
Fichas vivas por cliente (parte del cerebro de fulfillment).

Claude las actualiza en la misma llamada de la ronda de pedidos: recibe la ficha
anterior + los mensajes nuevos y devuelve la ficha al día. Se guardan al instante
(son análisis, no el update) y se exportan a fulfillment/clientes/<canal>.md.
Las fases salen de la nota cerebro/fulfillment/fases.md.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from pony.orm import db_session

from src.models import FichaCliente
from src.services import cerebro_services as cerebro
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.fichas")
version = 0
RIESGOS = ("bajo", "medio", "alto")
FASES_DEFAULT = [("onboarding", "Onboarding"), ("implementacion", "Implementación"), ("lanzamiento", "Lanzamiento"), ("escalando", "Escalando"), ("estancado", "Estancado"), ("en_riesgo", "En riesgo")]


def nota_fases() -> str:
    ruta = cerebro.CEREBRO_DIR / "fulfillment" / "fases.md"
    if not ruta.exists():
        ruta = cerebro.SEMILLA_DIR / "fulfillment" / "fases.md"
    try:
        _, cuerpo = cerebro._frontmatter(ruta.read_text(encoding="utf-8"))
        return cuerpo.strip()
    except OSError:
        return "\n".join(f"- id: {i} · {l}" for i, l in FASES_DEFAULT)


def fases() -> list[dict]:
    """[{id, label, descripcion}] leídos de la nota; si no hay, la lista por defecto."""
    salida = []
    for linea in nota_fases().splitlines():
        m = re.match(r"^\s*-\s*id:\s*([a-z_]+)\s*·\s*([^·]+?)\s*(?:·\s*(.*))?$", linea)
        if m:
            salida.append({"id": m.group(1), "label": m.group(2).strip(), "descripcion": (m.group(3) or "").strip()})
    return salida or [{"id": i, "label": l, "descripcion": ""} for i, l in FASES_DEFAULT]


def _ficha_a_dict(f: FichaCliente) -> dict:
    labels = {x["id"]: x["label"] for x in fases()}
    return {
        "clienteId": f.cliente_id,
        "canalId": f.canal_id,
        "fase": f.fase or None,
        "faseLabel": labels.get(f.fase or "", f.fase or None),
        "faseMotivo": f.fase_motivo or None,
        "resumen": f.resumen or None,
        "proximosPasos": json.loads(f.proximos_pasos or "[]"),
        "riesgo": f.riesgo or None,
        "riesgoMotivo": f.riesgo_motivo or None,
        "intencionBaja": f.intencion_baja,
        "intencionBajaExtracto": f.intencion_baja_extracto or None,
        "wins": json.loads(f.wins or "[]"),
        "upsell": f.upsell,
        "upsellMotivo": f.upsell_motivo or None,
        "actualizadoAt": f.actualizado_at.replace(tzinfo=timezone.utc).astimezone(AR_TZ).isoformat(),
        "hasta": f.hasta,
        "fuente": "claude_code",
    }


@db_session
def obtener(cliente_id: str) -> dict | None:
    f = FichaCliente.get(cliente_id=cliente_id)
    return _ficha_a_dict(f) if f else None


@db_session
def todas() -> dict[str, dict]:
    return {f.cliente_id: _ficha_a_dict(f) for f in FichaCliente.select()}


def para_prompt(cliente_id: str) -> dict | None:
    """La ficha anterior en el formato que Claude devuelve, para que la actualice."""
    f = obtener(cliente_id)
    if not f:
        return None
    return {
        "fase": f["fase"], "fase_motivo": f["faseMotivo"], "resumen": f["resumen"], "proximos_pasos": f["proximosPasos"],
        "riesgo": f["riesgo"], "riesgo_motivo": f["riesgoMotivo"], "intencion_baja": f["intencionBaja"],
        "intencion_baja_extracto": f["intencionBajaExtracto"], "wins": f["wins"], "upsell": f["upsell"], "upsell_motivo": f["upsellMotivo"],
    }


def _lista_str(v, n: int, largo: int) -> list[str]:
    if not isinstance(v, list):
        return []
    return [str(x).strip()[:largo] for x in v if str(x).strip()][:n]


def guardar(cliente_id: str, canal_id: str, ficha: dict, hasta: int) -> dict:
    """Valida lo que devolvió Claude y lo persiste (pisa la ficha anterior)."""
    global version
    ids = {x["id"] for x in fases()}
    fase = str(ficha.get("fase") or "").lower()
    if fase not in ids:
        fase = None
    riesgo = str(ficha.get("riesgo") or "").lower()
    if riesgo not in RIESGOS:
        riesgo = None
    wins = []
    for w in ficha.get("wins") or []:
        if not isinstance(w, dict) or not w.get("descripcion"):
            continue
        fecha = str(w.get("fecha") or "")[:10]
        try:
            datetime.strptime(fecha, "%Y-%m-%d")
        except ValueError:
            fecha = None
        wins.append({"fecha": fecha, "tipo": str(w.get("tipo") or "otro")[:20], "descripcion": str(w["descripcion"])[:240]})
    wins = wins[-20:]
    campos = {
        "canal_id": canal_id, "fase": fase, "fase_motivo": (str(ficha.get("fase_motivo"))[:300] if ficha.get("fase_motivo") else None),
        "resumen": (str(ficha.get("resumen"))[:1200] if ficha.get("resumen") else None),
        "proximos_pasos": json.dumps(_lista_str(ficha.get("proximos_pasos"), 4, 200), ensure_ascii=False),
        "riesgo": riesgo, "riesgo_motivo": (str(ficha.get("riesgo_motivo"))[:300] if ficha.get("riesgo_motivo") else None),
        "intencion_baja": bool(ficha.get("intencion_baja")),
        "intencion_baja_extracto": (str(ficha.get("intencion_baja_extracto"))[:300] if ficha.get("intencion_baja_extracto") else None),
        "wins": json.dumps(wins, ensure_ascii=False), "upsell": bool(ficha.get("upsell")),
        "upsell_motivo": (str(ficha.get("upsell_motivo"))[:300] if ficha.get("upsell_motivo") else None),
        "actualizado_at": datetime.utcnow(), "hasta": int(hasta),
    }
    # Pony no acepta None en Optional(str) al actualizar: se guarda '' y se lee como None.
    campos = {k: ("" if v is None else v) for k, v in campos.items()}
    with db_session:
        f = FichaCliente.get(cliente_id=cliente_id)
        if f is None:
            f = FichaCliente(cliente_id=cliente_id, **campos)
        else:
            for k, v in campos.items():
                setattr(f, k, v)
        salida = _ficha_a_dict(f)
    version += 1
    return salida


def markdown(ficha: dict) -> str:
    """Sección de la nota del cliente en el vault."""
    lineas = [f"## Ficha (actualizada {ficha['actualizadoAt'][:16].replace('T', ' ')})", ""]
    lineas.append(f"- **Fase**: {ficha.get('faseLabel') or '—'}" + (f" · {ficha['faseMotivo']}" if ficha.get("faseMotivo") else ""))
    lineas.append(f"- **Riesgo**: {ficha.get('riesgo') or '—'}" + (f" · {ficha['riesgoMotivo']}" if ficha.get("riesgoMotivo") else ""))
    if ficha.get("intencionBaja"):
        lineas.append(f"- **Intención de baja**: sí" + (f" · «{ficha['intencionBajaExtracto']}»" if ficha.get("intencionBajaExtracto") else ""))
    if ficha.get("upsell"):
        lineas.append(f"- **Candidato a upsell**: sí" + (f" · {ficha['upsellMotivo']}" if ficha.get("upsellMotivo") else ""))
    if ficha.get("resumen"):
        lineas += ["", ficha["resumen"]]
    if ficha.get("proximosPasos"):
        lineas += ["", "### Próximos pasos"] + [f"- {p}" for p in ficha["proximosPasos"]]
    if ficha.get("wins"):
        lineas += ["", "### Resultados"] + [f"- {w.get('fecha') or '¿fecha?'} · {w.get('tipo')} · «{w['descripcion']}»" for w in ficha["wins"]]
    return "\n".join(lineas)
