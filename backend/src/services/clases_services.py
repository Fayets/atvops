"""
Las clases de Juan: lo que muestra recursos.atvos.io. Una serie es una llamada completa
grabada en Fathom más los playbooks en PDF que salen de ella.

Es un sistema aparte del de los recursos por palabra (`recursos_services`): acá no hay
reels ni comentarios de Instagram, así que lo que se mide es solo lo que pasa en la página.
Esa mezcla era justamente lo que hacía que las métricas no se entendieran.

El link de la llamada y el del playbook nunca viajan en el JSON público: se llega por
/ir, que redirige y de paso cuenta el clic aunque la persona abra en otra pestaña.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, ES_POSTGRES, db
from src.models import ClaseEvento, ClaseRecurso, ClaseSerie, ClasesPagina, ClaseVisita
from src.services.clases_semilla import SERIES as SEMILLA

TIPOS = ("llamada", "playbook")
EVENTOS = ("ver", "abrir")


def _tabla(postgres: str, sqlite: str) -> str:
    return f'"{DB_SCHEMA}"."{postgres}"' if ES_POSTGRES else f'"{sqlite}"'


def _hoy() -> date:
    """El día argentino: el servidor guarda en UTC y a la madrugada eso cambia de fecha."""
    return (datetime.utcnow() - timedelta(hours=3)).date()


def _slug(texto: str, tope: int = 60) -> str:
    sin = unicodedata.normalize("NFD", str(texto or "").lower())
    sin = "".join(c for c in sin if unicodedata.category(c) != "Mn")
    sin = re.sub(r"[^a-z0-9]+", "-", sin).strip("-")
    return sin[:tope] or "recurso"


def _slug_libre(base: str, propio: int | None = None) -> str:
    usados = {r.slug for r in list(ClaseRecurso.select()) if r.id != propio}
    usados |= {s.slug for s in list(ClaseSerie.select())}
    slug = base
    n = 2
    while slug in usados:
        slug = f"{base}-{n}"
        n += 1
    return slug


def _url(valor) -> str:
    url = str(valor or "").strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="El link tiene que empezar con https://")
    return url[:600]


def _texto(valor, tope: int, campo: str) -> str:
    t = " ".join(str(valor or "").split())[:tope]
    if not t:
        raise HTTPException(status_code=422, detail=f"Falta {campo}.")
    return t


def _entero(valor) -> int | None:
    try:
        n = int(valor)
    except (TypeError, ValueError):
        return None
    return n if 0 < n < 10000 else None


# ---------------------------------------------------------------- la página

def _pagina() -> ClasesPagina:
    p = ClasesPagina.get(id=1)
    if p is None:
        p = ClasesPagina(
            id=1,
            bajada="*6 clases completas y 18 playbooks* sobre contenido y marketing: cómo dejar de "
                   "depender de anuncios, armar una marca personal de cero, hacer que las historias "
                   "vendan, leer las métricas y convertir lo que explicás en llamadas en reels. "
                   "Mirá la llamada, bajá el playbook y aplicalo esta semana.",
            nota_llamadas="grabadas en Fathom, sin cortar lo que importa",
            nota_playbooks="tres por clase, con la instalación día por día",
            nota_contenido="de ocho páginas",
            cta_texto="Los playbooks te dan el sistema. Si querés que lo revisemos uno a uno sobre "
                      "tu negocio, escribime por Instagram con la palabra *PLAYBOOK* y te cuento cómo seguimos.",
        )
        db.flush()
    return p


def _pagina_dict(p: ClasesPagina) -> dict:
    return {
        "titulo": p.titulo, "autor": p.autor, "bajada": p.bajada or "",
        "notaLlamadas": p.nota_llamadas or "", "notaPlaybooks": p.nota_playbooks or "",
        "notaContenido": p.nota_contenido or "", "instagram": p.instagram or "",
        "ctaTitulo": p.cta_titulo, "ctaTexto": p.cta_texto or "",
        "actualizadoPor": p.actualizado_por,
    }


def guardar_pagina(datos: dict, quien: str | None) -> dict:
    with db_session:
        p = _pagina()
        if "titulo" in datos:
            p.titulo = _texto(datos.get("titulo"), 80, "el título")
        if "autor" in datos:
            p.autor = " ".join(str(datos.get("autor") or "").split())[:120]
        if "ctaTitulo" in datos:
            p.cta_titulo = _texto(datos.get("ctaTitulo"), 120, "el título del cierre")
        for campo, attr, tope in (("bajada", "bajada", 600), ("notaLlamadas", "nota_llamadas", 160),
                                  ("notaPlaybooks", "nota_playbooks", 160), ("notaContenido", "nota_contenido", 160),
                                  ("ctaTexto", "cta_texto", 600), ("instagram", "instagram", 300)):
            if campo in datos:
                setattr(p, attr, " ".join(str(datos.get(campo) or "").split())[:tope] or None)
        p.actualizado_at = datetime.utcnow()
        p.actualizado_por = quien
        return _pagina_dict(p)


# ---------------------------------------------------------------- lo público

def _recurso_publico(r: ClaseRecurso) -> dict:
    """Sin el link: a la llamada y al playbook se entra por /ir, que cuenta el clic."""
    return {
        "slug": r.slug, "tipo": r.tipo, "orden": r.orden, "titulo": r.titulo,
        "descripcion": r.descripcion or "", "minutos": r.minutos, "paginas": r.paginas,
        "portada": r.portada or None,   # el archivo; la landing sabe de dónde servirlo
    }


def publico() -> dict:
    with db_session:
        p = _pagina_dict(_pagina())
        series = []
        llamadas = playbooks = minutos = 0
        for s in sorted((x for x in list(ClaseSerie.select()) if x.activa), key=lambda x: x.numero):
            items = sorted((r for r in list(s.recursos) if r.activo), key=lambda r: (r.tipo != "llamada", r.orden))
            llamada = next((r for r in items if r.tipo == "llamada"), None)
            pbs = [r for r in items if r.tipo == "playbook"]
            if llamada is None and not pbs:
                continue
            llamadas += 1 if llamada else 0
            playbooks += len(pbs)
            minutos += (llamada.minutos or 0) if llamada else 0
            series.append({
                "slug": s.slug, "numero": s.numero, "titulo": s.titulo,
                "llamada": _recurso_publico(llamada) if llamada else None,
                "playbooks": [_recurso_publico(r) for r in pbs],
            })
        horas = minutos // 60
        return {
            "pagina": p,
            "series": series,
            "totales": {
                "llamadas": llamadas, "playbooks": playbooks, "recursos": llamadas + playbooks,
                "minutos": minutos, "horas": f"{horas}h+" if horas else f"{minutos} min",
            },
        }


def registrar_visita(sesion: str) -> bool:
    sesion = str(sesion or "").strip()[:64]
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", sesion):
        return False
    with db_session:
        hoy = _hoy()
        if ClaseVisita.get(sesion=sesion, dia=hoy) is None:
            ClaseVisita(sesion=sesion, dia=hoy)
        return True


def destino(slug: str, sesion: str) -> str:
    """El link real de una llamada o un playbook, contando el clic."""
    with db_session:
        r = ClaseRecurso.get(slug=str(slug or "").strip()[:80])
        if r is None or not r.activo or not r.serie.activa:
            raise HTTPException(status_code=404, detail="Ese recurso no está disponible.")
        url = r.url
        sesion = str(sesion or "").strip()[:64]
        if re.fullmatch(r"[A-Za-z0-9_-]{8,64}", sesion):
            tipo = "ver" if r.tipo == "llamada" else "abrir"
            hoy = _hoy()
            if ClaseEvento.get(recurso=r, tipo=tipo, sesion=sesion, dia=hoy) is None:
                ClaseEvento(recurso=r, tipo=tipo, sesion=sesion, dia=hoy)
        return url


# ---------------------------------------------------------------- el panel

def _eventos(desde: date) -> list[tuple]:
    """SQL directo: con Pony en 3.13 las comprensiones sobre select() fallan."""
    t = _tabla("clases_eventos", "ClaseEvento")
    return [tuple(f) for f in db.select(f'SELECT "recurso", "tipo", "dia" FROM {t} WHERE "dia" >= $desde')]


def _visitas(desde: date) -> list[tuple]:
    """(día, cuántas). Agrupado en la base: una fila por día en vez de una por persona."""
    t = _tabla("clases_visitas", "ClaseVisita")
    return [tuple(f) for f in db.select(f'SELECT "dia", count(*) FROM {t} WHERE "dia" >= $desde GROUP BY "dia"')]


def _como_fecha(v) -> date:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def _admin(r: ClaseRecurso) -> dict:
    return {
        "id": r.id, "slug": r.slug, "tipo": r.tipo, "orden": r.orden, "titulo": r.titulo,
        "descripcion": r.descripcion or "", "url": r.url, "minutos": r.minutos,
        "paginas": r.paginas, "portada": r.portada, "activo": r.activo,
    }


def listar(dias: int = 30) -> dict:
    """Las series con sus recursos y, por recurso, cuánta gente lo abrió en el período."""
    dias = max(7, min(int(dias or 30), 180))
    hasta = _hoy()
    desde = hasta - timedelta(days=dias - 1)
    fechas = [desde + timedelta(days=i) for i in range(dias)]
    idx = {f: i for i, f in enumerate(fechas)}

    with db_session:
        por_recurso: dict[int, dict] = {}
        for rid, tipo, dia in _eventos(desde):
            d = por_recurso.setdefault(rid, {"ver": 0, "abrir": 0, "serie": [0] * dias})
            d[tipo] = d.get(tipo, 0) + 1
            i = idx.get(_como_fecha(dia))
            if i is not None:
                d["serie"][i] += 1

        serie_visitas = [0] * dias
        for dia, cuantas in _visitas(desde):
            i = idx.get(_como_fecha(dia))
            if i is not None:
                serie_visitas[i] += int(cuantas)

        series = []
        for s in sorted(list(ClaseSerie.select()), key=lambda x: x.numero):
            recursos = []
            for r in sorted(list(s.recursos), key=lambda r: (r.tipo != "llamada", r.orden)):
                c = por_recurso.get(r.id, {"ver": 0, "abrir": 0, "serie": [0] * dias})
                recursos.append({**_admin(r), "clics": c["ver"] + c["abrir"], "serie": c["serie"]})
            series.append({
                "id": s.id, "slug": s.slug, "numero": s.numero, "titulo": s.titulo,
                "activa": s.activa, "recursos": recursos,
                "clics": sum(r["clics"] for r in recursos),
            })

        visitas = sum(serie_visitas)
        clics = sum(r["clics"] for s in series for r in s["recursos"])
        vistas_llamada = sum(r["clics"] for s in series for r in s["recursos"] if r["tipo"] == "llamada")
        return {
            "desde": desde.isoformat(), "hasta": hasta.isoformat(), "dias": dias,
            "pagina": _pagina_dict(_pagina()),
            "series": series,
            "serieVisitas": serie_visitas,
            "totales": {
                "visitas": visitas, "clics": clics,
                "llamadas": vistas_llamada, "playbooks": clics - vistas_llamada,
            },
        }


# ---------------------------------------------------------------- editar

def _serie(serie_id: int) -> ClaseSerie:
    s = ClaseSerie.get(id=serie_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Esa serie no existe.")
    return s


def crear_serie(datos: dict, quien: str | None) -> dict:
    with db_session:
        titulo = _texto(datos.get("titulo"), 160, "el título de la serie")
        numeros = [s.numero for s in list(ClaseSerie.select())]
        numero = _entero(datos.get("numero")) or (max(numeros) + 1 if numeros else 1)
        s = ClaseSerie(slug=_slug_libre(_slug(titulo)), numero=numero, titulo=titulo, actualizado_por=quien)
        db.flush()
        return {"id": s.id, "slug": s.slug, "numero": s.numero, "titulo": s.titulo, "activa": s.activa, "recursos": []}


def editar_serie(serie_id: int, datos: dict, quien: str | None) -> dict:
    with db_session:
        s = _serie(serie_id)
        if "titulo" in datos:
            s.titulo = _texto(datos.get("titulo"), 160, "el título de la serie")
        if "numero" in datos:
            s.numero = _entero(datos.get("numero")) or s.numero
        if "activa" in datos:
            s.activa = bool(datos.get("activa"))
        s.actualizado_at = datetime.utcnow()
        s.actualizado_por = quien
        return {"id": s.id, "slug": s.slug, "numero": s.numero, "titulo": s.titulo, "activa": s.activa}


def borrar_serie(serie_id: int) -> dict:
    with db_session:
        s = _serie(serie_id)
        if list(s.recursos):
            raise HTTPException(status_code=409, detail="Primero sacá los recursos de la serie.")
        s.delete()
        return {"ok": True}


def _recurso(recurso_id: int) -> ClaseRecurso:
    r = ClaseRecurso.get(id=recurso_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Ese recurso no existe.")
    return r


def _orden_libre(serie: ClaseSerie, tipo: str, propio: int | None = None) -> int:
    usados = {r.orden for r in list(serie.recursos) if r.tipo == tipo and r.id != propio}
    n = 1
    while n in usados:
        n += 1
    return n


def crear_recurso(datos: dict, quien: str | None) -> dict:
    with db_session:
        s = _serie(_entero(datos.get("serieId")) or 0)
        tipo = str(datos.get("tipo") or "playbook").strip()
        if tipo not in TIPOS:
            raise HTTPException(status_code=422, detail="El recurso es una llamada o un playbook.")
        if tipo == "llamada" and any(r.tipo == "llamada" for r in list(s.recursos)):
            raise HTTPException(status_code=409, detail="La serie ya tiene su llamada.")
        titulo = _texto(datos.get("titulo"), 200, "el título")
        r = ClaseRecurso(
            slug=_slug_libre(_slug(titulo)), serie=s, tipo=tipo,
            orden=_entero(datos.get("orden")) or _orden_libre(s, tipo),
            titulo=titulo, descripcion=str(datos.get("descripcion") or "").strip()[:1200] or None,
            url=_url(datos.get("url")), minutos=_entero(datos.get("minutos")),
            paginas=_entero(datos.get("paginas")), actualizado_por=quien,
        )
        db.flush()
        return _admin(r)


def editar_recurso(recurso_id: int, datos: dict, quien: str | None) -> dict:
    with db_session:
        r = _recurso(recurso_id)
        if "titulo" in datos:
            r.titulo = _texto(datos.get("titulo"), 200, "el título")
        if "descripcion" in datos:
            r.descripcion = str(datos.get("descripcion") or "").strip()[:1200] or None
        if "url" in datos:
            r.url = _url(datos.get("url"))
        if "minutos" in datos:
            r.minutos = _entero(datos.get("minutos"))
        if "paginas" in datos:
            r.paginas = _entero(datos.get("paginas"))
        if "activo" in datos:
            r.activo = bool(datos.get("activo"))
        if "orden" in datos:
            nuevo = _entero(datos.get("orden"))
            if nuevo and nuevo != r.orden:
                otro = next((x for x in list(r.serie.recursos) if x.tipo == r.tipo and x.orden == nuevo), None)
                if otro is not None:
                    # Se intercambian pasando por un lugar libre: Pony no deja dos con el mismo
                    # orden ni por un instante.
                    viejo, r.orden = r.orden, -1
                    db.flush()
                    otro.orden = viejo
                    db.flush()
                r.orden = nuevo
        if "serieId" in datos:
            s = _serie(_entero(datos.get("serieId")) or 0)
            if s is not r.serie:
                r.serie, r.orden = s, _orden_libre(s, r.tipo)
        r.actualizado_at = datetime.utcnow()
        r.actualizado_por = quien
        return _admin(r)


def borrar_recurso(recurso_id: int) -> dict:
    with db_session:
        r = _recurso(recurso_id)
        for e in list(r.eventos):
            e.delete()
        r.delete()
        return {"ok": True}


def sembrar(quien: str | None = None) -> dict:
    """Carga las series con las que arrancó la página. Solo si todavía no hay ninguna."""
    with db_session:
        if list(ClaseSerie.select()):
            return {"creadas": 0, "motivo": "ya hay series cargadas"}
        creados = 0
        for datos in SEMILLA:
            s = ClaseSerie(slug=_slug_libre(_slug(datos["titulo"])), numero=datos["numero"],
                           titulo=datos["titulo"], actualizado_por=quien)
            db.flush()
            ll = datos["llamada"]
            ClaseRecurso(slug=_slug_libre(_slug(ll["titulo"])), serie=s, tipo="llamada", orden=1,
                         titulo=ll["titulo"], descripcion=ll["descripcion"], url=ll["url"],
                         minutos=ll["minutos"], portada=ll.get("portada"), actualizado_por=quien)
            db.flush()
            creados += 1
            for i, pb in enumerate(datos["playbooks"], start=1):
                ClaseRecurso(slug=_slug_libre(_slug(pb["titulo"])), serie=s, tipo="playbook", orden=i,
                             titulo=pb["titulo"], descripcion=pb["descripcion"], url=pb["url"],
                             portada=pb.get("portada"), actualizado_por=quien)
                db.flush()
                creados += 1
        _pagina()
        return {"creadas": len(SEMILLA), "recursos": creados}
