"""
Daily, la semana de cada uno y Backbone.

Cómo trabaja el equipo: el domingo cada uno arma su semana, el lunes la presenta en la
weekly de su área y de lunes a viernes la va marcando en su daily. Las tareas del rol (las
del documento de rol de Backbone) están siempre: se copian a la semana de cada uno y ahí no
se pueden borrar. Lo demás lo suma cada uno, separado en velocidad (rutina) y
desplazamiento (lo que hace avanzar).

Theo a las 23:00 solo mira si cada uno guardó su daily ese día. Lo que hizo o no hizo se ve
acá, con el motivo que escribió, y en el organigrama de Backbone.
"""

from __future__ import annotations

import logging
import secrets
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import ES_POSTGRES
from src.models import CierreDaily, MarcaDaily, TareaRol, TareaSemana, Usuario

logger = logging.getLogger("atv_ops.daily")

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes")
ESTADOS = ("hecha", "no", "no_aplica")
AREAS = ("ventas", "marketing", "producto", "sistemas", "direccion")
ROLES_BACKBONE = ("admin", "founder", "operaciones")
# La primera semana con daily. Antes no existía: esas semanas no se cuentan ni se muestran
# en rojo (no es que nadie cumplió, es que no había dónde cargar).
INICIO = date(2026, 10, 19)

# El equipo de octubre de 2026, como lo pasó Franco. Los mails salen del equipo del
# classroom; Ignacio y Janner todavía no tienen y se cargan desde Backbone → Equipo.
# (username, nombre, rol de Ops, cargo, área, jefe, mails, orden)
EQUIPO = (
    ("juan", "Juan", "founder", "Founder", "direccion", None, ["jccarrizo.jcc@gmail.com"], 0),
    ("franco", "Franco", "admin", "Director de Ops/Sistemas", "sistemas", "juan", ["francoayet07@gmail.com"], 1),
    ("lucas", "Lucas", "ventas", "Director de Ventas", "ventas", "juan", ["lucasruarte688@gmail.com"], 10),
    ("cris", "Cris", "setter", "Setter", "ventas", "lucas", ["songercristian@gmail.com"], 11),
    ("nick", "Nick", "closer", "Closer", "ventas", "lucas", ["nicolasaliagachl@gmail.com"], 12),
    ("ignacio", "Ignacio", "marketing", "Director de Marketing", "marketing", "juan", [], 20),
    ("maite", "Maite", "marketing", "Directora Creativa", "marketing", "juan", ["maiteatv1@gmail.com"], 21),
    ("janner", "Janner", "marketing", "Head de Contenido", "marketing", "maite,ignacio", [], 22),
    ("juampi", "Juampi", "csm", "Director de Producto", "producto", "juan", ["juanpablotoledo2017.toledo@gmail.com"], 30),
    ("ale", "Ale", "csm", "CSM", "producto", "juampi", ["ramirezcalderonalejandro@gmail.com"], 31),
    ("mauri", "Mauri", "csm", "VA", "producto", "juampi", ["mauriw35@gmail.com", "s_35@live.com"], 32),
)
# `jefe` puede ser más de uno, separados por coma: Janner responde a Maite y a Ignacio.

# El organigrama de octubre (19-10-2026): Juampi encabeza producto y Maite con Ignacio,
# marketing. Se corrige una sola vez y solo si sigue como se sembró al principio (todos
# reportando a Juan): lo que se haya editado a mano no se pisa.
_ORGANIGRAMA_OCT = {"ale": ("juan", "juampi"), "mauri": ("juan", "juampi"), "janner": ("juan", "maite,ignacio")}

# Las tareas de cada rol, sacadas de los documentos de rol de Backbone. Cris hereda las del
# setter (antes Andrés) e Ignacio las del director de marketing (antes Emi). Janner no
# tiene documento todavía: se le cargan desde Backbone → Equipo.
# (frecuencia, día 0-4 o None, texto, destinatario)
TAREAS_ROL = {
    "lucas": [
        ("diaria", None, "Revisión del pipeline", None),
        ("diaria", None, "Pasadas de Discord 15:30 y 19:30", None),
        ("semanal", 0, "Prioridades de la semana con Nick y Cris", None),
        ("semanal", 1, "Clase de ventas (Boost y Mentoría, 10:00)", None),
        ("semanal", None, "Cobro de cuotas y renovaciones con Ale", None),
        ("semanal", 4, "Reporte semanal de ventas a Juan", "juan"),
        ("semanal", 4, "Conclusión de ventas para marketing", "ignacio"),
        ("mensual", None, "Revisión mensual de métricas con Nick", None),
    ],
    "cris": [
        ("diaria", None, "Apertura de conversaciones inbound y outbound", None),
        ("diaria", None, "Calificación de leads antes de pasar a Nick", None),
        ("diaria", None, "Reporte diario a Lucas antes de las 20:00", "lucas"),
        ("semanal", 0, "Prioridades de la semana con Lucas", None),
        ("semanal", None, "Reactivación de chats viejos", None),
        ("semanal", 4, "Reporte semanal a Lucas", "lucas"),
    ],
    "nick": [
        ("diaria", None, "Llamadas de venta agendadas", None),
        ("diaria", None, "Pasadas de Discord 10:00 y 19:30", None),
        ("semanal", None, "Seguimiento de leads que no cerraron", None),
        ("semanal", None, "Revisión de 3 llamadas propias", None),
        ("semanal", 4, "Transcripts con objeciones y dolores a Lucas", "lucas"),
        ("mensual", None, "Revisión mensual de métricas con Lucas", None),
    ],
    "ignacio": [
        ("diaria", None, "Pasadas de Discord 10:00 y 19:30", None),
        ("semanal", 0, "Calendario de la semana cargado", "juan"),
        ("semanal", 0, "Dirección creativa a Maite", "maite"),
        ("semanal", None, "Trackeo de conversaciones por origen", None),
    ],
    "maite": [
        ("diaria", None, "Búsqueda de referencias", None),
        ("semanal", None, "Coherencia estética de todos los canales", None),
        ("semanal", None, "Soporte en grabación y producción", None),
        ("semanal", 4, "5 referencias y 5 ideas a Ignacio", "ignacio"),
        ("mensual", None, "Auditoría visual de todos los canales", None),
    ],
    "mauri": [
        ("diaria", None, "Sweep de Discord y aviso de las 9, 11 y 16 h", None),
        ("diaria", None, "Actualización de ATV Clients", None),
        ("diaria", None, "Reporte diario en el grupo antes de las 20:00", None),
        ("semanal", 0, "Mensaje de activación semanal a clientes", None),
        ("semanal", 3, "Estado de clientes a Juan y Ale", "ale"),
        ("semanal", None, "Alerta de clientes con más de 7 días inactivos", "ale"),
    ],
    "ale": [
        ("diaria", None, "Pasadas de Discord 10:00, 16:30 y 19:30", None),
        ("diaria", None, "Upsells y recompras", None),
        ("diaria", None, "Manejo de quejas", None),
        ("semanal", 0, "Reporte semanal a Juan", "juan"),
        ("semanal", None, "Seguimiento de clientes con más de 7 días sin aparecer", None),
        ("semanal", None, "Cobro de cuotas pendientes", None),
        ("semanal", 4, "Clase de Cierre de Creadores (11:30)", None),
    ],
    "juampi": [
        ("diaria", None, "Pasadas de Discord 12:00, 15:30 y 19:30", None),
        ("diaria", None, "Disponibilidad para upsells con Ale", None),
        ("semanal", 2, "Clase de Experto en Infoproductos (11:30)", None),
        ("semanal", 3, "Clase de Anuncios y Lanzamientos (11:30)", None),
        ("semanal", None, "Llamadas 1 a 1 con clientes", None),
        ("semanal", None, "Grabación de clases para Skool", None),
        ("semanal", None, "Revisión de candidatos a ads con Juan y Ale", None),
    ],
    "franco": [
        ("diaria", None, "Leer reportes y chats del equipo", None),
        ("diaria", None, "Avanzar el proyecto activo", None),
        ("diaria", None, "Pulso de Discord", None),
        ("diaria", None, "Revisar calendarios y cuestionar reuniones", None),
        ("semanal", 0, "Weekly del lunes", None),
        ("semanal", None, "4 h de estudio de infoproductos", None),
        ("semanal", 4, "Reporte semanal y alineación con Juan", "juan"),
    ],
}


# ------------------------------------------------------------------ fechas


def ahora() -> datetime:
    """Hora de Argentina, sin zona (así se guarda en la base). En la Mac se puede fijar el día
    con DAILY_HOY_FIJO=AAAA-MM-DD para probar la daily un fin de semana; en el server no."""
    real = datetime.now(TZ).replace(tzinfo=None)
    fijo = (config("DAILY_HOY_FIJO", default="") or "").strip()
    if fijo and not ES_POSTGRES:
        return datetime.combine(date.fromisoformat(fijo), real.time())
    return real


def hoy() -> date:
    return ahora().date()


def lunes_de(d: date) -> date:
    return d - timedelta(days=d.weekday())


def semana_por_defecto() -> date:
    """Sábado y domingo se arma la semana que viene; de lunes a viernes se trabaja la actual."""
    h = hoy()
    return lunes_de(h) + timedelta(days=7) if h.weekday() >= 5 else lunes_de(h)


def _parse_fecha(texto: str | None, nombre: str = "fecha") -> date | None:
    if not texto:
        return None
    try:
        return date.fromisoformat(texto)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"La {nombre} tiene que venir como AAAA-MM-DD.")


# ------------------------------------------------------------------ equipo


def _emails(u: Usuario) -> list[str]:
    return [e.strip().lower() for e in (u.emails or "").replace(",", "\n").splitlines() if e.strip()]


def _hash_inutilizable() -> str:
    """Quien entra con Google no tiene contraseña: este hash no coincide con ninguna."""
    return f"google${secrets.token_hex(32)}"


def ensure_equipo() -> None:
    """Crea a quien falte y completa lo que esté vacío. No pisa lo que Franco editó: la daily
    se prende sola una única vez, cuando a esa persona se le siembran las tareas del rol."""
    with db_session:
        for username, nombre, rol, cargo, area, jefe, mails, orden in EQUIPO:
            u = Usuario.get(username=username)
            if u is None:
                u = Usuario(username=username, password_hash=_hash_inutilizable(), nombre=nombre, rol=rol,
                            daily=username != "juan")
                logger.info("Equipo: alta de %s", username)
            if not u.cargo:
                u.cargo = cargo
            if not u.area:
                u.area = area
            if not u.jefe and jefe:
                u.jefe = jefe
            if not u.emails and mails:
                u.emails = "\n".join(mails)
            if not u.orden:
                u.orden = orden
        for username, (antes, ahora) in _ORGANIGRAMA_OCT.items():
            u = Usuario.get(username=username)
            if u is not None and u.jefe == antes:
                u.jefe = ahora
        for username, tareas in TAREAS_ROL.items():
            if TareaRol.select(lambda t: t.usuario == username).count():
                continue
            u = Usuario.get(username=username)
            if u is not None:
                u.daily = True
            for i, (frec, dia, texto, dest) in enumerate(tareas):
                TareaRol(usuario=username, texto=texto, frecuencia=frec, dia=dia, destinatario=dest, orden=i)


def _persona(u: Usuario) -> dict:
    return {
        "username": u.username,
        "nombre": u.nombre or u.username,
        "cargo": u.cargo,
        "area": u.area,
        "jefe": u.jefe,
        "daily": u.daily,
        "foto_url": u.foto_url,
        "orden": u.orden,
        "rol": u.rol,
        "emails": _emails(u),
        "whatsapp": u.whatsapp,
    }


def listar_equipo() -> list[dict]:
    with db_session:
        gente = list(Usuario.select(lambda u: u.area is not None))
        return [_persona(u) for u in sorted(gente, key=lambda u: (u.orden, u.username))]


def actualizar_persona(username: str, datos: dict) -> dict:
    with db_session:
        u = Usuario.get(username=username)
        if u is None:
            raise HTTPException(status_code=404, detail="No existe esa persona.")
        if "nombre" in datos and datos["nombre"]:
            u.nombre = datos["nombre"].strip()
        if "cargo" in datos:
            u.cargo = (datos["cargo"] or "").strip() or None
        if "area" in datos:
            if datos["area"] not in AREAS:
                raise HTTPException(status_code=400, detail="Área inválida.")
            u.area = datos["area"]
        if "jefe" in datos:
            # Uno o varios (lista o "a,b"): un equipo puede tener dos cabezas.
            crudo = datos["jefe"] or []
            jefes = [j.strip() for j in (crudo if isinstance(crudo, list) else str(crudo).split(",")) if j and j.strip()]
            for j in jefes:
                if j == username or Usuario.get(username=j) is None:
                    raise HTTPException(status_code=400, detail="Ese jefe no existe.")
            u.jefe = ",".join(dict.fromkeys(jefes)) or None
        if "daily" in datos:
            u.daily = bool(datos["daily"])
        if "emails" in datos:
            mails = [m.strip().lower() for m in datos["emails"] if m and m.strip()]
            for m in mails:
                if "@" not in m:
                    raise HTTPException(status_code=400, detail=f"«{m}» no es un mail.")
                otro = next((o for o in Usuario.select() if o.username != username and m in _emails(o)), None)
                if otro:
                    raise HTTPException(status_code=409, detail=f"{m} ya es de {otro.nombre or otro.username}.")
            u.emails = "\n".join(mails) or None
        if "whatsapp" in datos:
            u.whatsapp = normalizar_whatsapp(datos["whatsapp"])
        return _persona(u)


def normalizar_whatsapp(numero: str | None) -> str | None:
    """Solo dígitos, con código de país: "+54 9 351 123-4567" → "5493511234567"."""
    digitos = "".join(c for c in str(numero or "") if c.isdigit())
    if not digitos:
        return None
    if not 10 <= len(digitos) <= 15:
        raise HTTPException(status_code=400, detail="El WhatsApp va con código de país: 5493511234567.")
    return digitos


def usuario_por_email(email: str) -> Usuario | None:
    email = email.strip().lower()
    for u in Usuario.select():
        if email in _emails(u):
            return u
    return None


# --------------------------------------------------------------- tareas del rol


def _tarea_rol_dict(t: TareaRol) -> dict:
    return {"id": t.id, "texto": t.texto, "frecuencia": t.frecuencia, "dia": t.dia,
            "destinatario": t.destinatario, "orden": t.orden}


def tareas_rol(username: str) -> list[dict]:
    with db_session:
        ts = TareaRol.select(lambda t: t.usuario == username and t.activa)
        return [_tarea_rol_dict(t) for t in sorted(ts, key=lambda t: t.orden)]


def _validar_tarea_rol(t: dict) -> None:
    if not (t.get("texto") or "").strip():
        raise HTTPException(status_code=400, detail="Hay una tarea sin texto.")
    if t.get("frecuencia") not in ("diaria", "semanal", "mensual"):
        raise HTTPException(status_code=400, detail="La frecuencia es diaria, semanal o mensual.")
    dia = t.get("dia")
    if dia is not None and (t["frecuencia"] != "semanal" or dia not in range(5)):
        raise HTTPException(status_code=400, detail="Solo las semanales llevan día, de lunes a viernes.")


def guardar_tareas_rol(username: str, tareas: list[dict]) -> list[dict]:
    """Reemplaza la plantilla del rol. Las que se sacan quedan inactivas, no se borran:
    las semanas pasadas las siguen mostrando con lo que se marcó."""
    for t in tareas:
        _validar_tarea_rol(t)
    with db_session:
        if Usuario.get(username=username) is None:
            raise HTTPException(status_code=404, detail="No existe esa persona.")
        actuales = {t.id: t for t in TareaRol.select(lambda t: t.usuario == username and t.activa)}
        vistos = set()
        for i, t in enumerate(tareas):
            dest = t.get("destinatario") or None
            if t.get("id") in actuales:
                r = actuales[t["id"]]
                r.texto, r.frecuencia, r.dia, r.destinatario, r.orden = (
                    t["texto"].strip(), t["frecuencia"], t.get("dia"), dest, i)
                vistos.add(r.id)
            else:
                TareaRol(usuario=username, texto=t["texto"].strip(), frecuencia=t["frecuencia"],
                         dia=t.get("dia"), destinatario=dest, orden=i)
        for id_, r in actuales.items():
            if id_ not in vistos:
                r.activa = False
    return tareas_rol(username)


# --------------------------------------------------------------- la semana


# Daily libre (19-10-2026): cada uno arma su semana entera. Las tareas fijas de cada rol
# vuelven cuando Franco defina cuáles son de verdad; hasta entonces no se copian y las que
# se habían copiado sin marcas se sacan.
ROL_EN_LA_DAILY = False


def _sincronizar_semana(username: str, semana: date) -> None:
    """Copia a la semana las tareas del rol que falten. En semanas que no pasaron, también
    acomoda lo que cambió en la plantilla, siempre que la tarea no tenga marcas."""
    ya = {t.tarea_rol: t for t in TareaSemana.select(
        lambda t: t.usuario == username and t.semana == semana and t.origen == "rol")}
    # Una semana que ya terminó no se toca, y antes del inicio no hay nada que copiar.
    editable = semana >= INICIO and semana + timedelta(days=4) >= hoy()
    if not ROL_EN_LA_DAILY:
        for t in ya.values():
            if editable and not t.borrada and not t.marcas.count():
                t.borrada = True
        return
    rol = {t.id: t for t in TareaRol.select(lambda t: t.usuario == username)}
    for id_, r in rol.items():
        t = ya.get(id_)
        if t is None:
            if r.activa and editable:
                TareaSemana(usuario=username, semana=semana, texto=r.texto, tipo="velocidad", origen="rol",
                            frecuencia=r.frecuencia, dia=r.dia, destinatario=r.destinatario,
                            tarea_rol=id_, orden=r.orden)
            continue
        if not editable or t.marcas.count():
            continue
        if not r.activa:
            t.borrada = True
        else:
            t.texto, t.frecuencia, t.dia, t.destinatario, t.orden, t.borrada = (
                r.texto, r.frecuencia, r.dia, r.destinatario, r.orden, False)


def _vence(t: TareaSemana, dia: int) -> bool:
    """Si la tarea hay que marcarla ese día sí o sí."""
    return t.frecuencia == "diaria" or (t.frecuencia == "semanal" and t.dia == dia)


def _abierta(t: TareaSemana) -> bool:
    """Se cierra cualquier día: semanal sin día, o mensual."""
    return t.frecuencia == "mensual" or (t.frecuencia == "semanal" and t.dia is None)


def _hecha_en_mes(t: TareaSemana) -> date | None:
    """Una mensual hecha en otra semana del mismo mes ya está hecha."""
    if t.frecuencia != "mensual" or t.tarea_rol is None:
        return None
    inicio = t.semana.replace(day=1) - timedelta(days=7)
    fechas = [m.fecha for m in MarcaDaily.select(
        lambda m: m.tarea.usuario == t.usuario and m.tarea.tarea_rol == t.tarea_rol
        and m.estado == "hecha" and m.fecha >= inicio)]
    fechas = [f for f in fechas if (f.year, f.month) == (t.semana.year, t.semana.month)]
    return min(fechas) if fechas else None


def _tarea_dict(t: TareaSemana) -> dict:
    marcas = {m.fecha.isoformat(): {"estado": m.estado, "motivo": m.motivo} for m in t.marcas}
    mes = _hecha_en_mes(t)
    return {
        "id": t.id, "texto": t.texto, "tipo": t.tipo, "origen": t.origen, "frecuencia": t.frecuencia,
        "dia": t.dia, "destinatario": t.destinatario, "marcas": marcas,
        "hecha_mes": mes.isoformat() if mes else None,
    }


def _tareas(username: str, semana: date) -> list[TareaSemana]:
    ts = TareaSemana.select(lambda t: t.usuario == username and t.semana == semana and not t.borrada)
    return sorted(ts, key=lambda t: (t.origen != "rol", t.orden, t.id))


def _cierres(username: str, semana: date) -> dict[date, CierreDaily]:
    fin = semana + timedelta(days=4)
    return {c.fecha: c for c in CierreDaily.select(
        lambda c: c.usuario == username and c.fecha >= semana and c.fecha <= fin)}


def ver_semana(username: str, semana: date | None) -> dict:
    semana = lunes_de(semana or semana_por_defecto())
    h = hoy()
    with db_session:
        u = Usuario.get(username=username)
        if u is None:
            raise HTTPException(status_code=404, detail="No existe esa persona.")
        _sincronizar_semana(username, semana)
    with db_session:
        cierres = _cierres(username, semana)
        dias = []
        for i in range(5):
            f = semana + timedelta(days=i)
            c = cierres.get(f)
            dias.append({
                "fecha": f.isoformat(), "dia": i, "nombre": DIAS[i],
                "es_hoy": f == h, "futuro": f > h,
                "guardado_at": c.guardado_at.strftime("%H:%M") if c else None,
                "a_tiempo": c.a_tiempo if c else None,
            })
        return {
            "persona": _persona(u),
            "semana": semana.isoformat(),
            "inicio": INICIO.isoformat(),
            "hoy": h.isoformat(),
            "dias": dias,
            "tareas": [_tarea_dict(t) for t in _tareas(username, semana)],
        }


def agregar_tarea(username: str, semana: date, texto: str, tipo: str, dia: int | None = None) -> dict:
    """Una tarea propia para un día de la semana (o abierta en la semana si no lleva día)."""
    texto = (texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Escribí la tarea.")
    if tipo not in ("velocidad", "desplazamiento"):
        raise HTTPException(status_code=400, detail="La tarea es de velocidad o de desplazamiento.")
    if dia is not None and dia not in range(5):
        raise HTTPException(status_code=400, detail="El día va de lunes a viernes.")
    semana = lunes_de(semana)
    if semana + timedelta(days=4) < hoy():
        raise HTTPException(status_code=400, detail="Esa semana ya terminó.")
    with db_session:
        orden = TareaSemana.select(lambda t: t.usuario == username and t.semana == semana).count()
        t = TareaSemana(usuario=username, semana=semana, texto=texto, tipo=tipo, origen="propia",
                        frecuencia="semanal", dia=dia, orden=orden)
        t.flush()  # sin esto el id todavía es None
        return _tarea_dict(t)


def _tarea_propia(username: str, tarea_id: int) -> TareaSemana:
    t = TareaSemana.get(id=tarea_id)
    if t is None or t.usuario != username or t.borrada:
        raise HTTPException(status_code=404, detail="Esa tarea no existe.")
    if t.origen == "rol" and ROL_EN_LA_DAILY:
        raise HTTPException(status_code=400,
                            detail="Las tareas del rol no se borran. Si no aplica, marcalo en la daily con el motivo.")
    return t


def editar_tarea(username: str, tarea_id: int, texto: str | None, tipo: str | None) -> dict:
    with db_session:
        t = _tarea_propia(username, tarea_id)
        if texto is not None:
            if not texto.strip():
                raise HTTPException(status_code=400, detail="Escribí la tarea.")
            t.texto = texto.strip()
        if tipo is not None:
            if tipo not in ("velocidad", "desplazamiento"):
                raise HTTPException(status_code=400, detail="La tarea es de velocidad o de desplazamiento.")
            t.tipo = tipo
        return _tarea_dict(t)


def borrar_tarea(username: str, tarea_id: int) -> None:
    with db_session:
        _tarea_propia(username, tarea_id).borrada = True


def guardar_dia(username: str, fecha: date, marcas: list[dict]) -> dict:
    """Guarda la daily de un día. Todas las tareas que vencían ese día tienen que venir con
    estado, y las que no se hicieron (o no aplican) con motivo.

    Un día que todavía no llegó también se puede marcar, para adelantar: la tarea del
    viernes que se hizo el lunes. Ahí vale solo "hecha" o "no aplica", no hace falta
    marcar todo y no cuenta como la daily de ese día: esa se guarda cuando llega."""
    h = hoy()
    if fecha.weekday() >= 5:
        raise HTTPException(status_code=400, detail="La daily es de lunes a viernes.")
    adelanto = fecha > h
    if adelanto and lunes_de(fecha) > lunes_de(h) + timedelta(days=7):
        raise HTTPException(status_code=400, detail="Solo se adelanta esta semana o la que viene.")
    semana = lunes_de(fecha)
    dia = fecha.weekday()
    por_id = {}
    for m in marcas:
        estado = m.get("estado")
        if estado is not None and estado not in ESTADOS:
            raise HTTPException(status_code=400, detail="Estado inválido.")
        if adelanto and estado == "no":
            raise HTTPException(status_code=400, detail="Ese día todavía no llegó: se puede marcar hecha o que no aplica.")
        por_id[int(m["tarea_id"])] = (estado, (m.get("motivo") or "").strip() or None)
    with db_session:
        _sincronizar_semana(username, semana)
        tareas = {t.id: t for t in _tareas(username, semana)}
        faltan = []
        for t in tareas.values():
            if not _vence(t, dia):
                continue
            estado, motivo = por_id.get(t.id, (None, None))
            if estado is None:
                if not adelanto:
                    faltan.append(t.texto)
            elif estado != "hecha" and not motivo:
                faltan.append(f"{t.texto} (falta el motivo)")
        if faltan:
            raise HTTPException(status_code=400, detail="Falta marcar: " + "; ".join(faltan[:4]) + (" …" if len(faltan) > 4 else ""))
        for tid, (estado, motivo) in por_id.items():
            t = tareas.get(tid)
            if t is None:
                raise HTTPException(status_code=400, detail="Una de las tareas no es de esta semana.")
            if estado and estado != "hecha" and not motivo:
                raise HTTPException(status_code=400, detail=f"«{t.texto}»: falta el motivo.")
            previa = MarcaDaily.get(tarea=t, fecha=fecha)
            if estado is None:
                if previa:
                    previa.delete()
                continue
            if previa:
                previa.estado, previa.motivo, previa.marcado_at = estado, motivo if estado != "hecha" else None, ahora()
            else:
                MarcaDaily(tarea=t, fecha=fecha, estado=estado, motivo=motivo if estado != "hecha" else None,
                           marcado_at=ahora())
        c = CierreDaily.get(usuario=username, fecha=fecha)
        if adelanto:
            pass  # lo adelantado no es la daily de ese día
        elif c is None:
            CierreDaily(usuario=username, fecha=fecha, guardado_at=ahora(), actualizado_at=ahora(), a_tiempo=fecha == h)
        else:
            c.actualizado_at = ahora()
    return ver_semana(username, semana)


# --------------------------------------------------------------- Backbone


def _corte(semana: date) -> int:
    """Hasta qué día de la semana se cuenta: la semana pasada entera, la actual hasta hoy."""
    h = hoy()
    if semana > h or semana < INICIO:
        return -1
    if semana + timedelta(days=4) < h:
        return 4
    return min(h.weekday(), 4)


def _resumen_persona(u: Usuario, semana: date, corte: int) -> dict:
    tareas = _tareas(u.username, semana)
    cierres = _cierres(u.username, semana)
    marcas = {t.id: {m.fecha: m for m in t.marcas} for t in tareas}
    due = done = 0
    faltas, no_aplica = [], []
    for d in range(corte + 1):
        f = semana + timedelta(days=d)
        if f not in cierres:
            faltas.append({"fecha": f.isoformat(), "dia": d, "texto": "No guardó la daily", "motivo": None, "sin_daily": True})
        for t in tareas:
            if not _vence(t, d):
                continue
            m = marcas[t.id].get(f)
            if m and m.estado == "no_aplica":
                no_aplica.append({"fecha": f.isoformat(), "dia": d, "texto": t.texto, "motivo": m.motivo})
                continue
            due += 1
            if m and m.estado == "hecha":
                done += 1
            elif m and m.estado == "no":
                faltas.append({"fecha": f.isoformat(), "dia": d, "texto": t.texto, "motivo": m.motivo, "sin_daily": False})
    for t in tareas:
        if _abierta(t) and t.frecuencia == "semanal":
            hecha = any(m.estado == "hecha" for m in marcas[t.id].values())
            if hecha:
                due += 1
                done += 1
            elif corte == 4:
                due += 1
                faltas.append({"fecha": None, "dia": None, "texto": t.texto, "motivo": "Quedó abierta toda la semana", "sin_daily": False})
    dias = []
    for d in range(5):
        f = semana + timedelta(days=d)
        c = cierres.get(f)
        estado = "futuro" if d > corte else ("ok" if c and c.a_tiempo else "tarde" if c else "falta")
        dias.append({"fecha": f.isoformat(), "estado": estado, "hora": c.guardado_at.strftime("%H:%M") if c else None})
    despl = []
    for t in tareas:
        if t.tipo != "desplazamiento":
            continue
        hecha = next((f for f, m in marcas[t.id].items() if m.estado == "hecha"), None)
        despl.append({"texto": t.texto, "hecha": hecha.isoformat() if hecha else None})
    return {
        **_persona(u),
        "pct": round(done / due * 100) if due else None,
        "dias": dias,
        "faltas": faltas,
        "no_aplica": no_aplica,
        "desplazamiento": despl,
        # La semana entera, tarea por tarea y día por día: es el detalle de Backbone.
        "tareas": [{
            "texto": t.texto, "tipo": t.tipo, "origen": t.origen, "frecuencia": t.frecuencia,
            "dia": t.dia, "destinatario": t.destinatario,
            "marcas": {f.isoformat(): {"estado": m.estado, "motivo": m.motivo} for f, m in marcas[t.id].items()},
        } for t in tareas],
    }


def _entregas(gente: list[Usuario], semana: date, corte: int) -> list[dict]:
    out = []
    for u in gente:
        for t in _tareas(u.username, semana):
            if not t.destinatario:
                continue
            marcas = {m.fecha: m for m in t.marcas}
            if _abierta(t):
                hecha = next((m for m in marcas.values() if m.estado == "hecha"), None)
                estado = "ok" if hecha else ("alert" if corte == 4 else "off")
                nota = "Entregada" if hecha else ("No se entregó en la semana" if corte == 4 else "Abierta en la semana")
            else:
                dias = [d for d in range(corte + 1) if _vence(t, d)]
                due = [d for d in dias if not (marcas.get(semana + timedelta(days=d)) and marcas[semana + timedelta(days=d)].estado == "no_aplica")]
                ok = [d for d in due if marcas.get(semana + timedelta(days=d)) and marcas[semana + timedelta(days=d)].estado == "hecha"]
                if not dias:
                    estado, nota = "off", f"Vence el {DIAS[t.dia]}" if t.dia is not None else "Pendiente"
                elif not due:
                    estado, nota = "off", "No aplicó"
                elif len(ok) == len(due):
                    estado, nota = "ok", "Entregada" if t.frecuencia != "diaria" else f"{len(ok)} de {len(due)} días"
                elif ok:
                    estado, nota = "warn", f"{len(ok)} de {len(due)} días"
                else:
                    m = marcas.get(semana + timedelta(days=due[0]))
                    estado, nota = "alert", (f"No se hizo: {m.motivo}" if m and m.motivo else "Sin marcar en la daily")
            out.append({"id": t.id, "de": u.username, "a": t.destinatario, "texto": t.texto, "estado": estado, "nota": nota})
    return out


def backbone(semana: date | None) -> dict:
    # Sin semana pedida: la que se está trabajando, o la que viene si es fin de semana.
    semana = lunes_de(semana or semana_por_defecto())
    corte = _corte(semana)
    with db_session:
        gente = sorted(Usuario.select(lambda u: u.area is not None), key=lambda u: (u.orden, u.username))
        for u in gente:
            if u.daily:
                _sincronizar_semana(u.username, semana)
    with db_session:
        gente = sorted(Usuario.select(lambda u: u.area is not None), key=lambda u: (u.orden, u.username))
        personas = [_resumen_persona(u, semana, corte) if u.daily else {**_persona(u), "pct": None}
                    for u in gente]
        conDaily = [u for u in gente if u.daily]
        return {
            "semana": semana.isoformat(),
            "hoy": hoy().isoformat(),
            "corte": corte,
            "inicio": INICIO.isoformat(),
            "personas": personas,
            "entregas": _entregas(conDaily, semana, corte),
        }


# --------------------------------------------------------------- Theo


def theo(fecha: date | None) -> dict:
    """Lo que manda Theo a las 23:00. El mensaje lo arma el código: Theo lo copia tal cual."""
    fecha = fecha or hoy()
    if fecha.weekday() >= 5:
        return {"habil": False, "fecha": fecha.isoformat(), "personas": [], "mensaje": None}
    with db_session:
        gente = sorted(Usuario.select(lambda u: u.daily), key=lambda u: (u.orden, u.username))
        hechos = {c.usuario for c in CierreDaily.select(lambda c: c.fecha == fecha)}
        personas = [{"nombre": u.nombre or u.username, "completada": u.username in hechos, "whatsapp": u.whatsapp}
                    for u in gente]
    lineas = [f"{p['nombre']} {'✅' if p['completada'] else '❌'}" for p in personas]
    mensaje = f"Daily completada · {DIAS[fecha.weekday()]} {fecha.strftime('%d/%m')}\n\n" + "\n".join(lineas)
    return {"habil": True, "fecha": fecha.isoformat(), "personas": personas, "mensaje": mensaje}
