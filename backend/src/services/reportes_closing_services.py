"""
El reporte mensual de closing: cómo le fue a Nick en el mes.

Tres bloques fijos, siempre en el mismo orden: las métricas del mes, el laboratorio de
closing —avatares y objeciones sacados de las transcripciones de Fathom— y las
conclusiones para el mes que viene.

Dos reglas que valen para todo el archivo:

- **Las descartadas no existen.** No suman al total, no entran en ninguna tasa y no se
  muestran. Si hubo 60 llamadas y se descartaron 6, el mes tuvo 54.
- **Los estados son los que ya carga el equipo** (`ESTADOS_LLAMADA`), no una lista
  nueva. `Agendado` y `Descartada` son estados operativos y quedan afuera del reporte.

El avatar y la objeción de cada llamada los saca la IA de la transcripción y se guardan
en la reunión, no en el reporte: son de la llamada y sirven igual el mes que viene.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime

from fastapi import HTTPException

from src.services import ventas_services

logger = logging.getLogger("atv_ops.reportes_closing")

# Lo que el equipo carga de verdad, menos los dos operativos.
ESTADOS_OPERATIVOS = ("Agendado", "Descartada")
ESTADOS_VENTA = ("Cerrado", "Seña")

# Cómo se agrupan para las tasas. Una cancelada es alguien que no vino; una re-agenda
# llegó a tener resultado.
NO_VINO = ("No show", "No contesta", "Cancelada")


def _periodo_valido(periodo: str) -> str:
    p = (periodo or "").strip()
    try:
        date.fromisoformat(f"{p}-01")
    except ValueError:
        raise HTTPException(status_code=400, detail="El período va como YYYY-MM.") from None
    return p


def _norm(v: str | None) -> str:
    return (v or "").strip().lower()


def _estado_oficial(resultado: str | None) -> str | None:
    """Devuelve el estado tal como está escrito en el catálogo, o None si no está cargado.

    El equipo lo escribe con mayúsculas distintas —'Seguimiento' y 'seguimiento' conviven
    en la base— así que se compara normalizado y se devuelve la forma del catálogo, que es
    la que se muestra.
    """
    r = _norm(resultado)
    if not r:
        return None
    for e in ventas_services.ESTADOS_LLAMADA:
        if _norm(e) == r:
            return e
    return resultado.strip()


def _del_mes(datos: dict) -> list[dict]:
    """Las llamadas que cuentan para el mes: las descartadas no existen acá.

    Mismo corte que usa la pantalla del closer para sus KPIs —`mis_llamadas` ya cruzó el
    CRM con el calendario y resolvió las grafías—, así el reporte y la pantalla no
    pueden decir números distintos del mismo mes.
    """
    return [l for l in (datos.get("llamadas") or [])
            if l.get("estado") not in ("descartada", "duplicada")]


def metricas(datos: dict) -> dict:
    """El bloque 1: el mes en números.

    Las tasas salen de `_metricas_closer`, que es lo que ya calcula la pantalla del
    closer: recalcularlas acá sería tener dos verdades del mismo mes. Lo que se agrega es
    lo que el reporte pide y la pantalla no muestra: el PIF, la proyección con las señas
    y cómo se repartieron los estados.
    """
    llamadas = _del_mes(datos)
    base = dict(datos.get("mes") or {})

    por_estado: dict[str, int] = {}
    for l in llamadas:
        e = _estado_oficial(l.get("resultado")) or "Sin cargar"
        por_estado[e] = por_estado.get(e, 0) + 1

    cierres = [l for l in llamadas if _estado_oficial(l.get("resultado")) == "Cerrado"]
    senas = [l for l in llamadas if _estado_oficial(l.get("resultado")) == "Seña"]
    # PIF: un cierre sin saldo. Las señas quedan afuera porque por definición deben plata,
    # y contarlas como PIF —hoy casi todas tienen el saldo en cero— infla la tasa.
    pif = [l for l in cierres if not float(l.get("saldoUsd") or 0)]
    total, shows = len(llamadas), int(base.get("shows") or 0)

    def tasa(parte: int, sobre: int) -> float | None:
        return round(parte * 100 / sobre, 1) if sobre else None

    return {
        **base,
        "llamadas": total,
        # Si entran las señas pendientes, a cuánto llegaría el close rate.
        "closeRateConSenas": tasa(len(cierres) + len(senas), shows),
        "pif": len(pif),
        "pifRate": tasa(len(pif), len(cierres)),
        "senasCashUsd": round(sum(float(l.get("cashUsd") or 0) for l in senas), 2),
        "senasSaldoUsd": round(sum(float(l.get("saldoUsd") or 0) for l in senas), 2),
        "porEstado": [{"estado": e, "n": n, "pct": round(n * 100 / total, 1) if total else 0}
                      for e, n in sorted(por_estado.items(), key=lambda x: -x[1])],
    }


# ------------------------------------------------------------------ el laboratorio

SYSTEM = """Sos analista de llamadas de venta de ATV, una empresa de coaching para dueños de agencias y consultores.
Leés la transcripción de UNA llamada y devolvés SOLO un JSON, sin texto alrededor y sin backticks.

{
  "avatar": "<el perfil del prospecto en 2 a 4 palabras, en minúscula. Ej: agencia owner sin equipo,
              consultor b2b, coach principiante, infoproductor con equipo. Si no se entiende, null>",
  "avatarMotivo": "<una frase corta de por qué, citando lo que dijo el prospecto>",
  "objecion": "<la objeción principal en 2 a 5 palabras, en minúscula. Ej: no tiene el capital,
                duda del precio, falta de tiempo, ya probó algo parecido. Si no hubo, null>",
  "objecionCita": "<la frase textual del prospecto donde aparece, máximo 140 caracteres. Si no hubo, null>",
  "momento": "<en qué parte apareció la objeción: apertura | descubrimiento | pitch | cierre | null>",
  "seEnfrio": "<en qué momento se enfrió el prospecto, en una frase. Si no se enfrió, null>",
  "fraseDelCloser": "<una frase textual del closer que haya movido la llamada, para bien o para mal.
                      Máximo 140 caracteres. Si no hay nada destacable, null>"
}

Reglas:
- Solo lo que está en la transcripción. Si un dato no está, va null. No inventes.
- Las citas son textuales, recortadas, nunca parafraseadas.
- Si la grabación no es una llamada de venta (una clase, una reunión interna), devolvé
  todos los campos en null y poné "no es una llamada de venta" en avatarMotivo."""


def analizar(transcripcion: str, contexto: str = "") -> dict:
    """Le pasa una transcripción a la IA y devuelve el avatar y la objeción.

    Usa el mismo camino que la extracción de Fathom —API si hay clave, `claude -p` si
    no— para no abrir una segunda forma de hablar con el modelo.
    """
    texto = (transcripcion or "").strip()
    if len(texto) < 200:
        raise HTTPException(status_code=400, detail="La transcripción es muy corta para analizarla.")

    from src.services.activacion_ia_services import invocar_claude_texto
    from src.services.fathom_services import _json_de

    partes = [contexto, "", "## Transcripción", texto[:60_000]]
    salida, meta = invocar_claude_texto(SYSTEM, "\n".join(p for p in partes if p != ""))
    campos = _json_de(salida)

    def linea(v, tope=140):
        s = str(v).strip() if v not in (None, "", "null") else ""
        return s[:tope] or None

    return {
        "avatar": (linea(campos.get("avatar"), 40) or "").lower() or None,
        "avatarMotivo": linea(campos.get("avatarMotivo"), 200),
        "objecion": (linea(campos.get("objecion"), 60) or "").lower() or None,
        "objecionCita": linea(campos.get("objecionCita")),
        "momento": linea(campos.get("momento"), 20),
        "seEnfrio": linea(campos.get("seEnfrio"), 200),
        "fraseDelCloser": linea(campos.get("fraseDelCloser")),
        "costoUsd": meta.get("costo_usd", 0.0),
        "via": meta.get("via", ""),
    }


def guardar_analisis(evento_id: str, campos: dict, usuario: dict) -> dict:
    """Deja el avatar y la objeción en la reunión: son de la llamada, no del reporte.

    La llave es el evento del calendario y no el id de la fila: una llamada que todavía
    no tiene reunión en el CRM —las que la pantalla marca `sin_crm`— se ve igual en la
    lista y tiene que poder analizarse. Si no existe la fila, se crea con lo mínimo.
    """
    from pony.orm import db_session

    from src.models import ReunionCrm

    evento_id = str(evento_id or "").strip()
    if not evento_id:
        raise HTTPException(status_code=400, detail="Falta la llamada.")

    with db_session:
        r = ReunionCrm.get(evento_id=evento_id)
        if r is None:
            r = ReunionCrm(evento_id=evento_id, lead_id=0,
                           prospecto=(campos.get("prospecto") or "")[:200],
                           creado_por=(usuario.get("username") or "")[:80])
        r.avatar = (campos.get("avatar") or "")[:60] or None
        r.objecion = (campos.get("objecion") or "")[:80] or None
        r.analisis_closing = json.dumps(campos, ensure_ascii=False)
        r.actualizado_por = (usuario.get("username") or "")[:80]
        r.actualizado_at = datetime.utcnow()
    logger.info("Análisis de closing guardado en la llamada %s por %s", evento_id,
                usuario.get("username"))
    return {"ok": True, "eventoId": evento_id, **campos}


def analisis_guardados(eventos: list[str]) -> dict[str, dict]:
    """Lo que ya se analizó de esas llamadas, para no volver a pagarle a la IA."""
    from pony.orm import db_session

    from src.models import ReunionCrm

    quiero = {str(e) for e in eventos if e}
    if not quiero:
        return {}
    with db_session:
        salida = {}
        for r in ReunionCrm.select():
            if r.evento_id not in quiero:
                continue
            crudo = (r.analisis_closing or "").strip()
            if not crudo:
                continue
            try:
                salida[r.evento_id] = json.loads(crudo)
            except ValueError:
                continue
        return salida


def laboratorio(llamadas: list[dict], analisis: dict[int, dict]) -> dict:
    """El bloque 2: qué dicen las transcripciones ya analizadas.

    Devuelve también la cobertura —cuántas de las llamadas del mes tienen análisis—
    porque una conclusión sobre nueve llamadas de sesenta no es una conclusión del mes.
    """
    con = [(l, analisis[l["eventoId"]]) for l in llamadas if l.get("eventoId") in analisis]
    cerro = lambda l: _estado_oficial(l.get("resultado")) in ESTADOS_VENTA  # noqa: E731

    def agrupar(clave: str) -> list[dict]:
        grupos: dict[str, dict] = {}
        for l, a in con:
            v = (a.get(clave) or "").strip()
            if not v:
                continue
            g = grupos.setdefault(v, {"valor": v, "n": 0, "cerraron": 0, "citas": [], "momentos": {}})
            g["n"] += 1
            if cerro(l):
                g["cerraron"] += 1
            cita = a.get("objecionCita") if clave == "objecion" else a.get("avatarMotivo")
            if cita and len(g["citas"]) < 3:
                g["citas"].append({"prospecto": l.get("prospecto"), "cita": cita})
            if clave == "objecion" and a.get("momento"):
                g["momentos"][a["momento"]] = g["momentos"].get(a["momento"], 0) + 1
        for g in grupos.values():
            g["noCerraron"] = g["n"] - g["cerraron"]
            g["closeRate"] = round(g["cerraron"] * 100 / g["n"], 1) if g["n"] else 0
        return sorted(grupos.values(), key=lambda g: -g["n"])

    frases = [{"prospecto": l.get("prospecto"), "cerro": cerro(l), "frase": a["fraseDelCloser"]}
              for l, a in con if a.get("fraseDelCloser")]
    enfriadas = [{"prospecto": l.get("prospecto"), "cerro": cerro(l), "cuando": a["seEnfrio"]}
                 for l, a in con if a.get("seEnfrio")]

    return {
        "analizadas": len(con),
        "total": len(llamadas),
        "cobertura": round(len(con) * 100 / len(llamadas), 1) if llamadas else 0,
        "objeciones": agrupar("objecion"),
        "avatares": agrupar("avatar"),
        "frases": frases,
        "enfriadas": enfriadas,
    }


def armar(periodo: str, closer: str | None, usuario: dict) -> dict:
    """Todo lo que la pantalla necesita para el mes."""
    periodo = _periodo_valido(periodo)
    datos = ventas_services.mis_llamadas(usuario, closer=closer, mes=periodo)
    llamadas = _del_mes(datos)
    analisis = analisis_guardados([l.get("eventoId") for l in llamadas])
    return {
        "periodo": periodo,
        "closer": closer or datos.get("closer"),
        "closersDisponibles": datos.get("closersDisponibles") or [],
        "metricas": metricas(datos),
        "laboratorio": laboratorio(llamadas, analisis),
        "llamadas": [{**l, "analisis": analisis.get(l.get("eventoId"))} for l in llamadas],
        "guardado": obtener(periodo),
    }


# ------------------------------------------------------------------ lo que se guarda

def obtener(periodo: str) -> dict | None:
    """El reporte ya cerrado de ese mes, si existe."""
    from pony.orm import db_session

    from src.models import ReporteClosing

    periodo = _periodo_valido(periodo)
    try:
        with db_session:
            r = ReporteClosing.get(periodo=periodo)
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
        logger.info("No se pudo leer el reporte de closing %s: %s", periodo, str(e)[:160])
        return None


def listar() -> list[dict]:
    """Los reportes armados, del más nuevo al más viejo."""
    from pony.orm import db_session

    from src.models import ReporteClosing

    def resumen(crudo: str | None) -> dict:
        try:
            d = json.loads(crudo or "{}")
        except (TypeError, ValueError):
            return {}
        m = d.get("metricas") or {}
        return {"llamadas": m.get("llamadas"), "cierres": m.get("cierres"),
                "cashUsd": m.get("cashUsd"), "closeRate": m.get("closeRate"),
                "cobertura": (d.get("laboratorio") or {}).get("cobertura")}

    with db_session:
        return [{
            "periodo": r.periodo, "estado": r.estado, "closer": r.closer,
            "creadoPor": r.creado_por,
            "creadoAt": r.creado_at.isoformat() if r.creado_at else None,
            "actualizadoAt": r.actualizado_at.isoformat() if r.actualizado_at else None,
            **resumen(r.datos),
        } for r in sorted(ReporteClosing.select(), key=lambda r: r.periodo, reverse=True)]


def guardar(periodo: str, datos: dict, usuario: dict, closer: str | None = None,
            cerrar: bool = False) -> dict:
    """Guarda el reporte del mes, con sus conclusiones escritas a mano."""
    from pony.orm import db_session

    from src.models import ReporteClosing

    periodo = _periodo_valido(periodo)
    quien = (usuario or {}).get("username") or ""
    ahora = datetime.utcnow()
    crudo = json.dumps(datos or {}, ensure_ascii=False)

    with db_session:
        r = ReporteClosing.get(periodo=periodo)
        if r is None:
            r = ReporteClosing(periodo=periodo, datos=crudo, closer=(closer or "")[:80] or None,
                               creado_por=quien[:80], creado_at=ahora)
        else:
            r.datos = crudo
            if closer:
                r.closer = closer[:80]
        if cerrar:
            r.estado = "cerrado"
        r.actualizado_por = quien[:80]
        r.actualizado_at = ahora
    logger.info("Reporte de closing %s guardado por %s%s", periodo, quien,
                " (cerrado)" if cerrar else "")
    return obtener(periodo) or {}
