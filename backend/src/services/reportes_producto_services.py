"""
El reporte mensual de upsell y recompras.

Tres bloques fijos, siempre en el mismo orden: quién hizo upsell, quién recompró, y en
qué está el resto de los vencidos. Los dos primeros salen solos de las cuotas de ATV
Clients; el tercero se carga a mano, porque ese estado no vive en ningún sistema.

El tipo de cada cuota es **la primera línea de sus notas** —`cuota_venta`,
`cuota_recompra`, `cuota_upsell`, `posibilidad_upsell`, `sena`—, no una columna. Es
texto libre y así lo escribe ATV Clients, así que todo lo que clasifica por tipo pasa
por `_TIPO_SQL` y no por un `WHERE tipo = …` que no existiría.

Lo que se carga en el paso 2 se escribe de vuelta en `clients.observaciones`: ahí es
donde el equipo ya mira las notas de un cliente, y así el reporte no es un documento
muerto sino algo que deja rastro en la ficha.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime

from fastapi import HTTPException

from src.services import clients_db

logger = logging.getLogger("atv_ops.reportes_producto")

# El tipo vive en la primera línea del campo `notas`.
_TIPO_SQL = "split_part(coalesce(q.notas, ''), chr(10), 1)"

TIPOS = {"upsell": "cuota_upsell", "recompra": "cuota_recompra"}

# `duracion_dias` es lo que se carga en ATV Clients; los meses son para leer.
_MESES = {120: 4, 122: 4, 180: 6, 243: 8, 242: 8, 360: 12, 365: 12, 90: 3, 30: 1, 60: 2}


def meses_de(dias: int | None) -> int | None:
    """Cuántos meses dura un plan de `dias`. Redondea al mes más cercano."""
    if not dias:
        return None
    return _MESES.get(int(dias)) or max(1, round(int(dias) / 30))


def _periodo_valido(periodo: str) -> str:
    p = (periodo or "").strip()
    try:
        date.fromisoformat(f"{p}-01")
    except ValueError:
        raise HTTPException(status_code=400, detail="El período va como YYYY-MM.") from None
    return p


def _rango(periodo: str) -> tuple[str, str]:
    """Primer día del mes y primer día del siguiente."""
    y, m = (int(x) for x in periodo.split("-"))
    return f"{periodo}-01", f"{y + (m == 12)}-{(m % 12) + 1:02d}-01"


# --------------------------------------------------------------- lo que trae Clients

def _cuotas_por_cliente(tipo: str) -> list[dict]:
    """Un renglón por cliente con su upsell o recompra sumado.

    Se agrupa acá y no en la pantalla porque un cliente tiene varias cuotas del mismo
    tipo y lo que el reporte muestra es la operación entera: cuánto se comprometió,
    cuánto entró y cuánto quedó vencido.
    """
    return clients_db.consultar(
        f"""
        SELECT c.id                                                          AS cliente_id,
               c.nombre                                                      AS nombre,
               c.plan_actual                                                 AS plan,
               c.duracion_dias                                               AS duracion_dias,
               c.responsable                                                 AS responsable,
               round(sum(q.monto_usd))                                       AS total_usd,
               round(coalesce(sum(q.monto_usd) FILTER (WHERE q.estado = 'pagado'), 0))   AS cobrado_usd,
               round(coalesce(sum(q.monto_usd) FILTER (WHERE q.estado = 'vencido'), 0))  AS vencido_usd,
               round(coalesce(sum(q.monto_usd) FILTER (
                     WHERE q.estado IN ('pendiente', 'parcialmente_pagada')), 0))        AS pendiente_usd,
               count(*)                                                      AS cuotas,
               max(q.fecha_pago)                                             AS ultimo_pago,
               min(q.fecha_vence)                                            AS desde
          FROM {{esquema}}.cuotas q
          JOIN {{esquema}}.clientes c ON c.id = q.cliente_id
         WHERE {_TIPO_SQL} = %s
         GROUP BY c.id, c.nombre, c.plan_actual, c.duracion_dias, c.responsable
         ORDER BY 7 DESC, 6 DESC
        """,
        (tipo,),
    )


def _vencidos() -> list[dict]:
    """Los clientes cuyo plan ya venció y todavía no se dieron de baja.

    Se filtra por la **fecha**, no por `estado_cliente`: ese campo no se recalcula solo
    y hay clientes marcados "vigente" con el vencimiento de hace siete meses.
    """
    return clients_db.consultar(
        """
        SELECT c.id                AS cliente_id,
               c.nombre            AS nombre,
               c.plan_actual       AS plan,
               c.responsable       AS responsable,
               c.fecha_vencimiento AS vence,
               c.total_adeudado_usd AS debe_usd,
               c.canal_discord     AS canal_discord,
               (current_date - c.fecha_vencimiento) AS dias
          FROM {esquema}.clientes c
         WHERE c.fecha_vencimiento IS NOT NULL
           AND c.fecha_vencimiento <= current_date
           AND coalesce(c.estado_cliente, '') <> 'inactivo'
         ORDER BY c.fecha_vencimiento
        """
    )


def ofertas() -> list[dict]:
    """El catálogo de programas, para el desplegable de "qué oferta"."""
    from src.services import ventas_services

    try:
        return [{"nombre": p["nombre"], "precioUsd": p["precioUsd"]} for p in ventas_services.programas()]
    except Exception as e:  # noqa: BLE001
        logger.info("No se pudo leer el catálogo de programas: %s", str(e)[:160])
        return []


def candidatos(periodo: str) -> dict:
    """Todo lo que la pantalla necesita para armar el reporte del mes.

    Los que ya tienen cuota vienen marcados como elegidos: son el caso normal, y dejar
    que el sistema proponga y la persona destilde es más rápido que hacerle buscar
    veinticuatro nombres en una lista de ciento dieciocho.
    """
    periodo = _periodo_valido(periodo)
    if not clients_db.disponible():
        raise HTTPException(status_code=503, detail="No hay conexión con ATV Clients.")

    desde, hasta = _rango(periodo)
    con_cuota: set[int] = set()

    def bloque(tipo: str) -> list[dict]:
        salida = []
        for f in _cuotas_por_cliente(TIPOS[tipo]):
            con_cuota.add(f["cliente_id"])
            salida.append({
                "clienteId": f["cliente_id"],
                "nombre": f["nombre"],
                "oferta": (f["plan"] or "").capitalize(),
                "meses": meses_de(f["duracion_dias"]),
                "responsable": f["responsable"] or "",
                "totalUsd": float(f["total_usd"] or 0),
                "cobradoUsd": float(f["cobrado_usd"] or 0),
                "vencidoUsd": float(f["vencido_usd"] or 0),
                "pendienteUsd": float(f["pendiente_usd"] or 0),
                "cuotas": f["cuotas"],
                "ultimoPago": str(f["ultimo_pago"]) if f["ultimo_pago"] else None,
                "desde": str(f["desde"]) if f["desde"] else None,
                "elegido": True,
            })
        return salida

    upsells, recompras = bloque("upsell"), bloque("recompra")

    # El tercer bloque es "el resto": quien ya aparece arriba no se repite abajo.
    vencidos = [{
        "clienteId": v["cliente_id"],
        "nombre": v["nombre"],
        "oferta": (v["plan"] or "").capitalize(),
        "responsable": v["responsable"] or "",
        "vence": str(v["vence"]) if v["vence"] else None,
        "dias": int(v["dias"] or 0),
        "debeUsd": float(v["debe_usd"] or 0),
        "enDiscord": bool(v["canal_discord"]),
        "estado": "",
        "nota": "",
    } for v in _vencidos() if v["cliente_id"] not in con_cuota]

    return {
        "periodo": periodo, "desde": desde, "hasta": hasta,
        "upsells": upsells, "recompras": recompras, "vencidos": vencidos,
        "ofertas": ofertas(),
        "guardado": obtener(periodo),
    }


def buscar_clientes(q: str, limite: int = 20) -> list[dict]:
    """Busca en la cartera de ATV Clients por nombre o mail.

    El sistema propone los que tienen cuota marcada, pero esa marca no siempre está:
    Kilian recompró y su cuota nunca se cargó. Sin poder buscar, el reporte solo puede
    decir lo que el CRM ya sabe, y el punto es justamente cargar lo que falta.
    """
    q = (q or "").strip()
    if len(q) < 2:
        return []
    if not clients_db.disponible():
        raise HTTPException(status_code=503, detail="No hay conexión con ATV Clients.")

    patron = f"%{q}%"
    filas = clients_db.consultar(
        """
        SELECT c.id AS cliente_id, c.nombre AS nombre, c.plan_actual AS plan,
               c.duracion_dias AS duracion_dias, c.responsable AS responsable,
               c.estado_cliente AS estado, c.fecha_vencimiento AS vence,
               c.total_adeudado_usd AS debe_usd, c.total_pagado_usd AS pagado_usd
          FROM {esquema}.clientes c
         WHERE c.nombre ILIKE %s OR coalesce(c.email, '') ILIKE %s
         ORDER BY c.nombre
         LIMIT %s
        """,
        (patron, patron, int(limite)),
    )
    return [{
        "clienteId": f["cliente_id"],
        "nombre": f["nombre"],
        "oferta": (f["plan"] or "").capitalize(),
        "meses": meses_de(f["duracion_dias"]),
        "responsable": f["responsable"] or "",
        "estado": f["estado"] or "",
        "vence": str(f["vence"]) if f["vence"] else None,
        "debeUsd": float(f["debe_usd"] or 0),
        "pagadoUsd": float(f["pagado_usd"] or 0),
    } for f in filas]


# ------------------------------------------------------------------ lo que se guarda

def _fila(periodo: str):
    from src.models import ReporteProducto

    return ReporteProducto.get(periodo=periodo)


def obtener(periodo: str) -> dict | None:
    """El reporte ya cerrado de ese mes, si existe."""
    from pony.orm import db_session

    periodo = _periodo_valido(periodo)
    try:
        with db_session:
            r = _fila(periodo)
            if r is None:
                return None
            return {
                "periodo": r.periodo, "estado": r.estado,
                "datos": json.loads(r.datos or "{}"),
                "creadoPor": r.creado_por,
                "creadoAt": r.creado_at.isoformat() if r.creado_at else None,
                "actualizadoAt": r.actualizado_at.isoformat() if r.actualizado_at else None,
            }
    except Exception as e:  # noqa: BLE001
        logger.info("No se pudo leer el reporte %s: %s", periodo, str(e)[:160])
        return None


def listar() -> list[dict]:
    """Los reportes cerrados, del más nuevo al más viejo."""
    from pony.orm import db_session

    from src.models import ReporteProducto

    with db_session:
        return [{
            "periodo": r.periodo, "estado": r.estado,
            "creadoPor": r.creado_por,
            "creadoAt": r.creado_at.isoformat() if r.creado_at else None,
        } for r in sorted(ReporteProducto.select(), key=lambda r: r.periodo, reverse=True)]


def guardar(periodo: str, datos: dict, usuario: dict, cerrar: bool = False) -> dict:
    """Guarda el reporte del mes. Vuelve a guardarse tantas veces como haga falta.

    Cerrarlo no lo congela: se sigue pudiendo editar. La diferencia es que un reporte
    cerrado es el que se le pasó a Juan, y eso se quiere saber al volver en diciembre.
    """
    from pony.orm import db_session

    from src.models import ReporteProducto

    periodo = _periodo_valido(periodo)
    quien = (usuario or {}).get("username") or ""
    ahora = datetime.utcnow()
    crudo = json.dumps(datos or {}, ensure_ascii=False)

    with db_session:
        r = _fila(periodo)
        if r is None:
            r = ReporteProducto(periodo=periodo, datos=crudo, creado_por=quien[:80], creado_at=ahora)
        else:
            r.datos = crudo
        if cerrar:
            r.estado = "cerrado"
        r.actualizado_por = quien[:80]
        r.actualizado_at = ahora
    logger.info("Reporte de producto %s guardado por %s%s", periodo, quien, " (cerrado)" if cerrar else "")
    return obtener(periodo) or {}


def anotar(cliente_id: int, texto: str, usuario: dict) -> dict:
    """Deja la nota del reporte en la ficha del cliente, en ATV Clients.

    Es lo que hace que el paso 2 no se pierda: el mes que viene, el que abra la ficha
    ve lo que se decidió ahora y por qué.
    """
    texto = (texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="La nota está vacía.")
    if not clients_db.disponible():
        raise HTTPException(status_code=503, detail="No hay conexión con ATV Clients.")

    autor = ((usuario or {}).get("username") or "atv-ops")[:80]
    filas = clients_db.ejecutar(
        "INSERT INTO {esquema}.observaciones (cliente_id, autor, texto, created_at) "
        "VALUES (%s, %s, %s, %s)",
        (int(cliente_id), autor, texto[:2000], datetime.utcnow()),
    )
    if not filas:
        raise HTTPException(status_code=502, detail="ATV Clients no guardó la nota.")
    logger.info("Nota del reporte en el cliente %s por %s", cliente_id, autor)
    return {"ok": True, "clienteId": int(cliente_id)}
