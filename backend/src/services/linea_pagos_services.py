"""
Línea de pagos: la cartera de ATV Clients puesta en una línea de tiempo por cliente.

Arma los datos que consume la vista (ingresos, pagos y vencimientos, más los grupos y
las marcas de revisión). La lógica vive en `armar`, que es pura: recibe las filas de
`clientes` y `pagos` y el set de canales vivos de Discord, así se puede testear sin
base. `datos` es el que lee las fuentes.

Fechas de referencia:
- `cut`: corte de datos (por defecto ayer). Los pagos con fecha posterior no entran y
  la permanencia de los que siguen en curso se mide hasta acá.
- `hoy`: lo que ya venció "hoy" (grupo B, A+B) se mide contra esta fecha.
- `win0`: inicio de la ventana; los que arrancaron desde acá son "ingresantes" y son
  los únicos a los que se les marcan D y E.

Grupos (`g`), en este orden de prioridad:
- X: fecha de inicio futura, dato a revisar; la vista no lo dibuja.
- A: su canal está vivo en Discord. Si además está vencido por fecha con estado activo,
  `ab` (A+B).
- B: estado activo en la ficha, vencimiento cumplido y fuera de Discord.
- C: terminó su programa por vencimiento (categoría `completo`).
- S: seña: ingresante con US$ 50 a 500 pagados y sin deuda.
- O: el resto (bajas anticipadas, activos fuera de Discord con vencimiento a futuro).
"""

from __future__ import annotations

import calendar
import json
import logging
from datetime import date, datetime, timedelta, timezone

logger = logging.getLogger("atv_ops.linea_pagos")

AR_TZ = timezone(timedelta(hours=-3))

WIN0 = date(2026, 5, 1)

# Estados que todavía cuentan como cliente activo en la ficha.
ACTIVO = ("vigente", "pausa", "llamada_recompra", "no_va_a_renovar", "vencido")
# "Activo sin ningún pago" mira solo los que siguen en el programa: el que avisó que no
# renueva o ya figura vencido tiene otra conversación pendiente, no un pago faltante.
EN_PROGRAMA = ("vigente", "pausa", "llamada_recompra")
# "Vigente/recompra con vencimiento pasado": son los que tendrían que haber renovado.
RENUEVAN = ("vigente", "llamada_recompra")

# Boost cambió de 12 a 6 meses en junio de 2026. Mayo fue de transición y no se sabe
# qué duración se vendió, así que para esos no hay duración esperada.
BOOST_HASTA = date(2026, 5, 1)
BOOST_DESDE = date(2026, 6, 1)
MESES_MENTORIA = 4

# Cohortes contra el primer pago de junio (el mes del cambio de Boost).
INICIO_JUNIO = date(2026, 6, 1)

SENA_MIN, SENA_MAX = 50.0, 500.0
DIAS_SIN_PAGO = 30          # E: más de esto sin pagar con deuda
TOLERANCIA_FICHA = 7        # flag: vencimiento vs inicio+duración
TOLERANCIA_PROGRAMA = 5     # D/?: vencimiento vs duración estándar del programa

# Mentorías cuya prórroga ya está confirmada: la vista también lo exceptúa por nombre al
# recalcular, así que si se marca acá aparece una D que nadie puede sacar.
VENCIMIENTO_CONFIRMADO = {"geronimo robles"}


# ---------- utilidades ----------

def _fecha(x) -> date | None:
    if x is None or x == "":
        return None
    if isinstance(x, datetime):
        return x.date()
    if isinstance(x, date):
        return x
    return date.fromisoformat(str(x)[:10])


def _iso(d: date | None) -> str | None:
    return d.isoformat() if d else None


def _sumar_meses(d: date, meses: int) -> date:
    # Mismo día del mes; si no existe (31 → 30/28), el último día de ese mes.
    m = d.month - 1 + meses
    anio, mes = d.year + m // 12, m % 12 + 1
    return date(anio, mes, min(d.day, calendar.monthrange(anio, mes)[1]))


def _num(x) -> float:
    return float(x or 0)


def normalizar_canal(nombre: str | None) -> str:
    return (nombre or "").strip().lower().lstrip("#")


def _vencimiento_esperado(plan: str, inicio: date) -> date | None:
    """Fin que correspondería por la duración estándar del programa.

    Entry, Mid y Advantage no tienen una duración única, así que no se comparan."""
    if plan == "mentoria":
        return _sumar_meses(inicio, MESES_MENTORIA)
    if plan == "boost":
        if inicio < BOOST_HASTA:
            return _sumar_meses(inicio, 12)
        if inicio >= BOOST_DESDE:
            return _sumar_meses(inicio, 6)
    return None


# ---------- armado ----------

def armar(clientes: list[dict], pagos: list[dict], vivos: set[str] | None,
          hoy: date, cut: date | None = None) -> dict:
    """Datos de la línea de pagos a partir de las filas crudas.

    `vivos`: nombres de los canales de cliente vivos en Discord. Si es None (no hay
    directorio del bot), se aproxima con "tiene canal cargado y estado activo": es lo
    más parecido sin Discord, pero deja en A a los vencidos que ya se fueron del canal.
    """
    cut = cut or hoy - timedelta(days=1)
    vivos_n = {normalizar_canal(c) for c in vivos} if vivos is not None else None

    # Pagos posteriores al corte no entran: la foto tiene que ser la misma para todos.
    # Dentro del mismo día van por id (orden de carga); la base no guarda la hora del pago.
    por_cliente: dict[int, list] = {}
    for p in sorted(pagos, key=lambda p: (_fecha(p["fecha"]) or date.min, p.get("id") or 0)):
        f = _fecha(p["fecha"])
        if f is None or f > cut:
            continue
        origen = p.get("origen") or ""
        if origen == "migracion":
            origen = "migración"
        por_cliente.setdefault(p["cliente_id"], []).append([f.isoformat(), _num(p["monto_usd"]), origen])

    # La cohorte se mide contra el primer pago de junio y no contra el 1/6: es el
    # momento en que se empezó a vender con las reglas nuevas.
    junio = sorted(f for lst in por_cliente.values() for f, _, _ in lst if f >= INICIO_JUNIO.isoformat())
    ref_cohorte = date.fromisoformat(junio[0]) if junio else INICIO_JUNIO

    filas = []
    for c in clientes:
        a = _fecha(c["fecha_inicio"])
        v = _fecha(c["fecha_vencimiento"])
        if a is None or v is None:
            continue
        filas.append((a, c["id"], c))
    filas.sort(key=lambda t: (t[0], t[1]))

    salida = []
    for a, _, c in filas:
        salida.append(_cliente(c, a, por_cliente.get(c["id"], []), vivos_n, hoy, cut, ref_cohorte))

    return {"cut": cut.isoformat(), "hoy": hoy.isoformat(), "win0": WIN0.isoformat(), "clients": salida}


def _cliente(c: dict, a: date, pg: list, vivos: set[str] | None, hoy: date, cut: date,
             ref_cohorte: date) -> dict:
    plan = c.get("plan_actual") or ""
    estado = c.get("estado_cliente") or ""
    v = _fecha(c["fecha_vencimiento"])
    d = int(c.get("duracion_dias") or 0)
    vc = a + timedelta(days=d)
    b = _fecha(c.get("fecha_baja"))
    rc = _fecha(c.get("fecha_recompra"))
    tf = _num(c.get("total_pagado_usd"))
    ad = _num(c.get("total_adeudado_usd"))
    tp = round(float(sum(m for _, m, _ in pg)), 2)
    fp = date.fromisoformat(pg[0][0]) if pg else None
    up = date.fromisoformat(pg[-1][0]) if pg else None

    futuro = a > hoy
    baja_antes = b is not None and b < v
    ingresante = WIN0 <= a <= hoy
    ficha_distinta = abs(tf - tp) > 0.5

    # Cohorte: dónde estaba el cliente cuando arrancó junio.
    fin = b if baja_antes else v
    if futuro:
        coh = "revisar"
    elif a >= ref_cohorte:
        coh = "nuevo"
    elif fin < ref_cohorte:
        coh = "previo"
    else:
        coh = "base"

    # Categoría de cierre y permanencia. Una baja sin fecha no se puede medir: perm None.
    flags = []
    if futuro:
        cat, perm = "revisar", None
        flags.append(f"Fecha de inicio futura ({a.strftime('%d/%m/%Y')}): revisar carga")
    elif baja_antes:
        cat, perm = "baja_anticipada_fecha", (b - a).days
        flags.append("Baja anticipada con fecha")
    elif estado == "inactivo" and v > cut:
        cat, perm = "baja_anticipada_sin_fecha", None
        flags.append("Inactivo con vencimiento a futuro y sin fecha de baja")
    elif v <= cut:
        perm = (v - a).days
        if estado in RENUEVAN:
            cat = "vigente_venc_pasado"
            flags.append("Vigente/recompra con vencimiento ya pasado: ¿renovación sin cargar?")
        else:
            cat = "completo"
    else:
        cat, perm = "en_curso", max(0, (cut - a).days)

    if abs((v - vc).days) > TOLERANCIA_FICHA:
        flags.append(f"Vencimiento difiere de inicio+duración en {(v - vc).days} días")
    if ficha_distinta:
        flags.append("Total pagado de la ficha ≠ suma de pagos con fecha")

    # Seña: un pago chico sin deuda es un adelanto, no un programa en marcha; por eso
    # queda fuera de D y E.
    sn = ingresante and SENA_MIN <= tp <= SENA_MAX and ad <= 0

    # Grupo.
    activo = estado in ACTIVO
    vencido_hoy = v <= hoy
    if vivos is None:
        en_discord = bool(normalizar_canal(c.get("canal_discord"))) and activo
    else:
        en_discord = normalizar_canal(c.get("canal_discord")) in vivos
    if futuro:
        g = "X"
    elif en_discord:
        g = "A"
    elif activo and vencido_hoy:
        g = "B"
    elif cat == "completo":
        g = "C"
    elif sn:
        g = "S"
    else:
        g = "O"
    ab = g == "A" and activo and vencido_hoy

    ve = _vencimiento_esperado(plan, a)
    dvd = (v - ve).days if ve else None

    # D: inconsistencias de ficha, solo en ingresantes (a los viejos no se les puede
    # pedir que la ficha cierre con pagos que se cargaron por migración).
    mD = []
    if ingresante and not sn:
        if estado in EN_PROGRAMA and not pg:
            mD.append("Activo sin ningún pago registrado")
        if ficha_distinta:
            mD.append("Total de la ficha distinto de la suma de pagos")
        if (dvd is not None and abs(dvd) > TOLERANCIA_PROGRAMA
                and (c.get("nombre") or "").strip().lower() not in VENCIMIENTO_CONFIRMADO):
            mD.append(f"Vencimiento cargado {'+' if dvd > 0 else ''}{dvd} días respecto de la duración del programa")

    # E: proxy de cuota impaga mientras no haya calendario de cuotas: deuda y más de 30
    # días sin pagar (desde el inicio si nunca pagó). E1 sigue en Discord; E2 ya no, y
    # es el que puede estar abandonando en silencio.
    mE = 0
    if ingresante and not sn and ad > 0:
        desde = up or a
        if (cut - desde).days > DIAS_SIN_PAGO:
            mE = 1 if g == "A" else 2

    # ?: Boost viejo cuya ficha suma días por encima del año. No es D porque no son
    # ingresantes; es un vencimiento que hay que confirmar con el cliente.
    qm = plan == "boost" and not ingresante and not futuro and dvd is not None and dvd > TOLERANCIA_PROGRAMA

    return {
        "id": c["id"], "n": c.get("nombre") or "", "p": plan, "e": estado,
        "a": _iso(a), "v": _iso(v), "vc": _iso(vc), "d": d, "rc": _iso(rc), "b": _iso(b),
        "pg": pg, "tp": tp, "tf": tf, "ad": ad, "fp": _iso(fp), "up": _iso(up),
        "coh": coh, "cat": cat, "perm": perm, "flags": flags,
        "g": g, "ab": ab, "mD": mD, "mE": mE, "sn": sn,
        "ve": _iso(ve), "dvd": dvd, "qm": qm,
    }


# ---------- fuentes ----------

def canales_vivos() -> set[str] | None:
    """Canales de cliente que hoy existen en Discord, según el directorio que escribe el
    bot de ATV Clients en cada ciclo. None si no hay directorio."""
    from src.transcripts_source import get_transcripts_base

    try:
        data = json.loads((get_transcripts_base() / "_directorio.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        logger.info("Línea de pagos sin directorio de Discord: %s", str(e)[:200])
        return None
    canales = data.get("canales_cliente") or {}
    return {normalizar_canal(k) for k in canales} or None


def datos(hoy: date | None = None) -> dict:
    from src.services import clients_db

    hoy = hoy or datetime.now(AR_TZ).date()
    clientes = clients_db.consultar(
        "SELECT id, nombre, plan_actual, estado_cliente, fecha_inicio, fecha_vencimiento,"
        " duracion_dias, fecha_recompra, fecha_baja, total_pagado_usd, total_adeudado_usd,"
        " canal_discord FROM {esquema}.clientes"
    )
    pagos = clients_db.consultar(
        "SELECT id, cliente_id, monto_usd, fecha, origen FROM {esquema}.pagos ORDER BY fecha, id"
    )
    return armar(clientes, pagos, canales_vivos(), hoy)
