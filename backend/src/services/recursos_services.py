"""
Recursos de Juan: lo que regala en los reels y cómo le va a cada uno.

Un recurso nace de un reel con palabra ("comentá ONBOARDING"). Uno solo está destacado: es el
que muestra recursos.atvos.io/video, con su video, y ahí marketing elige si se descarga directo
o se pide por WhatsApp. Los demás quedan en la biblioteca y se piden siempre por WhatsApp: el
link del documento solo sale del server cuando el recurso está destacado y es de regalo, así que
por la biblioteca no hay forma de llegar a él.

El recorrido de cada recurso junta dos fuentes:
  - comentarios y chats: los de Instagram que Ops ya cuenta (ChatReel, por reel);
  - visitas, play, cuánto vio, descargas y pedidos: lo que manda la landing (RecursoEvento).
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from urllib.parse import quote

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, ES_POSTGRES, db
from src.models import ChatReel, PublicacionIg, Recurso, RecursoEvento, RecursosAjuste
from src.services.chats_reels_services import normalizar

TIPOS = ("visita", "play", "p25", "p50", "p75", "p100", "descarga", "whatsapp")
ORIGENES = ("landing", "biblioteca")
ENTREGAS = ("regalo", "whatsapp")
_SESION = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _tabla(postgres: str, sqlite: str) -> str:
    return f'"{DB_SCHEMA}"."{postgres}"' if ES_POSTGRES else f'"{sqlite}"'


def _hoy() -> date:
    # El día de Argentina: un evento de las 22 h no tiene que caer en el día siguiente.
    return (datetime.utcnow() - timedelta(hours=3)).date()


def _url(valor) -> str | None:
    v = str(valor or "").strip()
    if not v:
        return None
    if not re.match(r"^https?://", v, re.I):
        v = "https://" + v
    return v[:600]


def youtube_id(url: str | None) -> str | None:
    m = re.search(r"(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/))([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else None


# ------------------------------------------------------------------ ajustes

def _ajuste() -> RecursosAjuste:
    a = RecursosAjuste.get(id=1)
    return a or RecursosAjuste(id=1)


def ajustes() -> dict:
    with db_session:
        a = _ajuste()
        return {"whatsapp": a.whatsapp, "mensaje": a.mensaje}


def guardar_ajustes(datos: dict, quien: str | None) -> dict:
    numero = re.sub(r"\D", "", str(datos.get("whatsapp") or ""))
    if not 10 <= len(numero) <= 15:
        raise HTTPException(status_code=400, detail="El WhatsApp va con código de país y solo números: 5491162626702.")
    mensaje = str(datos.get("mensaje") or "").strip()[:300]
    if "{palabra}" not in mensaje:
        raise HTTPException(status_code=400, detail="El mensaje tiene que incluir {palabra}, así se sabe qué recurso pide.")
    with db_session:
        a = _ajuste()
        a.whatsapp, a.mensaje, a.actualizado_por = numero, mensaje, quien
    return ajustes()


def whatsapp_url(palabra: str) -> str:
    with db_session:
        a = _ajuste()
        texto = a.mensaje.replace("{palabra}", palabra)
        return f"https://wa.me/{a.whatsapp}?text={quote(texto)}"


# ------------------------------------------------------------------ público

def _publico(r: Recurso, con_video: bool) -> dict:
    d = {
        "slug": r.slug, "palabra": r.palabra, "titulo": r.titulo, "titular": r.titular or r.titulo,
        "tema": r.tema, "gancho": r.gancho or r.titulo,
        "youtube": youtube_id(r.video_url),
    }
    if con_video:
        d.update({
            "video": r.video_url, "duracion": r.duracion,
            # Lo que importa en la landing es si se descarga, no adónde: el link no sale.
            "entrega": "regalo" if r.entrega == "regalo" and r.link else "whatsapp",
        })
    return d


def publico() -> dict:
    """Lo que ven la landing y la biblioteca. El destacado primero; nunca el link del documento."""
    with db_session:
        # Del reel más nuevo al más viejo; los que no tienen reel, por cuándo se cargaron.
        fechas = {p.ig_id: p.publicado_at for p in list(PublicacionIg.select()) if p.tipo == "reel"}
        todos = sorted(list(Recurso.select()), key=lambda r: (fechas.get(r.reel_id or "") or r.creado_at, r.id), reverse=True)
        destacado = next((r for r in todos if r.destacado), None)
        lista = [r for r in todos if r.activo and not r.destacado]
        if destacado:
            lista.insert(0, destacado)
        return {
            "destacado": _publico(destacado, True) if destacado else None,
            "recursos": [_publico(r, False) for r in lista],
        }


def registrar(slug: str, tipo: str, origen: str, sesion: str) -> bool:
    """Anota un evento. Devuelve False si ya estaba (misma persona, tipo y día) o si no vale."""
    if tipo not in TIPOS or not _SESION.match(sesion or ""):
        return False
    origen = origen if origen in ORIGENES else "landing"
    with db_session:
        r = Recurso.get(slug=normalizar(slug))
        if r is None:
            return False
        dia = _hoy()
        if RecursoEvento.get(recurso=r, tipo=tipo, sesion=sesion, dia=dia):
            return False
        RecursoEvento(recurso=r, tipo=tipo, origen=origen, sesion=sesion, dia=dia)
    return True


def destino_descarga(slug: str) -> tuple[str, str]:
    """(url, tipo de evento). Solo el destacado de regalo lleva al documento; cualquier otro
    pedido termina en WhatsApp, aunque alguien arme la URL a mano."""
    with db_session:
        r = Recurso.get(slug=normalizar(slug))
        if r is None:
            raise HTTPException(status_code=404, detail="Ese recurso no existe.")
        if r.destacado and r.entrega == "regalo" and r.link:
            return r.link, "descarga"
        palabra = r.palabra
    return whatsapp_url(palabra), "whatsapp"


def destino_whatsapp(slug: str) -> str:
    with db_session:
        r = Recurso.get(slug=normalizar(slug))
        if r is None:
            raise HTTPException(status_code=404, detail="Ese recurso no existe.")
        palabra = r.palabra
    return whatsapp_url(palabra)


# ------------------------------------------------------------------ marketing

def _reel(p: PublicacionIg | None) -> dict | None:
    if p is None:
        return None
    try:
        m = json.loads(p.metricas or "{}")
    except ValueError:
        m = {}
    return {
        "id": p.ig_id, "fecha": p.publicado_at.date().isoformat(), "permalink": p.permalink,
        "caption": (p.caption or "")[:400], "vistas": m.get("views") or m.get("plays"),
        "comentarios": m.get("comments"),
    }


def _admin(r: Recurso) -> dict:
    return {
        "id": r.id, "slug": r.slug, "palabra": r.palabra, "titulo": r.titulo, "titular": r.titular,
        "tema": r.tema, "gancho": r.gancho, "videoUrl": r.video_url, "duracion": r.duracion,
        "entrega": r.entrega, "link": r.link, "reelId": r.reel_id, "destacado": r.destacado,
        "activo": r.activo, "creadoAt": r.creado_at.isoformat(),
        "actualizadoAt": r.actualizado_at.isoformat(), "actualizadoPor": r.actualizado_por,
    }


def _eventos(desde: date) -> list[tuple]:
    """(recurso_id, tipo, origen, dia) desde una fecha. SQL directo: con Pony en 3.13 las
    comprensiones sobre select() fallan, y acá alcanza con columnas sueltas."""
    t = _tabla("recursos_eventos", "RecursoEvento")
    return [tuple(f) for f in db.select(f'SELECT "recurso", "tipo", "origen", "dia" FROM {t} WHERE "dia" >= $desde')]


def _chats(desde: date) -> list[tuple]:
    t = _tabla("chats_reels", "ChatReel")
    desde_dt = datetime.combine(desde, datetime.min.time())
    return [tuple(f) for f in db.select(f'SELECT "reel_id", "at" FROM {t} WHERE "at" >= $desde_dt')]


def _como_fecha(v) -> date:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def _dia_ar(v) -> date:
    """El día argentino de un momento guardado en UTC (Postgres da datetime, SQLite texto)."""
    if not isinstance(v, datetime):
        v = datetime.fromisoformat(str(v)[:19])
    return (v - timedelta(hours=3)).date()


def listar(dias: int = 30) -> dict:
    """Todos los recursos con su recorrido en el período y la serie diaria de chats y visitas."""
    dias = max(7, min(int(dias or 30), 180))
    hasta = _hoy()
    desde = hasta - timedelta(days=dias - 1)
    fechas = [desde + timedelta(days=i) for i in range(dias)]
    idx = {f: i for i, f in enumerate(fechas)}

    with db_session:
        recursos = list(Recurso.select())
        reels = {p.ig_id: p for p in list(PublicacionIg.select()) if p.tipo == "reel"}
        eventos = _eventos(desde)
        chats = _chats(desde)
        totales_chat: dict[str, int] = {}
        for c in list(ChatReel.select()):
            totales_chat[c.reel_id] = totales_chat.get(c.reel_id, 0) + 1

        por_reel: dict[str, list[int]] = {}
        for reel_id, at in chats:
            i = idx.get(_dia_ar(at))
            if i is not None:
                por_reel.setdefault(reel_id, [0] * dias)[i] += 1

        conteo: dict[int, dict] = {}
        for rid, tipo, origen, dia in eventos:
            d = conteo.setdefault(rid, {"tipos": {}, "origen": {}, "visitas": [0] * dias})
            d["tipos"][tipo] = d["tipos"].get(tipo, 0) + 1
            if tipo == "visita":
                d["origen"][origen] = d["origen"].get(origen, 0) + 1
                i = idx.get(_como_fecha(dia))
                if i is not None:
                    d["visitas"][i] += 1

        filas = []
        for r in recursos:
            reel = _reel(reels.get(r.reel_id)) if r.reel_id else None
            serie = por_reel.get(r.reel_id or "", [0] * dias)
            c = conteo.get(r.id, {"tipos": {}, "origen": {}, "visitas": [0] * dias})
            t = c["tipos"]
            filas.append({
                **_admin(r),
                "reel": reel,
                "metricas": {
                    "comentarios": (reel or {}).get("comentarios"),
                    "chatsTotal": totales_chat.get(r.reel_id or "", 0),
                    "chats": sum(serie),
                    "visitas": t.get("visita", 0),
                    "visitasLanding": c["origen"].get("landing", 0),
                    "visitasBiblioteca": c["origen"].get("biblioteca", 0),
                    "play": t.get("play", 0),
                    "p25": t.get("p25", 0), "p50": t.get("p50", 0), "p75": t.get("p75", 0), "p100": t.get("p100", 0),
                    "descargas": t.get("descarga", 0),
                    "whatsapp": t.get("whatsapp", 0),
                },
                "serieChats": serie,
                "serieVisitas": c["visitas"],
            })
        # El destacado arriba; después, del reel más nuevo al más viejo.
        filas.sort(key=lambda f: ((f["reel"] or {}).get("fecha") or f["creadoAt"][:10]), reverse=True)
        filas.sort(key=lambda f: not f["destacado"])

    return {
        "desde": desde.isoformat(), "hasta": hasta.isoformat(), "dias": dias,
        "recursos": filas, "ajustes": ajustes(), "reelsSinRecurso": reels_sin_recurso(),
    }


def reels_sin_recurso() -> list[dict]:
    """Los reels que pidieron una palabra y todavía no tienen recurso cargado."""
    from src.services import chats_reels_services

    estado = chats_reels_services.estado()
    with db_session:
        usados = {r.reel_id for r in list(Recurso.select()) if r.reel_id}
        slugs = {r.slug for r in list(Recurso.select())}
        reels = {p.ig_id: p for p in list(PublicacionIg.select()) if p.tipo == "reel"}
        out = []
        for reel_id, e in estado.items():
            palabra = normalizar(e.get("palabra"))
            if not e.get("esCta") or not palabra or reel_id in usados or palabra in slugs:
                continue
            info = _reel(reels.get(reel_id)) or {"id": reel_id, "fecha": None, "caption": ""}
            out.append({**info, "palabra": palabra, "chats": e.get("chats") or 0})
    out.sort(key=lambda x: x.get("fecha") or "", reverse=True)
    return out


def _titulo_de(caption: str, palabra: str) -> str:
    texto = re.sub(r"\s+", " ", caption or "").strip()
    primera = re.split(r"(?<=[.!?…])\s|\n", texto, maxsplit=1)[0] if texto else ""
    primera = primera.strip(" .")
    if not primera or primera.lower().startswith("no hay descrip"):
        return f"Recurso {palabra.upper()}"
    return (primera[:1].upper() + primera[1:])[:110]


def importar_reels(quien: str | None) -> dict:
    """Crea un recurso por cada reel con palabra que no tenga uno. Título sacado del texto
    del reel; marketing lo ajusta después."""
    nuevos = []
    # Solo los que ya abrieron chats: una palabra entre comillas sin nadie que la comente puede
    # ser una frase citada. Esos se cargan a mano eligiendo el reel.
    for reel in [x for x in reels_sin_recurso() if x["chats"] > 0]:
        palabra = reel["palabra"]
        with db_session:
            if Recurso.get(slug=palabra):
                continue
            r = Recurso(slug=palabra, palabra=palabra.upper(), titulo=_titulo_de(reel.get("caption"), palabra),
                        reel_id=reel["id"], actualizado_por=quien)
            r.flush()
            nuevos.append(r.slug)
    return {"creados": nuevos}


_EDITABLES = {
    "palabra": "palabra", "titulo": "titulo", "titular": "titular", "tema": "tema", "gancho": "gancho",
    "videoUrl": "video_url", "duracion": "duracion", "entrega": "entrega", "link": "link",
    "reelId": "reel_id", "activo": "activo",
}


def _aplicar(r: Recurso, datos: dict) -> None:
    for clave, campo in _EDITABLES.items():
        if clave not in datos:
            continue
        v = datos[clave]
        if campo == "activo":
            setattr(r, campo, bool(v))
        elif campo == "entrega":
            if v not in ENTREGAS:
                raise HTTPException(status_code=400, detail="La entrega es regalo o whatsapp.")
            r.entrega = v
        elif campo in ("video_url", "link"):
            setattr(r, campo, _url(v))
        elif campo == "palabra":
            slug = normalizar(v).replace(" ", "")
            if not slug:
                raise HTTPException(status_code=400, detail="Falta la palabra que se comenta.")
            otro = Recurso.get(slug=slug)
            if otro is not None and otro.id != r.id:
                raise HTTPException(status_code=409, detail=f"Ya hay un recurso con la palabra {slug.upper()}.")
            r.slug, r.palabra = slug, str(v).strip().upper()[:60]
        elif campo == "titulo":
            t = str(v or "").strip()
            if not t:
                raise HTTPException(status_code=400, detail="El recurso necesita un título.")
            r.titulo = t[:200]
        else:
            t = str(v or "").strip()
            setattr(r, campo, t[:300] or None)
    if r.destacado and r.entrega == "regalo" and not r.link:
        raise HTTPException(status_code=400, detail="Para que se descargue directo falta el link del recurso.")


def crear(datos: dict, quien: str | None) -> dict:
    if not str(datos.get("palabra") or "").strip() or not str(datos.get("titulo") or "").strip():
        raise HTTPException(status_code=400, detail="Faltan la palabra y el título.")
    with db_session:
        r = Recurso(slug="__nuevo__", palabra="-", titulo="-", actualizado_por=quien)
        _aplicar(r, datos)
        r.flush()
        return _admin(r)


def editar(recurso_id: int, datos: dict, quien: str | None) -> dict:
    with db_session:
        r = Recurso.get(id=recurso_id)
        if r is None:
            raise HTTPException(status_code=404, detail="Ese recurso no existe.")
        _aplicar(r, datos)
        r.actualizado_at, r.actualizado_por = datetime.utcnow(), quien
        return _admin(r)


def destacar(recurso_id: int, datos: dict, quien: str | None) -> dict:
    """Lo pone en la landing (y saca al anterior, que vuelve a la biblioteca). En el mismo
    paso se pueden guardar video, entrega y link, que es lo que se toca al cambiarlo."""
    with db_session:
        r = Recurso.get(id=recurso_id)
        if r is None:
            raise HTTPException(status_code=404, detail="Ese recurso no existe.")
        for otro in list(Recurso.select()):
            if otro.destacado and otro.id != r.id:
                otro.destacado = False
        r.destacado, r.activo = True, True
        _aplicar(r, datos)
        r.actualizado_at, r.actualizado_por = datetime.utcnow(), quien
        return _admin(r)
