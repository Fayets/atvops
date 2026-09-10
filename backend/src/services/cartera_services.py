"""
Cobranza real: cuotas y deuda de la cartera, del esquema `clients` (ATV Clients).

Si la fuente no está disponible, todo va en cero: la vista lo dice y no inventa números.
"""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime, timedelta

from decouple import config

from src.services import clients_db
from src.services.transcripts_services import AR_TZ

logger = logging.getLogger("atv_ops.cobranza")

CACHE_SEGUNDOS = int(config("COBRANZA_CACHE_SEGUNDOS", default=300))
_cache: dict = {}
_lock = threading.Lock()
PAGADO = ("pagado", "pagada", "cobrado")


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _rango(mes: str) -> tuple[date, date]:
    anio, m = int(mes[:4]), int(mes[5:7])
    return date(anio, m, 1), date(anio + (m == 12), (m % 12) + 1, 1)


def resumen(mes: str | None = None, refrescar: bool = False) -> dict:
    hoy = datetime.now(AR_TZ).date()
    mes = mes or hoy.strftime("%Y-%m")
    with _lock:
        guardado = _cache.get(mes)
        if guardado and not refrescar and (datetime.utcnow() - guardado["at"]).total_seconds() < CACHE_SEGUNDOS:
            return guardado["data"]

    inicio, fin = _rango(mes)
    base = {
        "mes": mes, "generadoAt": datetime.now(AR_TZ).isoformat(), "conectado": False,
        "detalle": "No hay conexión con la base de ATV Clients.",
        "delMes": {"cuotas": 0, "totalUsd": 0, "cobradoUsd": 0, "pendienteUsd": 0, "vencidoUsd": 0, "pctCobrado": 0},
        "cartera": {"clientes": 0, "vigentes": 0, "inactivos": 0, "deudaUsd": 0, "cobradoHistoricoUsd": 0},
        "cuotas": [], "vencidas": [], "proximas": [],
    }
    if not clients_db.disponible():
        return base

    cuotas = clients_db.consultar(
        "SELECT q.id, q.monto_usd, q.fecha_vence, q.fecha_pago, q.estado, q.notas, "
        "c.nombre, c.plan_actual, c.estado_cliente, c.responsable "
        "FROM {esquema}.cuotas q JOIN {esquema}.clientes c ON c.id = q.cliente_id "
        "WHERE q.fecha_vence >= %s AND q.fecha_vence < %s ORDER BY q.fecha_vence",
        (inicio - timedelta(days=120), fin + timedelta(days=60)),
    )
    clientes = clients_db.consultar(
        "SELECT estado_cliente, count(*) AS n, coalesce(sum(total_adeudado_usd), 0) AS deuda, "
        "coalesce(sum(total_pagado_usd), 0) AS pagado FROM {esquema}.clientes GROUP BY estado_cliente"
    )
    if not cuotas and not clientes:
        return base

    def _fila(q: dict) -> dict:
        vence = q["fecha_vence"]
        pagada = str(q["estado"] or "").lower() in PAGADO
        return {
            "id": q["id"], "cliente": (q["nombre"] or "").strip() or "Sin nombre",
            "plan": (q["plan_actual"] or "").strip(), "responsable": (q["responsable"] or "").strip(),
            "montoUsd": round(_num(q["monto_usd"]), 2),
            "venceAt": vence.isoformat() if vence else None,
            "pagoAt": q["fecha_pago"].isoformat() if q["fecha_pago"] else None,
            "estado": "pagada" if pagada else ("vencida" if vence and vence < hoy else "pendiente"),
            "diasVencida": (hoy - vence).days if (vence and vence < hoy and not pagada) else 0,
            "nota": (q["notas"] or "").strip()[:200],
        }

    todas = [_fila(q) for q in cuotas]
    del_mes = [q for q in todas if q["venceAt"] and inicio.isoformat() <= q["venceAt"] < fin.isoformat()]
    total = sum(q["montoUsd"] for q in del_mes)
    cobrado = sum(q["montoUsd"] for q in del_mes if q["estado"] == "pagada")
    vencido = sum(q["montoUsd"] for q in todas if q["estado"] == "vencida")

    por_estado = {str(c["estado_cliente"] or "").lower(): c for c in clientes}
    data = {
        "mes": mes,
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "conectado": True,
        "delMes": {
            "cuotas": len(del_mes),
            "totalUsd": round(total, 2),
            "cobradoUsd": round(cobrado, 2),
            "pendienteUsd": round(total - cobrado, 2),
            "vencidoUsd": round(vencido, 2),
            "pctCobrado": round(cobrado / total * 100, 1) if total else 0,
        },
        "cartera": {
            "clientes": sum(int(_num(c["n"])) for c in clientes),
            "vigentes": int(_num((por_estado.get("vigente") or {}).get("n"))),
            "inactivos": int(_num((por_estado.get("inactivo") or {}).get("n"))),
            "deudaUsd": round(sum(_num(c["deuda"]) for c in clientes), 2),
            "cobradoHistoricoUsd": round(sum(_num(c["pagado"]) for c in clientes), 2),
        },
        "cuotas": del_mes,
        "vencidas": sorted([q for q in todas if q["estado"] == "vencida"], key=lambda q: -q["diasVencida"])[:40],
        "proximas": sorted([q for q in todas if q["estado"] == "pendiente" and q["venceAt"] and q["venceAt"] >= hoy.isoformat()],
                           key=lambda q: q["venceAt"])[:40],
    }
    with _lock:
        _cache[mes] = {"at": datetime.utcnow(), "data": data}
    return data


def estado() -> dict:
    if not clients_db.disponible():
        return {"conectado": False, "detalle": "Sin acceso al esquema clients (CLIENTS_DSN o Postgres)."}
    filas = clients_db.consultar("SELECT count(*) AS n FROM {esquema}.cuotas")
    if not filas:
        return {"conectado": False, "detalle": "No se pudo leer el esquema clients."}
    return {"conectado": True, "cuotas": filas[0]["n"]}


def ops(mes: str | None = None) -> dict:
    """Vista OPS de la cartera: altas, bajas, vencimientos y plata del mes.
    Sale de la tabla de clientes y cuotas; lo que no tenga fuente va en cero."""
    hoy = datetime.now(AR_TZ).date()
    mes = mes or hoy.strftime("%Y-%m")
    inicio, fin = _rango(mes)
    vacio = {
        "mes": mes, "generadoAt": datetime.now(AR_TZ).isoformat(), "conectado": False,
        "resumen": {"activos": 0, "altasMes": 0, "altasMesAnterior": 0, "bajasMes": 0, "churnRate": 0,
                    "netGrowth": 0, "cuotasMesUsd": 0},
        "salud": {"vigentes": 0, "proximosAVencer": 0, "vencidos": 0, "vencenProximos7d": 0, "revenueRiesgo7dUsd": 0},
        "programas": [],
    }
    if not clients_db.disponible():
        return vacio

    clientes = clients_db.consultar(
        "SELECT nombre, plan_actual, estado_cliente, fecha_inicio, fecha_vencimiento, fecha_baja, "
        "total_pagado_usd, total_adeudado_usd FROM {esquema}.clientes"
    )
    if not clientes:
        return vacio

    mes_ant_inicio = date(inicio.year - (inicio.month == 1), 12 if inicio.month == 1 else inicio.month - 1, 1)

    def _fecha(v):
        """Algunas columnas vienen como timestamp y otras como date."""
        return v.date() if isinstance(v, datetime) else v

    def en_rango(v, a, b) -> bool:
        d = _fecha(v)
        return bool(d) and a <= d < b

    activos = [c for c in clientes if str(c["estado_cliente"] or "").lower() == "vigente"]
    altas = [c for c in clientes if en_rango(c["fecha_inicio"], inicio, fin)]
    altas_prev = [c for c in clientes if en_rango(c["fecha_inicio"], mes_ant_inicio, inicio)]
    bajas = [c for c in clientes if en_rango(c["fecha_baja"], inicio, fin)]

    limite7 = hoy + timedelta(days=7)
    vencen7 = [c for c in activos if _fecha(c["fecha_vencimiento"]) and hoy <= _fecha(c["fecha_vencimiento"]) <= limite7]
    vencidos = [c for c in clientes if _fecha(c["fecha_vencimiento"]) and _fecha(c["fecha_vencimiento"]) < hoy
                and str(c["estado_cliente"] or "").lower() == "vigente"]

    cuotas_mes = clients_db.consultar(
        "SELECT coalesce(sum(monto_usd), 0) AS total FROM {esquema}.cuotas WHERE fecha_vence >= %s AND fecha_vence < %s",
        (inicio, fin),
    )
    por_plan: dict[str, dict] = {}
    for c in clientes:
        plan = (c["plan_actual"] or "sin plan").strip().lower()
        b = por_plan.setdefault(plan, {"nombre": plan, "clientes": 0, "activos": 0, "cobradoUsd": 0.0, "deudaUsd": 0.0})
        b["clientes"] += 1
        b["activos"] += 1 if str(c["estado_cliente"] or "").lower() == "vigente" else 0
        b["cobradoUsd"] += _num(c["total_pagado_usd"])
        b["deudaUsd"] += _num(c["total_adeudado_usd"])

    return {
        "mes": mes,
        "generadoAt": datetime.now(AR_TZ).isoformat(),
        "conectado": True,
        "resumen": {
            "activos": len(activos),
            "altasMes": len(altas),
            "altasMesAnterior": len(altas_prev),
            "bajasMes": len(bajas),
            "churnRate": round(len(bajas) / len(activos) * 100, 1) if activos else 0,
            "netGrowth": len(altas) - len(bajas),
            "cuotasMesUsd": round(_num(cuotas_mes[0]["total"]) if cuotas_mes else 0, 2),
        },
        "salud": {
            "vigentes": len(activos),
            "proximosAVencer": len(vencen7),
            "vencidos": len(vencidos),
            "vencenProximos7d": len(vencen7),
            "revenueRiesgo7dUsd": round(sum(_num(c["total_adeudado_usd"]) for c in vencen7), 2),
        },
        "programas": [
            {**b, "cobradoUsd": round(b["cobradoUsd"], 2), "deudaUsd": round(b["deudaUsd"], 2)}
            for b in sorted(por_plan.values(), key=lambda x: -x["clientes"])
        ],
    }
