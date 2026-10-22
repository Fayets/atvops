"""
Estructuras de secuencias de historias: cómo arma Juan sus historias, sacado de las suyas.

- La base salió de leer las 108 secuencias del 2-5 al 19-10-2026 historia por historia
  (`cerebro/marketing/estructuras-historias.json`). Cada estructura lleva las fechas de
  las secuencias que la prueban: ninguna es inventada.
- Las ideas de historias de la pizarra tienen que apoyarse en una de estas estructuras, y
  las secuencias se arman siguiendo sus pasos.
- Sigue aprendiendo: cada lunes (o con "Revisar ahora") Claude lee las historias nuevas.
  Cada día que entra en una estructura suma un ejemplo solo. Los que no entran quedan
  sueltos, y cuando dos o más sueltos comparten forma se propone una estructura nueva,
  que se acepta o se descarta. El código valida que cada fecha exista y que una nueva
  tenga al menos dos secuencias reales detrás.
- Las respuestas de cada ejemplo salen de las métricas de Instagram, no de Claude.
"""

from __future__ import annotations

import json
import logging
import re
import statistics
import threading
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, desc

from src.models import PizarraEstructura, PizarraEstructuraRevision, PizarraHistoriaDia, PublicacionIg

logger = logging.getLogger("atv_ops.estructuras")

BASE = Path(__file__).resolve().parents[2] / "cerebro" / "marketing" / "estructuras-historias.json"
ACTIVA = config("ESTRUCTURAS_REVISION", default="1") != "0"
HORA_AR = (10, 0)                 # lunes 10:00 de Argentina, después de la narrativa
MAX_DIAS = 14                     # días nuevos por pasada
MAX_FOTOS = 90
MIN_EJEMPLOS_NUEVA = 2
ROLES = ("gancho", "contexto", "enseñanza", "prueba", "historia_personal", "humor", "objecion", "cta", "otro")

_en_curso = threading.Lock()


# ------------------------------------------------------------------ base

def sembrar() -> int:
    """Carga la base leída si todavía no está. No pisa nada: solo agrega lo que falta."""
    if not BASE.exists():
        return 0
    data = json.loads(BASE.read_text())
    nuevas = 0
    with db_session:
        for e in data["estructuras"]:
            if PizarraEstructura.get(clave=e["clave"]) is None:
                PizarraEstructura(clave=e["clave"], nombre=e["nombre"], cuando=e.get("cuando"),
                                  pasos_json=json.dumps(e["pasos"], ensure_ascii=False),
                                  ejemplos_json=json.dumps(sorted(e["ejemplos"])), origen="analisis")
                nuevas += 1
        for fecha, d in data["dias"].items():
            if PizarraHistoriaDia.get(fecha=fecha) is None:
                PizarraHistoriaDia(fecha=fecha, estructura=d.get("estructura"), resumen=d.get("resumen"))
    return nuevas


def _metricas_por_dia(fechas: set[str]) -> dict[str, dict]:
    """Historias y respuestas de cada día, de las métricas de Instagram."""
    if not fechas:
        return {}
    ini = datetime.combine(date.fromisoformat(min(fechas)), datetime.min.time())
    fin = datetime.combine(date.fromisoformat(max(fechas)) + timedelta(days=1), datetime.min.time())
    salida: dict[str, dict] = {}
    with db_session:
        for p in PublicacionIg.select(lambda p: p.tipo == "historia" and p.publicado_at >= ini and p.publicado_at < fin):
            f = p.publicado_at.date().isoformat()
            if f not in fechas:
                continue
            m = json.loads(p.metricas or "{}")
            d = salida.setdefault(f, {"historias": 0, "respuestas": 0})
            d["historias"] += 1
            d["respuestas"] += int(m.get("replies") or 0)
    return salida


def _dict(e: PizarraEstructura, met: dict[str, dict]) -> dict:
    fechas = json.loads(e.ejemplos_json or "[]")
    ejemplos = [{"fecha": f, **met.get(f, {"historias": None, "respuestas": None})} for f in fechas]
    con = [x for x in ejemplos if x["historias"]]
    return {
        "clave": e.clave, "nombre": e.nombre, "cuando": e.cuando, "estado": e.estado, "origen": e.origen,
        "pasos": json.loads(e.pasos_json or "[]"), "ejemplos": ejemplos,
        "historias": round(statistics.median(x["historias"] for x in con)) if con else None,
        "respuestas": round(statistics.median(x["respuestas"] for x in con)) if con else None,
        "decididoPor": e.decidido_por,
    }


def listar() -> dict:
    with db_session:
        filas = list(PizarraEstructura.select(lambda e: e.estado != "descartada"))
        fechas = {f for e in filas for f in json.loads(e.ejemplos_json or "[]")}
        sueltas = PizarraHistoriaDia.select(lambda d: d.estructura is None).count()
        dias = PizarraHistoriaDia.select().count()
        ultima = PizarraEstructuraRevision.select().order_by(desc(PizarraEstructuraRevision.id)).first()
        revision = ({"desde": ultima.desde.isoformat(), "hasta": ultima.hasta.isoformat(), "estado": ultima.estado,
                     "dias": ultima.dias, "nuevas": ultima.nuevas, "error": ultima.error, "creadoAt": ultima.creado_at.isoformat()}
                    if ultima else None)
    met = _metricas_por_dia(fechas)
    with db_session:
        lista = [_dict(e, met) for e in PizarraEstructura.select(lambda e: e.estado != "descartada")]
    # Primero lo que hay que decidir; después las que más respuestas traen.
    lista.sort(key=lambda x: (x["estado"] != "propuesta", -(x["respuestas"] or 0)))
    return {"estructuras": lista, "dias": dias, "sueltas": sueltas, "revision": revision, "armando": _en_curso.locked()}


def activas() -> dict[str, dict]:
    with db_session:
        return {e.clave: {"nombre": e.nombre, "cuando": e.cuando, "pasos": json.loads(e.pasos_json or "[]"),
                          "ejemplos": json.loads(e.ejemplos_json or "[]")}
                for e in PizarraEstructura.select(lambda e: e.estado == "activa")}


def catalogo_texto() -> str:
    """Las estructuras activas para el pedido a Claude: nombre, cuándo, pasos y cómo rinde."""
    lista = [e for e in listar()["estructuras"] if e["estado"] == "activa"]
    if not lista:
        return ""
    bloques = []
    for e in lista:
        pasos = "\n".join(f"   {i}. [{p['rol']}] {p['que']}" for i, p in enumerate(e["pasos"], 1))
        rinde = (f" Rinde: mediana de {e['respuestas']} respuestas, {e['historias']} historias." if e["respuestas"] is not None else "")
        bloques.append(f"- clave \"{e['clave']}\" — {e['nombre']} ({len(e['ejemplos'])} secuencias reales). {e['cuando'] or ''}{rinde}\n{pasos}")
    return "\n".join(bloques)


def decidir(clave: str, estado: str, por: str | None) -> dict:
    if estado not in ("activa", "descartada"):
        raise HTTPException(status_code=422, detail="Se acepta o se descarta.")
    with db_session:
        e = PizarraEstructura.get(clave=clave)
        if e is None:
            raise HTTPException(status_code=404, detail="Esa estructura no existe.")
        e.estado, e.decidido_por, e.decidido_at = estado, por, datetime.utcnow()
        if estado == "descartada":
            for d in PizarraHistoriaDia.select(lambda d: d.estructura == clave):
                d.estructura = None  # vuelven a quedar sueltas
    return listar()


# ------------------------------------------------------------------ revisión

SYSTEM = """Estudiás cómo arma Juan Carrizo (ATV) sus secuencias de historias de Instagram. Una secuencia es un día de historias, en orden.

Te paso el catálogo de estructuras que Juan ya usa (sacadas de sus secuencias reales), las secuencias sueltas de antes que no entraron en ninguna, y las fotos de las historias nuevas agrupadas por día: leelas con la herramienta Read, una por una y en orden.

Para cada día nuevo:
- "estructura": la clave de la estructura del catálogo que sigue, solo si los pasos coinciden de verdad (el arco, no el tema). Si no entra en ninguna, null.
- "resumen": la secuencia en una línea, paso por paso, como "gancho (…) → prueba (…) → cta (responde PALABRA)".

Estructuras nuevas: proponé una SOLO si dos o más secuencias (días nuevos o sueltas de antes) comparten la misma forma y esa forma no está en el catálogo. Nunca la inventes ni la armes con una sola secuencia. Cada paso con un rol de esta lista: gancho, contexto, enseñanza, prueba, historia_personal, humor, objecion, cta, otro; y en "que" lo que va en esa historia, con las palabras de Juan cuando se pueda.

Devolvé SOLO un objeto JSON, sin texto antes ni después:
{"dias": [{"fecha": "AAAA-MM-DD", "estructura": "clave" o null, "resumen": "..."}],
 "nuevas": [{"nombre": "...", "cuando": "para qué sirve, en una frase", "pasos": [{"rol": "...", "que": "..."}], "fechas": ["AAAA-MM-DD", "..."]}]}"""


def _slug(nombre: str) -> str:
    t = unicodedata.normalize("NFKD", nombre or "").encode("ascii", "ignore").decode().lower()
    return "-".join(re.sub(r"[^a-z0-9]+", " ", t).split())[:48] or "estructura"


def _limpio(v, largo: int) -> str:
    return " ".join(str(v or "").split())[:largo]


def validar(data: dict, nuevos: set[str], sueltas: set[str], claves: set[str]) -> dict:
    """Lo que se puede aplicar de la respuesta de Claude. Las fechas tienen que ser días
    leídos; una estructura nueva necesita dos secuencias reales que no tengan otra."""
    dias = []
    for d in data.get("dias") or []:
        if not isinstance(d, dict) or d.get("fecha") not in nuevos:
            continue
        est = d.get("estructura") if d.get("estructura") in claves else None
        dias.append({"fecha": d["fecha"], "estructura": est, "resumen": _limpio(d.get("resumen"), 600) or None})
    sin_estructura = {d["fecha"] for d in dias if d["estructura"] is None} | sueltas
    vistos = {d["fecha"] for d in dias}
    sin_estructura |= nuevos - vistos  # un día que Claude no clasificó queda suelto
    nuevas, usadas = [], set()
    for n in data.get("nuevas") or []:
        if not isinstance(n, dict):
            continue
        fechas = sorted({f for f in n.get("fechas") or [] if f in sin_estructura and f not in usadas})
        pasos = [{"rol": p["rol"], "que": _limpio(p.get("que"), 300)} for p in n.get("pasos") or []
                 if isinstance(p, dict) and p.get("rol") in ROLES and _limpio(p.get("que"), 300)]
        nombre = _limpio(n.get("nombre"), 80)
        if len(fechas) < MIN_EJEMPLOS_NUEVA or len(pasos) < 2 or not nombre:
            continue
        usadas.update(fechas)
        nuevas.append({"nombre": nombre, "cuando": _limpio(n.get("cuando"), 300) or None, "pasos": pasos[:10], "fechas": fechas})
    return {"dias": dias, "nuevas": nuevas, "sueltos": sorted(nuevos - vistos)}


def _dias_nuevos(hoy: date) -> dict[str, list[str]]:
    """Los días con historias que todavía no se leyeron, hasta ayer: {fecha: [fotos en orden]}."""
    from src.services import narrativa_services as nv

    with db_session:
        leidos = {d.fecha for d in PizarraHistoriaDia.select()}
        desde = date.fromisoformat(max(leidos)) + timedelta(days=1) if leidos else hoy - timedelta(days=7)
        ini = datetime.combine(desde, datetime.min.time())
        fin = datetime.combine(hoy, datetime.min.time())
        pubs = sorted(PublicacionIg.select(lambda p: p.tipo == "historia" and p.publicado_at >= ini and p.publicado_at < fin),
                      key=lambda p: p.publicado_at)
        por_dia: dict[str, list[str]] = {}
        for p in pubs:
            f = p.publicado_at.date().isoformat()
            if f in leidos:
                continue
            foto = nv._ruta_foto(p.thumbnail)
            if foto:
                por_dia.setdefault(f, []).append(foto)
    return dict(sorted(por_dia.items())[:MAX_DIAS])


def _prompt(por_dia: dict[str, list[str]], sueltas: list[tuple[str, str]]) -> str:
    partes = ["# Catálogo de estructuras de Juan\n" + (catalogo_texto() or "(vacío)")]
    if sueltas:
        partes.append("# Secuencias sueltas de antes (no entraron en ninguna)\n" + "\n".join(f"- {f}: {r}" for f, r in sueltas))
    partes.append("# Historias nuevas (fotos para leer con Read, en orden)\n" + "\n".join(
        f"## {f}\n" + "\n".join(fotos) for f, fotos in por_dia.items()))
    return "\n\n".join(partes)


def revisar(origen: str = "manual", hoy: date | None = None) -> dict:
    """Lee las historias nuevas y aprende. Corre en segundo plano."""
    from src.services.narrativa_services import AR_TZ

    hoy = hoy or datetime.now(AR_TZ).date()
    if not _en_curso.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya se están leyendo las historias nuevas.")
    try:
        por_dia = _dias_nuevos(hoy)
        with db_session:
            if por_dia:
                PizarraEstructuraRevision(desde=date.fromisoformat(min(por_dia)), hasta=date.fromisoformat(max(por_dia)),
                                          dias=len(por_dia), origen=origen)
            else:
                PizarraEstructuraRevision(desde=hoy - timedelta(days=7), hasta=hoy - timedelta(days=1),
                                          estado="sin_historias", origen=origen)
    except Exception:
        _en_curso.release()
        raise
    if por_dia:
        threading.Thread(target=_revisar, args=(por_dia,), daemon=True).start()  # libera el candado al terminar
    else:
        _en_curso.release()
    return listar()


def _revisar(por_dia: dict[str, list[str]]) -> None:
    from src.services import narrativa_services as nv

    try:
        with db_session:
            sueltas = [(d.fecha, d.resumen or "") for d in PizarraHistoriaDia.select(lambda d: d.estructura is None)]
            sueltas = sorted(sueltas)[-40:]
        claves = set(activas())
        fotos = [f for fs in por_dia.values() for f in fs][:MAX_FOTOS]
        data = nv._claude(_prompt(por_dia, sueltas), fotos, system=SYSTEM)
        res = validar(data, set(por_dia), {f for f, _ in sueltas}, claves)
        aplicar(res)
        _cerrar(estado="lista", nuevas=len(res["nuevas"]))
    except Exception as e:  # noqa: BLE001 — la falla queda escrita en la revisión
        logger.exception("Estructuras: falló la revisión")
        _cerrar(estado="error", error=str(e)[:400])
    finally:
        _en_curso.release()


def _cerrar(estado: str, nuevas: int = 0, error: str | None = None) -> None:
    with db_session:
        rev = PizarraEstructuraRevision.select().order_by(desc(PizarraEstructuraRevision.id)).first()
        if rev is not None:
            rev.estado, rev.nuevas, rev.error = estado, nuevas, error


def aplicar(res: dict) -> None:
    """Los días leídos quedan guardados; los que entran en una estructura le suman un
    ejemplo; las nuevas quedan propuestas con sus días."""
    with db_session:
        for d in res["dias"]:
            fila = PizarraHistoriaDia.get(fecha=d["fecha"]) or PizarraHistoriaDia(fecha=d["fecha"])
            fila.estructura, fila.resumen, fila.revisado_at = d["estructura"], d["resumen"], datetime.utcnow()
            if d["estructura"]:
                e = PizarraEstructura.get(clave=d["estructura"])
                fechas = set(json.loads(e.ejemplos_json or "[]")) | {d["fecha"]}
                e.ejemplos_json = json.dumps(sorted(fechas))
        for f in res.get("sueltos") or []:
            if PizarraHistoriaDia.get(fecha=f) is None:
                PizarraHistoriaDia(fecha=f, estructura=None, resumen=None)
        for n in res["nuevas"]:
            clave, i = _slug(n["nombre"]), 2
            base = clave
            while PizarraEstructura.get(clave=clave) is not None:
                clave, i = f"{base}-{i}", i + 1
            PizarraEstructura(clave=clave, nombre=n["nombre"], cuando=n["cuando"], pasos_json=json.dumps(n["pasos"], ensure_ascii=False),
                              ejemplos_json=json.dumps(n["fechas"]), estado="propuesta", origen="revision")
            for f in n["fechas"]:
                fila = PizarraHistoriaDia.get(fecha=f)
                if fila is not None:
                    fila.estructura = clave


def iniciar_scheduler(stop: threading.Event) -> None:
    """Los lunes a las 10:00 (Argentina) lee las historias nuevas, una sola vez."""
    from src.services.narrativa_services import AR_TZ

    if not ACTIVA:
        return
    while not stop.is_set():
        ahora = datetime.now(AR_TZ)
        if ahora.weekday() == 0 and (ahora.hour, ahora.minute) == HORA_AR:
            with db_session:
                ya = PizarraEstructuraRevision.select(lambda r: r.origen == "programado" and r.creado_at >= datetime.utcnow() - timedelta(hours=2)).exists()
            if not ya:
                try:
                    revisar(origen="programado", hoy=ahora.date())
                except Exception:  # noqa: BLE001
                    logger.exception("Estructuras: la revisión programada falló al arrancar")
        stop.wait(30)
