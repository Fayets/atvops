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

from datetime import datetime, timedelta

from fastapi import HTTPException
from pony.orm import db_session

from src.models import ReunionCrm, TheoEnvio, TheoMensaje
from src.services import daily_services

ROLES = ("admin", "operaciones")
GRUPO_VENTAS = "120363405702147911@g.us"
REINTENTOS = 3

# (clave, nombre, cuándo, grupo, jid, plantilla, la arma Ops)
ENVIOS = (
    ("daily", "Daily completada", "Lunes a viernes · 23:00", "Equipo ATV", None,
     "Daily completada · {dia} {fecha}\n\n{lista}"),
    ("llamadas", "Resultado de cada llamada", "Apenas llega el reporte de Fathom (cada 10 min)",
     "Ventas ATV", GRUPO_VENTAS, None),
    ("landing", "Landing del webinar sin registros", "Cada 15 min, solo si falla", "Ventas ATV", GRUPO_VENTAS, None),
    ("capacidad", "Capacidad Operativa", "Todos los días · 8:00", "Capacidad Operativa ATV", None, None),
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
            if TheoEnvio.get(clave=clave) is None:
                TheoEnvio(clave=clave, nombre=nombre, cuando=cuando, grupo_nombre=grupo, grupo_jid=jid,
                          plantilla=plantilla, activo=True)


def envio_activo(clave: str) -> bool:
    with db_session:
        e = TheoEnvio.get(clave=clave)
        return True if e is None else e.activo


# ------------------------------------------------------------------ la daily


def _texto_daily(m: TheoMensaje) -> str:
    """La lista de quién guardó su daily, armada en este momento con la plantilla."""
    fecha = m.sale_at.date()
    datos = daily_services.theo(fecha)
    lista = "\n".join(f"{p['nombre']} {'✅' if p['completada'] else '❌'}" for p in datos["personas"])
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
        sale = datetime.combine(hoy, datetime.min.time()).replace(hour=23)
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
        "texto": _texto(m), "se_arma_al_salir": m.estado == "pendiente" and not m.texto and m.envio == "daily",
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


def listar(vista: str, envio: str | None = None, q: str | None = None) -> dict:
    """vista: "pendientes" (lo que va a salir) o "enviados" (lo que salió, falló o se frenó)."""
    with db_session:
        _al_dia()
    with db_session:
        envios = {e.clave: e for e in TheoEnvio.select()}
        if vista == "pendientes":
            ms = list(TheoMensaje.select(lambda m: m.estado == "pendiente"))
            ll = [r for r in list(ReunionCrm.select())
                  if (r.reporte_mensaje or "").strip() and r.reporte_enviado_at is None and not r.reporte_frenado_por]
        else:
            desde = daily_services.ahora() - timedelta(days=30)
            ms = list(TheoMensaje.select(lambda m: m.estado != "pendiente" and m.sale_at >= desde))
            ll = [r for r in list(ReunionCrm.select())
                  if (r.reporte_mensaje or "").strip() and (r.reporte_enviado_at or r.reporte_frenado_por)
                  and (r.reporte_at or datetime.min) >= desde]
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
    with db_session:
        hoy = daily_services.ahora().date()
        inicio = datetime.combine(hoy, datetime.min.time())
        pend = TheoMensaje.select(lambda m: m.estado == "pendiente").count()
        pend += len([r for r in list(ReunionCrm.select())
                     if (r.reporte_mensaje or "").strip() and r.reporte_enviado_at is None and not r.reporte_frenado_por])
        enviados_hoy = TheoMensaje.select(lambda m: m.estado == "enviado" and m.enviado_at >= inicio).count()
        enviados_hoy += len([r for r in list(ReunionCrm.select()) if r.reporte_enviado_at and r.reporte_enviado_at >= inicio])
        fallidos = TheoMensaje.select(lambda m: m.estado == "fallido" and m.sale_at >= inicio - timedelta(days=7)).count()
        envios = list(TheoEnvio.select())
        return {"pendientes": pend, "enviados_hoy": enviados_hoy, "fallidos": fallidos,
                "envios_activos": sum(1 for e in envios if e.activo), "envios": len(envios)}


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
            "grupo_jid": e.grupo_jid, "plantilla": e.plantilla, "activo": e.activo,
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
            out.append({"id": m.id, "jid": jid, "texto": _texto(m), "envio": m.envio})
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
