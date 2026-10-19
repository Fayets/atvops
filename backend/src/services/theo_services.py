"""
Lo que manda Theo, en un solo lugar.

Theo no redacta: Ops deja cada mensaje armado y un script del VPS (deploy/theo/theo-cola.py)
lo manda por WhatsApp y avisa cómo le fue. Así lo que todavía no salió se puede leer,
editar, frenar o mandar ya, y lo que salió queda como registro. Lo que ya salió no se
cambia: WhatsApp no deja que Theo edite un mensaje enviado.

Dos colas conviven:
- `TheoMensaje`: la daily de las 23:00 y lo que registren otros scripts (landing caída,
  Capacidad Operativa).
- Los reportes de llamadas, que ya tenían su cola en `ReunionCrm` y su propio script
  (avisar-llamadas.py). No se migran: se leen y se editan ahí mismo, para no romper un
  aviso que anda en producción ni mandar nada dos veces.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from pony.orm import db_session

from src.db import db
from src.models import ReunionCrm, TheoEnvio, TheoMensaje, Usuario
from src.services import daily_services

ROLES = ("admin", "operaciones")
GRUPO_VENTAS = "120363405702147911@g.us"
REINTENTOS = 3
HORA_DAILY = (23, 30)

# La semana de Theo, como la planificó Franco: grupo → qué sale cada día y a qué hora.
# Días 0=domingo … 6=sábado. "rastreo": "ops" = sale por la cola de Ops (se sabe si salió);
# "registro" = lo manda Theo por su cuenta y Ops solo sabe lo que el script anota.
PROGRAMA = (
    ("ATV 500K", [
        {"clave": "recordatorio_semana", "nombre": "Recordatorio de preparar objetivos semanales",
         "dias": [0], "hora": None, "rastreo": "registro"},
        {"clave": "daily", "nombre": "Checkeo de daily", "dias": [1, 2, 3, 4, 5], "hora": "23:30", "rastreo": "ops"},
    ]),
    ("Sales", [
        {"clave": "recordatorio_llamadas", "nombre": "Recordatorio de llamadas", "dias": [0, 1, 2, 3, 4, 5, 6],
         "hora": "08:00", "rastreo": "registro"},
        {"clave": "llamadas", "nombre": "Resumen de llamada", "dias": [0, 1, 2, 3, 4, 5, 6], "hora": None,
         "rastreo": "llamadas"},
    ]),
    ("Health", [
        {"clave": "caja", "nombre": "Cierre de caja", "dias": [0, 1, 2, 3, 4, 5, 6], "hora": "23:00",
         "rastreo": "registro"},
    ]),
)

# (clave, nombre, cuándo, grupo, jid, plantilla, la arma Ops)
ENVIOS = (
    ("daily", "Checkeo de daily", "Lunes a viernes · 23:30", "ATV 500K", None,
     "Daily completada · {dia} {fecha}\n\n{lista}"),
    ("llamadas", "Resultado de cada llamada", "Apenas llega el reporte de Fathom (cada 10 min)",
     "Ventas ATV", GRUPO_VENTAS, None),
    ("landing", "Landing del webinar sin registros", "Cada 15 min, solo si falla", "Ventas ATV", GRUPO_VENTAS, None),
    ("capacidad", "Capacidad Operativa", "Todos los días · 8:00", "Capacidad Operativa ATV", None, None),
    # Los que manda Theo por su cuenta (skills del VPS): acá solo queda lo que registran.
    ("recordatorio_semana", "Recordatorio de preparar objetivos semanales", "Domingos", "ATV 500K", None, None),
    ("recordatorio_llamadas", "Recordatorio de llamadas", "Todos los días · 8:00", "Sales", GRUPO_VENTAS, None),
    ("caja", "Cierre de caja", "Todos los días · 23:00", "Health", None, None),
)
# Lo que muestra la pantalla de cada envío.
DETALLE = {
    "daily": {"fuente": "ATV Ops · Daily", "ia": False, "variables": ["{dia}", "{fecha}", "{lista}"]},
    "llamadas": {"fuente": "Fathom → ATV Ops", "ia": True,
                 "nota": "El texto lo escribe la IA con la grabación. Cada reporte se puede editar o frenar antes de que salga."},
    "landing": {"fuente": "Tracking de landings", "ia": False,
                "nota": "Lo manda el VPS directo cuando la landing deja de guardar. Acá queda el registro."},
    "capacidad": {"fuente": "Agenda de Nick", "ia": False,
                  "nota": "Es una imagen que arma el VPS a las 8:00. Acá queda el registro."},
}


def ensure_envios() -> None:
    with db_session:
        for clave, nombre, cuando, grupo, jid, plantilla in ENVIOS:
            e = TheoEnvio.get(clave=clave)
            if e is None:
                TheoEnvio(clave=clave, nombre=nombre, cuando=cuando, grupo_nombre=grupo, grupo_jid=jid,
                          plantilla=plantilla, activo=True)
            else:
                # El nombre, el horario y el grupo los define el código; el ID del grupo, no.
                e.nombre, e.cuando, e.grupo_nombre = nombre, cuando, grupo


def envio_activo(clave: str) -> bool:
    with db_session:
        e = TheoEnvio.get(clave=clave)
        return True if e is None else e.activo


# ------------------------------------------------------------------ la daily


def _texto_daily(m: TheoMensaje, etiquetar: bool = False) -> str:
    """La lista de quién guardó su daily, armada en este momento con la plantilla. Si
    etiqueta, cada uno va como mención: en WhatsApp se ve su nombre y le llega el aviso."""
    fecha = m.sale_at.date()
    datos = daily_services.theo(fecha)
    lista = "\n".join(f"{'@' + p['whatsapp'] if etiquetar and p.get('whatsapp') else p['nombre']} "
                      f"{'✅' if p['completada'] else '❌'}" for p in datos["personas"])
    e = TheoEnvio.get(clave="daily")
    plantilla = (e.plantilla if e and e.plantilla else ENVIOS[0][5])
    return (plantilla.replace("{dia}", daily_services.DIAS[fecha.weekday()])
            .replace("{fecha}", fecha.strftime("%d/%m")).replace("{lista}", lista))


def _texto(m: TheoMensaje) -> str:
    if m.texto:
        return m.texto
    if m.envio == "daily":
        return _texto_daily(m)
    return ""


# ------------------------------------------------------------------ etiquetar al equipo
#
# OpenClaw convierte "@5493511234567" en una mención de verdad si ese número está en el
# grupo: el texto lleva el número y WhatsApp muestra el nombre. Un número que no está en el
# grupo queda como texto, por eso se etiqueta solo a quien tiene su WhatsApp cargado.


def equipo_etiquetable() -> dict:
    """Quién se etiqueta (tiene WhatsApp en Backbone → Equipo y roles) y a quién le falta."""
    with db_session:
        gente = sorted(Usuario.select(lambda u: u.area is not None), key=lambda u: (u.orden, u.username))
        return {"con": [{"nombre": u.nombre or u.username, "whatsapp": u.whatsapp} for u in gente if u.whatsapp],
                "sin": [u.nombre or u.username for u in gente if not u.whatsapp]}


def _etiqueta(m: TheoMensaje, e: TheoEnvio | None) -> bool:
    return bool(m.etiquetar or (e is not None and e.etiquetar))


def _texto_final(m: TheoMensaje, e: TheoEnvio | None) -> str:
    """Lo que sale de verdad: el texto y, si etiqueta, una mención por cada uno del equipo
    que todavía no esté nombrado (la daily ya los nombra en la lista)."""
    etiquetar = _etiqueta(m, e)
    if m.texto:
        texto = m.texto
    elif m.envio == "daily":
        texto = _texto_daily(m, etiquetar)
    else:
        texto = ""
    if not etiquetar or not texto:
        return texto
    faltan = [f"@{p['whatsapp']}" for p in equipo_etiquetable()["con"]
              if not re.search(rf"@\+?{p['whatsapp']}(?!\d)", texto)]
    return f"{texto}\n\n{' '.join(faltan)}" if faltan else texto


def _a_la_vista(texto: str) -> str:
    """Como lo ve el grupo: "@5493511234567" → "@Franco"."""
    nombres = {p["whatsapp"]: p["nombre"] for p in equipo_etiquetable()["con"]}
    return re.sub(r"@\+?(\d{10,15})", lambda x: f"@{nombres[x.group(1)]}" if x.group(1) in nombres else x.group(0), texto)


def _asegurar_daily() -> None:
    """Deja en la cola la daily de hoy, si es día hábil y el envío está prendido."""
    ahora = daily_services.ahora()
    hoy = ahora.date()
    if hoy.weekday() >= 5:
        return
    e = TheoEnvio.get(clave="daily")
    if e is None or not e.activo:
        return
    clave = f"daily:{hoy.isoformat()}"
    if TheoMensaje.get(clave=clave) is None:
        sale = datetime.combine(hoy, datetime.min.time()).replace(hour=HORA_DAILY[0], minute=HORA_DAILY[1])
        TheoMensaje(clave=clave, envio="daily", grupo_nombre=e.grupo_nombre, grupo_jid=e.grupo_jid,
                    sale_at=sale, expira_at=sale + timedelta(minutes=59))


def _vencer() -> None:
    """Un pendiente que ya no tiene sentido mandar (la daily de ayer) queda como fallido."""
    ahora = daily_services.ahora()
    for m in TheoMensaje.select(lambda m: m.estado in ("pendiente", "fallido") and m.expira_at is not None):
        if m.expira_at < ahora:
            if m.estado == "pendiente" or not m.error:
                m.error = "No salió a tiempo: se venció."
            m.estado = "fallido"
            m.intentos = max(m.intentos, REINTENTOS)


def _al_dia() -> None:
    _asegurar_daily()
    _vencer()


# ------------------------------------------------------------------ la pantalla


def _iso(d: datetime | None) -> str | None:
    return d.isoformat(timespec="minutes") if d else None


def _msg_dict(m: TheoMensaje, envios: dict) -> dict:
    e = envios.get(m.envio)
    jid = m.grupo_jid or (e.grupo_jid if e else None)
    return {
        "id": f"m-{m.id}", "envio": m.envio, "envio_nombre": e.nombre if e else m.envio,
        "grupo": m.grupo_nombre or (e.grupo_nombre if e else None), "sin_grupo": not jid,
        "texto": _texto(m), "vista": _a_la_vista(_texto_final(m, e)), "etiquetar": _etiqueta(m, e),
        "se_arma_al_salir": m.estado == "pendiente" and not m.texto and m.envio == "daily",
        "estado": m.estado, "sale_at": _iso(m.sale_at), "enviado_at": _iso(m.enviado_at),
        "error": m.error, "editado_por": m.editado_por, "frenado_por": m.frenado_por,
        "ia": False, "mandar_ahora": m.estado in ("pendiente", "fallido"),
    }


def _llamada_dict(r: ReunionCrm, e: TheoEnvio | None) -> dict:
    if r.reporte_frenado_por:
        estado = "frenado"
    elif r.reporte_enviado_at:
        estado = "enviado"
    else:
        estado = "pendiente"
    return {
        "id": f"ll-{r.evento_id}", "envio": "llamadas", "envio_nombre": e.nombre if e else "Resultado de cada llamada",
        "grupo": e.grupo_nombre if e else "Ventas ATV", "sin_grupo": False,
        "texto": r.reporte_mensaje or "", "se_arma_al_salir": False,
        "estado": estado, "sale_at": _iso(r.reporte_at), "enviado_at": _iso(r.reporte_enviado_at),
        "error": None, "editado_por": r.reporte_editado_por, "frenado_por": r.reporte_frenado_por,
        "ia": True, "mandar_ahora": False, "prospecto": r.prospecto,
    }


def _tabla_sql(entidad) -> str:
    t = entidad._table_
    return ".".join(f'"{p}"' for p in (t if isinstance(t, tuple) else (t,)))


# El texto del reporte es un campo largo: Pony no lo trae con la fila y lo pide aparte la
# primera vez que se lee. Filtrar "tiene reporte" en Python leía ese texto de CADA reunión,
# una consulta por reunión (medido: Theo tardaba 1,1 s, 0,7 de ellos el resumen). El filtro
# va en SQL y el texto se lee solo de las que lo tienen.
_CON_REPORTE = "reporte_mensaje IS NOT NULL AND TRIM(reporte_mensaje) <> ''"
_SIN_FRENAR = "COALESCE(reporte_frenado_por, '') = ''"


def _reuniones_con_reporte(enviadas: bool, desde: datetime | None = None) -> list:
    """Las reuniones con reporte para el grupo: las que esperan salir o las que ya salieron (o
    se frenaron) desde `desde`. Va dentro de un db_session."""
    if enviadas:
        sql = (f"SELECT * FROM {_tabla_sql(ReunionCrm)} WHERE {_CON_REPORTE} "
               f"AND (reporte_enviado_at IS NOT NULL OR NOT ({_SIN_FRENAR})) AND reporte_at >= $desde")
    else:
        sql = f"SELECT * FROM {_tabla_sql(ReunionCrm)} WHERE {_CON_REPORTE} AND reporte_enviado_at IS NULL AND {_SIN_FRENAR}"
    return list(ReunionCrm.select_by_sql(sql, globals={"desde": desde}))


def listar(vista: str, envio: str | None = None, q: str | None = None) -> dict:
    """vista: "pendientes" (lo que va a salir) o "enviados" (lo que salió, falló o se frenó)."""
    with db_session:
        _al_dia()
    with db_session:
        envios = {e.clave: e for e in TheoEnvio.select()}
        if vista == "pendientes":
            ms = list(TheoMensaje.select(lambda m: m.estado == "pendiente"))
            ll = _reuniones_con_reporte(enviadas=False)
        else:
            desde = daily_services.ahora() - timedelta(days=30)
            ms = list(TheoMensaje.select(lambda m: m.estado != "pendiente" and m.sale_at >= desde))
            ll = _reuniones_con_reporte(enviadas=True, desde=desde)
        items = [_msg_dict(m, envios) for m in ms] + [_llamada_dict(r, envios.get("llamadas")) for r in ll]
    if envio:
        items = [i for i in items if i["envio"] == envio]
    if q:
        ql = q.strip().lower()
        items = [i for i in items if ql in (i["texto"] or "").lower() or ql in (i.get("prospecto") or "").lower()]
    clave = (lambda i: i["sale_at"] or "") if vista == "pendientes" else (lambda i: i["enviado_at"] or i["sale_at"] or "")
    items.sort(key=clave, reverse=vista != "pendientes")
    return {"vista": vista, "mensajes": items, "resumen": resumen()}


def resumen() -> dict:
    """Los números de arriba de la vista, en una sola consulta (antes eran seis más una por reunión)."""
    hoy = daily_services.ahora().date()
    inicio = datetime.combine(hoy, datetime.min.time())
    hace7 = inicio - timedelta(days=7)
    m, r, e = _tabla_sql(TheoMensaje), _tabla_sql(ReunionCrm), _tabla_sql(TheoEnvio)
    with db_session:
        fila = db.select(
            f"""SELECT
                (SELECT COUNT(*) FROM {m} WHERE estado = 'pendiente'),
                (SELECT COUNT(*) FROM {r} WHERE {_CON_REPORTE} AND reporte_enviado_at IS NULL AND {_SIN_FRENAR}),
                (SELECT COUNT(*) FROM {m} WHERE estado = 'enviado' AND enviado_at >= $inicio),
                (SELECT COUNT(*) FROM {r} WHERE reporte_enviado_at >= $inicio),
                (SELECT COUNT(*) FROM {m} WHERE estado = 'fallido' AND sale_at >= $hace7),
                (SELECT COUNT(*) FROM {e}),
                (SELECT COALESCE(SUM(CASE WHEN activo THEN 1 ELSE 0 END), 0) FROM {e})""",
            {"inicio": inicio, "hace7": hace7},
        )[0]
    pend_m, pend_r, env_m, env_r, fallidos, envios, activos = (int(x or 0) for x in fila)
    return {"pendientes": pend_m + pend_r, "enviados_hoy": env_m + env_r, "fallidos": fallidos,
            "envios_activos": activos, "envios": envios}


def _buscar(ident: str):
    if ident.startswith("m-") and ident[2:].isdigit():
        m = TheoMensaje.get(id=int(ident[2:]))
        if m:
            return "m", m
    if ident.startswith("ll-"):
        r = ReunionCrm.get(evento_id=ident[3:])
        if r and (r.reporte_mensaje or "").strip():
            return "ll", r
    raise HTTPException(status_code=404, detail="Ese mensaje no existe.")


def editar(ident: str, texto: str, quien: str) -> dict:
    texto = (texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="El mensaje no puede quedar vacío.")
    with db_session:
        tipo, x = _buscar(ident)
        if tipo == "m":
            if x.estado not in ("pendiente", "fallido"):
                raise HTTPException(status_code=400, detail="Ya salió: WhatsApp no deja que Theo lo edite.")
            x.texto, x.editado_por = texto, quien
            return _msg_dict(x, {e.clave: e for e in TheoEnvio.select()})
        if x.reporte_enviado_at:
            raise HTTPException(status_code=400, detail="Ya salió: WhatsApp no deja que Theo lo edite.")
        x.reporte_mensaje, x.reporte_editado_por = texto, quien
        return _llamada_dict(x, TheoEnvio.get(clave="llamadas"))


def frenar(ident: str, quien: str) -> dict:
    with db_session:
        tipo, x = _buscar(ident)
        if tipo == "m":
            if x.estado not in ("pendiente", "fallido"):
                raise HTTPException(status_code=400, detail="Ya salió.")
            x.estado, x.frenado_por = "frenado", quien
            return _msg_dict(x, {e.clave: e for e in TheoEnvio.select()})
        if x.reporte_enviado_at:
            raise HTTPException(status_code=400, detail="Ya salió.")
        x.reporte_frenado_por = quien
        return _llamada_dict(x, TheoEnvio.get(clave="llamadas"))


def volver_a_la_cola(ident: str) -> dict:
    """Deshace un "no mandar"."""
    with db_session:
        tipo, x = _buscar(ident)
        if tipo == "m":
            if x.estado != "frenado":
                raise HTTPException(status_code=400, detail="Solo vuelve a la cola lo que se frenó.")
            x.estado, x.frenado_por = "pendiente", None
            if x.sale_at < daily_services.ahora():
                x.sale_at = daily_services.ahora()
            return _msg_dict(x, {e.clave: e for e in TheoEnvio.select()})
        x.reporte_frenado_por = None
        return _llamada_dict(x, TheoEnvio.get(clave="llamadas"))


def mandar_ahora(ident: str) -> dict:
    """Lo deja listo para la próxima corrida del VPS (cada minuto). También es "reintentar"."""
    with db_session:
        tipo, x = _buscar(ident)
        if tipo == "ll":
            raise HTTPException(status_code=400, detail="Los reportes de llamadas salen solos en la próxima corrida (cada 10 min).")
        if x.estado not in ("pendiente", "fallido"):
            raise HTTPException(status_code=400, detail="Ya salió.")
        ahora = daily_services.ahora()
        x.estado, x.sale_at, x.intentos, x.error = "pendiente", ahora, 0, None
        x.expira_at = ahora + timedelta(hours=1)
        return _msg_dict(x, {e.clave: e for e in TheoEnvio.select()})


# ------------------------------------------------------------------ envíos automáticos


def _envio_dict(e: TheoEnvio) -> dict:
    return {"clave": e.clave, "nombre": e.nombre, "cuando": e.cuando, "grupo": e.grupo_nombre,
            "grupo_jid": e.grupo_jid, "plantilla": e.plantilla, "activo": e.activo, "etiquetar": e.etiquetar,
            "actualizado_por": e.actualizado_por, **DETALLE.get(e.clave, {})}


def listar_envios() -> list[dict]:
    with db_session:
        orden = [c[0] for c in ENVIOS]
        es = sorted(TheoEnvio.select(), key=lambda e: orden.index(e.clave) if e.clave in orden else 99)
        return [_envio_dict(e) for e in es]


def actualizar_envio(clave: str, datos: dict, quien: str) -> dict:
    with db_session:
        e = TheoEnvio.get(clave=clave)
        if e is None:
            raise HTTPException(status_code=404, detail="Ese envío no existe.")
        if "activo" in datos and datos["activo"] is not None:
            e.activo = bool(datos["activo"])
        if datos.get("etiquetar") is not None:
            e.etiquetar = bool(datos["etiquetar"])
        if datos.get("plantilla") is not None:
            if e.clave != "daily":
                raise HTTPException(status_code=400, detail="Este envío no tiene plantilla: el texto lo arma otro sistema.")
            if "{lista}" not in datos["plantilla"]:
                raise HTTPException(status_code=400, detail="La plantilla tiene que llevar {lista}: es la lista de quién completó.")
            e.plantilla = datos["plantilla"]
        if datos.get("grupo") is not None:
            e.grupo_nombre = datos["grupo"].strip() or None
        if datos.get("grupo_jid") is not None:
            jid = datos["grupo_jid"].strip()
            if jid and not (jid.endswith("@g.us") or jid.endswith("@s.whatsapp.net") or jid.startswith("+")):
                raise HTTPException(status_code=400, detail="El grupo tiene que ser un id de WhatsApp (termina en @g.us).")
            e.grupo_jid = jid or None
            # Lo que todavía no salió va al grupo nuevo.
            for m in TheoMensaje.select(lambda m: m.envio == clave and m.estado == "pendiente"):
                m.grupo_jid, m.grupo_nombre = e.grupo_jid, e.grupo_nombre
        e.actualizado_por, e.actualizado_at = quien, daily_services.ahora()
        return _envio_dict(e)


# ------------------------------------------------------------------ para el VPS


def cola() -> list[dict]:
    """Lo que el script del VPS tiene que mandar ahora. El texto de la daily se arma acá,
    a la hora de salir, salvo que alguien lo haya editado."""
    with db_session:
        _al_dia()
    with db_session:
        ahora = daily_services.ahora()
        envios = {e.clave: e for e in TheoEnvio.select()}
        out = []
        for m in TheoMensaje.select(lambda m: (m.estado == "pendiente" or (m.estado == "fallido" and m.intentos < REINTENTOS))
                                    and m.sale_at <= ahora):
            e = envios.get(m.envio)
            if e is not None and not e.activo:
                continue
            jid = m.grupo_jid or (e.grupo_jid if e else None)
            if not jid:
                continue
            out.append({"id": m.id, "jid": jid, "texto": _texto_final(m, e), "envio": m.envio})
        return out


def resultado(mensaje_id: int, ok: bool, texto: str | None, error: str | None) -> dict:
    with db_session:
        m = TheoMensaje.get(id=mensaje_id)
        if m is None:
            raise HTTPException(status_code=404, detail="Ese mensaje no existe.")
        if ok:
            m.estado, m.enviado_at, m.error = "enviado", daily_services.ahora(), None
            if texto:
                m.texto = texto  # queda lo que salió de verdad, no la plantilla
        else:
            m.estado, m.intentos, m.error = "fallido", m.intentos + 1, (error or "No se pudo mandar.")[:500]
        return {"id": m.id, "estado": m.estado}


def registrar(envio: str, texto: str, ok: bool, error: str | None) -> dict:
    """Otros scripts del VPS (landing caída, Capacidad Operativa) anotan lo que mandaron."""
    with db_session:
        e = TheoEnvio.get(clave=envio)
        if e is None:
            raise HTTPException(status_code=404, detail="Ese envío no existe.")
        ahora = daily_services.ahora()
        m = TheoMensaje(envio=envio, grupo_nombre=e.grupo_nombre, grupo_jid=e.grupo_jid, texto=texto,
                        estado="enviado" if ok else "fallido", sale_at=ahora, enviado_at=ahora if ok else None,
                        error=None if ok else (error or "No se pudo mandar.")[:500],
                        intentos=REINTENTOS)  # lo registrado no se reintenta desde acá
        m.flush()
        return {"id": m.id}


# ------------------------------------------------------------------ la semana en grilla


def semana(desde: date | None = None) -> dict:
    """La semana de domingo a sábado: cada automatización del programa y si salió ese día.

    estado: enviado | fallido | frenado | pendiente (en cola) | programado (todavía no le
    toca) | no_salio (le tocaba y no hay nada) | sin_llamadas | sin_registro (Ops nunca
    supo de este envío: lo manda Theo por su cuenta y no lo anota)."""
    ahora = daily_services.ahora()
    hoy = ahora.date()
    base = desde or hoy
    domingo = base - timedelta(days=(base.weekday() + 1) % 7)
    fin = domingo + timedelta(days=7)
    inicio_dt, fin_dt = datetime.combine(domingo, datetime.min.time()), datetime.combine(fin, datetime.min.time())
    with db_session:
        _al_dia()
    with db_session:
        msgs = [m for m in TheoMensaje.select(lambda m: m.sale_at >= inicio_dt - timedelta(days=1) and m.sale_at < fin_dt)]
        alguna_vez = {m.envio for m in TheoMensaje.select()}
        por_envio_dia: dict[tuple, list] = {}
        for m in msgs:
            cuando = m.enviado_at or m.sale_at
            por_envio_dia.setdefault((m.envio, cuando.date()), []).append(m)
        # Cada llamada de venta del día espera su Fathom y su resumen: 3 llamadas, 3 resúmenes.
        llamadas_dia: dict[date, list[dict]] = {}
        for r in list(ReunionCrm.select()):
            if not (r.es_venta and r.inicio_at and inicio_dt <= r.inicio_at < fin_dt) or not _espera_resumen(r):
                continue
            llamadas_dia.setdefault(r.inicio_at.date(), []).append({
                "hora": r.inicio_at.strftime("%H:%M"),
                "quien": (r.prospecto or "Sin nombre")[:40],
                "closer": r.closer or "",
                "estado": ("enviado" if r.reporte_enviado_at else "frenado" if r.reporte_frenado_por
                           else "pendiente" if (r.reporte_mensaje or "").strip() else "sin_resumen"),
            })
        for lista in llamadas_dia.values():
            lista.sort(key=lambda x: x["hora"])

        filas = []
        for grupo, items in PROGRAMA:
            celdas = []
            for i in range(7):
                d = domingo + timedelta(days=i)
                dia = []
                for it in items:
                    if i not in it["dias"]:
                        continue
                    dia.append(_celda(it, d, ahora, por_envio_dia, llamadas_dia, alguna_vez))
                celdas.append({"fecha": d.isoformat(), "items": dia})
            filas.append({"grupo": grupo, "dias": celdas, "jid": _jid_de_grupo(grupo)})
    return {"desde": domingo.isoformat(), "hoy": hoy.isoformat(), "filas": filas, "etiquetas": equipo_etiquetable()}


_SIN_RESUMEN = {"no show", "cancelada", "re-agenda", "reagenda", "descartada"}


def _espera_resumen(r: ReunionCrm) -> bool:
    """Una llamada que no se dio (no show, cancelada, re-agendada o descartada) no tiene Fathom."""
    return not r.descartada and (r.resultado or "").strip().lower() not in _SIN_RESUMEN


def _celda(it: dict, d: date, ahora: datetime, por_envio_dia: dict, llamadas_dia: dict, alguna_vez: set) -> dict:
    out = {"clave": it["clave"], "nombre": it["nombre"], "hora": it["hora"]}
    if it["rastreo"] == "llamadas":
        lista = llamadas_dia.get(d, [])
        esperadas = len(lista)
        enviados = sum(1 for x in lista if x["estado"] == "enviado")
        out = {**out, "llamadas": lista, "esperadas": esperadas, "enviados": enviados}
        if not esperadas:
            return {**out, "estado": "programado" if d > ahora.date() else "sin_llamadas", "detalle": "sin llamadas agendadas"}
        if d > ahora.date():
            return {**out, "estado": "programado", "detalle": f"{esperadas} {'llamada agendada' if esperadas == 1 else 'llamadas agendadas'}"}
        detalle = f"{enviados} de {esperadas}"
        if enviados == esperadas:
            return {**out, "estado": "enviado", "detalle": detalle}
        # Hoy todavía pueden estar por tomarse o esperando a Fathom; un día que pasó, falta.
        return {**out, "estado": "pendiente" if d == ahora.date() else "no_salio", "detalle": detalle}
    if it["clave"] == "daily" and d < daily_services.INICIO:
        return {**out, "estado": "sin_registro", "detalle": "la daily arrancó el 19/10"}
    ms = por_envio_dia.get((it["clave"], d), [])
    for estado in ("enviado", "fallido", "frenado", "pendiente"):
        m = next((x for x in ms if x.estado == estado), None)
        if m is not None:
            hora = (m.enviado_at or m.sale_at).strftime("%H:%M")
            return {**out, "estado": estado, "mensajeId": f"m-{m.id}",
                    "detalle": f"{hora}" if estado == "enviado" else (m.error or estado)}
    momento = datetime.combine(d, datetime.min.time())
    if it["hora"]:
        h, mi = (int(x) for x in it["hora"].split(":"))
        momento = momento.replace(hour=h, minute=mi)
    else:
        momento = momento.replace(hour=23, minute=59)
    if momento > ahora:
        return {**out, "estado": "programado", "detalle": "todavía no le toca"}
    if it["rastreo"] == "registro" and it["clave"] not in alguna_vez:
        return {**out, "estado": "sin_registro", "detalle": "lo manda Theo por su cuenta y Ops no lo registra todavía"}
    return {**out, "estado": "no_salio", "detalle": "le tocaba y no salió"}


# ------------------------------------------------------------------ mandar a mano


def _jid_de_grupo(grupo: str) -> str | None:
    """El ID de WhatsApp de un grupo: el que tenga cargado cualquier envío de ese grupo."""
    with db_session:
        for e in list(TheoEnvio.select()):
            if (e.grupo_nombre or "").lower() == grupo.lower() and e.grupo_jid:
                return e.grupo_jid
    return None


def guardar_jid_grupo(grupo: str, jid: str, quien: str) -> dict:
    """Carga el ID de WhatsApp de un grupo en todos sus envíos (y en lo que esté por salir)."""
    jid = (jid or "").strip()
    if not jid.endswith("@g.us"):
        raise HTTPException(status_code=400, detail="El ID de un grupo de WhatsApp termina en @g.us.")
    with db_session:
        envios = [e for e in list(TheoEnvio.select()) if (e.grupo_nombre or "").lower() == grupo.lower()]
        if not envios:
            raise HTTPException(status_code=404, detail="No hay envíos de ese grupo.")
        for e in envios:
            e.grupo_jid, e.actualizado_por, e.actualizado_at = jid, quien, daily_services.ahora()
            for m in TheoMensaje.select(lambda m: m.envio == e.clave and m.estado == "pendiente"):
                m.grupo_jid = jid
    return {"grupo": grupo, "jid": jid}


def enviar_ahora(envio: str, texto: str, quien: str, etiquetar: bool = False) -> dict:
    """Un mensaje escrito a mano que sale ya (en la próxima vuelta de theo-cola.py, ≤1 min)."""
    texto = (texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Escribí el mensaje.")
    with db_session:
        e = TheoEnvio.get(clave=envio)
        if e is None:
            raise HTTPException(status_code=404, detail="Ese envío no existe.")
        grupo = e.grupo_nombre
    jid = _jid_de_grupo(grupo or "")
    if not jid:
        raise HTTPException(status_code=400, detail=f"Falta el ID de WhatsApp del grupo {grupo}: cargalo primero.")
    ahora = daily_services.ahora()
    with db_session:
        m = TheoMensaje(envio=envio, grupo_nombre=grupo, grupo_jid=jid, texto=texto, sale_at=ahora,
                        expira_at=ahora + timedelta(hours=1), editado_por=quien, etiquetar=bool(etiquetar))
        m.flush()
        return _msg_dict(m, {x.clave: x for x in TheoEnvio.select()})


def mensaje(ident: str) -> dict:
    """Un mensaje puntual (para abrirlo desde la grilla)."""
    with db_session:
        tipo, x = _buscar(ident)
        if tipo == "m":
            return _msg_dict(x, {e.clave: e for e in TheoEnvio.select()})
        return _llamada_dict(x, TheoEnvio.get(clave="llamadas"))
