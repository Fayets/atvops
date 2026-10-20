"""
Audiencia: quién comenta los reels y si es un lead calificado.

El recorrido es: se publica un reel → la gente comenta → por cada persona nueva se lee su
perfil → la IA lo compara con el criterio que escribe marketing → queda como
calificado (puntaje 5 o más) o descartado, con el motivo.

Dos límites de Instagram que mandan sobre el diseño:

- **El usuario de quien comenta** solo viene si el token tiene `instagram_manage_comments`.
  Sin ese permiso los comentarios llegan sin nombre y no hay a quién analizar. Mientras
  tanto se pueden cargar usuarios a mano (pegando una lista) y el resto funciona igual.
- **El perfil** sale de Business Discovery, que solo responde por cuentas de empresa o de
  creador. Una cuenta personal no expone bio ni seguidores por la API: se juzga por el
  comentario y el nombre, y queda marcada para que nadie crea que se miró el perfil.

No se entra a los perfiles "como un navegador": eso va contra las condiciones de Meta y
pone en riesgo la cuenta de ATV. Todo pasa por la API oficial.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from fastapi import HTTPException

logger = logging.getLogger("atv_ops.audiencia")
_lock = threading.Lock()

API = "https://graph.facebook.com/v21.0"
MAX_COMENTARIOS = 300    # por reel, para no recorrer miles en una corrida
LOTE_IA = 12             # perfiles por llamada a la IA
CADA_HORAS = 2

CRITERIO_DEFAULT = """ROL
Sos un agente de calificación de leads para ATV, una mentoría de alto ticket (tickets de US$5.000 a US$20.000) para dueños de negocio y emprendedores de marketing en LATAM y España.
Tu trabajo es analizar comentarios de reels y perfiles de Instagram para determinar si la persona es un lead calificado o no. No vendés, no escribís mensajes, no interactuás. Solo analizás y clasificás.

CRITERIOS DE CALIFICACIÓN
Analizá 4 dimensiones y puntuá cada una de 0 a 10. Solo tres suman al puntaje.

1. SEÑALES DE NEGOCIO (peso 45%)
Buscá en bio, nombre, categoría de cuenta y posts:
- Dueño de negocio, emprendedor, fundador, CEO, director
- Coach, consultor, mentor, agencia
- Palabras como "escalo", "facturo", "mi empresa", "mi marca", "clientes"
- Categoría de cuenta tipo "Emprendedor", "Business", "Marketing"
Puntaje alto (8-10): bio claramente de dueño de negocio o profesional establecido.
Puntaje medio (4-7): señales ambiguas, menciona trabajar pero no está claro qué.
Puntaje bajo (0-3): estudiante, empleado buscando trabajo, sin señales de negocio.

2. CAPACIDAD FINANCIERA (peso 40%)
Buscá señales indirectas de poder adquisitivo:
- Menciona facturación, resultados de negocio, clientes
- Contenido profesional de calidad (no cuenta personal sin rumbo)
- Seguidores coherentes con un operador real (más de 500 suele ser señal positiva, pero no descartes por debajo)
- Link en bio a negocio propio, web, calendario
Puntaje alto (8-10): señales claras de negocio activo con ingresos.
Puntaje medio (4-7): parece tener actividad pero sin señales claras de dinero.
Puntaje bajo (0-3): cuenta personal, sin actividad, señales de apuro económico ("busco trabajo", "necesito plata").
IMPORTANTE: nunca califiques por apariencia física, género, edad aparente ni país. Solo señales de negocio y capacidad.

3. INTENCIÓN EN EL COMENTARIO (no puntúa)
Los reels tienen un CTA: casi todos comentan la palabra que dispara el bot, así que la intención no suma ni resta. Puntuala igual, pero usá el comentario sobre todo para las reglas de descarte automático.
Analizá el texto del comentario:
- Pregunta específica sobre el tema del reel (alta intención)
- Pide el recurso o más información (alta intención)
- Comentario genérico tipo "buen video", "🔥", "gracias" (baja intención)
- Comentario de spam, venta propia, o promoción de otro servicio (descalifica directo)
Puntaje alto (8-10): pregunta algo concreto o pide el recurso.
Puntaje medio (4-7): comenta pero sin intención clara.
Puntaje bajo (0-3): genérico, emoji solo, o spam.

4. COHERENCIA CON EL AVATAR (peso 15%)
El avatar de ATV es: dueños de negocio de marketing, coaching, consultoría o servicios digitales en países hispanohablantes (Argentina, Chile, Uruguay, Paraguay, Colombia, España, México, Perú).
Puntaje alto (8-10): encaja directo con el avatar.
Puntaje medio (4-7): nicho cercano pero no exacto.
Puntaje bajo (0-3): nicho sin relación (ej: gastronomía local, moda, gaming).

REGLAS DE DESCALIFICACIÓN AUTOMÁTICA
Si se cumple cualquiera de estas, el veredicto es DESCARTADO sin importar el puntaje:
- El comentario es spam o promociona otro servicio/producto
- La cuenta es claramente un bot (sin posts, seguidores raros, bio vacía)
- El comentario pide algo fuera de contexto (ej: "seguidme", "mirá mi perfil")
Que la persona tenga una mentoría, agencia o servicio parecido al de ATV NO descalifica: es alguien que ya vende en el nicho. Si lo detectás, anotalo como señal, no como red flag.

CÁLCULO DEL PUNTAJE FINAL
puntaje_final = (negocio × 0.45) + (financiero × 0.40) + (avatar × 0.15)

VEREDICTOS
- CALIFICADO: puntaje_final ≥ 7.0 y sin descarte automático
- DESCARTADO: puntaje_final < 7.0 o descarte automático

REGLAS FINALES
- Si falta información del perfil (bio vacía, sin posts), bajá las dimensiones de negocio y financiero, no inventes datos.
- La intención sola no califica: decide el perfil.
- Sé estricto con CALIFICADO: un calificado falso le hace perder tiempo al setter.
- Escribí la razón siempre en español, en tono neutro y operativo, sin emojis."""


# ------------------------------------------------------------------ Instagram

def _credenciales() -> tuple[str, str]:
    from src.services import instagram_services

    cred = instagram_services._credenciales()
    if not cred:
        raise HTTPException(status_code=503, detail="Falta conectar Instagram en Sistema → Claves API.")
    return cred


_HOST_GRAPH = re.compile(r"^https://graph\.(facebook|instagram)\.com/v[\d.]+/")


def _ruta_siguiente(url_siguiente: str) -> str:
    """La ruta de la página siguiente, sin host ni versión.

    Instagram la devuelve con su propia versión (v25.0) aunque se haya pedido con otra: si
    se recorta solo la versión de Ops, la ruta queda rota y la paginación se corta en la
    primera página sin avisar. Pasó con reels de 150 comentarios que daban 1 o 2."""
    return _HOST_GRAPH.sub("", url_siguiente).split("?")[0]


def _pedir(token: str, path: str, **params) -> dict:
    params["access_token"] = token
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=25) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        cuerpo = e.read().decode(errors="replace")[:300] if e.fp else str(e)
        return {"_error": cuerpo, "_codigo": e.code}
    except Exception as e:  # noqa: BLE001
        return {"_error": str(e)[:200]}


_permisos_cache: dict = {}


def permisos() -> dict:
    """Qué puede hacer hoy el token: leer comentarios con usuario y leer perfiles.

    Se guarda una hora: los permisos no cambian solos y cada consulta gasta cupo de la API.
    Si Instagram no contesta (límite de pedidos, caída) se devuelve `comentarios: None`,
    que quiere decir "no se sabe", y no `False`: un error pasajero no es un permiso que
    falta, y mostrarlo como tal mandaba a reconectar Instagram sin motivo."""
    guardado = _permisos_cache.get("v")
    if guardado and (datetime.utcnow() - guardado["at"]).total_seconds() < 3600:
        return guardado["data"]
    token, _uid = _credenciales()
    r = _pedir(token, "me/permissions")
    if r.get("_error"):
        previo = (guardado or {}).get("data")
        return {**(previo or {"comentarios": None, "perfiles": None}), "aviso": "Instagram no contestó: puede ser el límite de pedidos por hora."}
    otorgados = {p.get("permission") for p in (r.get("data") or []) if p.get("status") == "granted"}
    data = {
        "comentarios": "instagram_manage_comments" in otorgados,
        "perfiles": "instagram_basic" in otorgados,
        "otorgados": sorted(otorgados),
    }
    _permisos_cache["v"] = {"at": datetime.utcnow(), "data": data}
    return data


def _usuario_limpio(texto: str) -> str:
    t = str(texto or "").strip()
    t = re.sub(r"^https?://(www\.)?instagram\.com/", "", t).split("?")[0].strip("/ ")
    return t.lstrip("@").strip().lower()


class LimiteInstagram(Exception):
    """Instagram no contestó por un motivo pasajero (límite de pedidos, caída)."""


def _es_personal(r: dict) -> bool:
    try:
        err = json.loads(r.get("_error") or "{}").get("error") or {}
    except ValueError:
        return False
    return err.get("code") == 110 or err.get("error_subcode") == 2207013


def leer_perfil(token: str, uid: str, usuario: str) -> tuple[str, dict]:
    """El perfil público por Business Discovery. Devuelve (tipo_cuenta, perfil)."""
    campos = ("username,name,biography,followers_count,follows_count,media_count,website,profile_picture_url,"
              "media.limit(6){caption,media_product_type,timestamp,like_count,comments_count}")
    r = _pedir(token, uid, fields=f"business_discovery.username({usuario}){{{campos}}}")
    bd = r.get("business_discovery")
    if not bd:
        # Solo "usuario no encontrado" (110 / 2207013) quiere decir cuenta personal o
        # privada. Cualquier otro error —sobre todo el límite de pedidos de Meta, código
        # 4— es pasajero: marcarlo como personal lo dejaba así para siempre.
        if _es_personal(r):
            return "personal", {}
        raise LimiteInstagram(str(r.get("_error") or "sin respuesta")[:200])
    posts = [{"caption": (m.get("caption") or "")[:280], "tipo": m.get("media_product_type"),
              "fecha": (m.get("timestamp") or "")[:10], "likes": m.get("like_count"),
              "comentarios": m.get("comments_count")}
             for m in (bd.get("media") or {}).get("data") or []]
    return "empresa", {
        "foto": _guardar_foto(bd.get("profile_picture_url"), usuario),
        "nombre": bd.get("name"), "bio": bd.get("biography"), "web": bd.get("website"),
        "seguidores": bd.get("followers_count"), "seguidos": bd.get("follows_count"),
        "publicaciones": bd.get("media_count"), "posts": posts,
    }


def _guardar_foto(url: str | None, usuario: str) -> str | None:
    """Baja la foto de perfil y devuelve la ruta pública. El link de Instagram vence a
    los pocos días, así que se guarda en el servidor como las miniaturas de los reels."""
    from src.services.instagram_services import FOTOS

    if not url:
        return None
    nombre = re.sub(r"[^a-z0-9._]", "", usuario.lower()) or "perfil"
    destino = FOTOS / "perfiles" / f"{nombre}.jpg"
    try:
        destino.parent.mkdir(parents=True, exist_ok=True)
        pedido = urllib.request.Request(url, headers={"User-Agent": "atv-ops"})
        with urllib.request.urlopen(pedido, timeout=20) as r:
            datos = r.read()
        if not datos:
            return None
        destino.write_bytes(datos)
        return f"/uploads/ig/perfiles/{nombre}.jpg"
    except Exception as e:  # noqa: BLE001
        logger.info("Audiencia: no se pudo bajar la foto de %s: %s", usuario, str(e)[:120])
        return None


def completar_fotos(limite: int = 40) -> int:
    """Los perfiles leídos antes de que se guardara la foto: se les vuelve a pedir solo eso."""
    from pony.orm import db_session

    from src.models import LeadAudiencia

    token, uid = _credenciales()
    with db_session:
        faltan = [(x.id, x.ig_usuario) for x in list(LeadAudiencia.select())
                  if x.tipo_cuenta == "empresa" and x.perfil and '"foto"' not in x.perfil][:limite]
    hechos = 0
    for lid, usuario in faltan:
        r = _pedir(token, uid, fields=f"business_discovery.username({usuario}){{profile_picture_url}}")
        if not r.get("business_discovery") and not _es_personal(r):
            break
        foto = _guardar_foto((r.get("business_discovery") or {}).get("profile_picture_url"), usuario)
        with db_session:
            x = LeadAudiencia.get(id=lid)
            perfil = json.loads(x.perfil or "{}")
            perfil["foto"] = foto
            x.perfil = json.dumps(perfil, ensure_ascii=False)
        hechos += 1
    return hechos


# ------------------------------------------------------------------ criterio

def criterio() -> dict:
    from pony.orm import db_session

    from src.models import AjusteAudiencia

    with db_session:
        a = AjusteAudiencia.get(clave="criterio")
        return {"texto": (a.valor if a and a.valor else CRITERIO_DEFAULT),
                "esDefault": not (a and a.valor),
                "actualizadoPor": a.actualizado_por if a else None,
                "actualizadoAt": a.actualizado_at.isoformat() if a and a.actualizado_at else None}


def guardar_criterio(texto: str, usuario: dict) -> dict:
    from pony.orm import db_session

    from src.models import AjusteAudiencia

    texto = (texto or "").strip()
    if len(texto) < 20:
        raise HTTPException(status_code=400, detail="El criterio es muy corto: describí qué es un lead calificado.")
    with db_session:
        a = AjusteAudiencia.get(clave="criterio") or AjusteAudiencia(clave="criterio")
        a.valor = texto[:6000]
        a.actualizado_por = usuario.get("username")
        a.actualizado_at = datetime.utcnow()
    return criterio()


# ------------------------------------------------------------------ sincronizar

def _cuenta_propia(token: str, uid: str) -> str:
    return (_pedir(token, uid, fields="username").get("username") or "").lower()


# ------------------------------------------------------------------ reels seguidos
#
# Analizar la audiencia de un reel es una decisión de marketing, no algo automático: se toca
# "Analizar audiencia" en un reel y desde ese momento queda seguido para siempre. La corrida de
# cada dos horas recorre los reels seguidos, de cualquier fecha (un lead que comenta en
# diciembre un reel de octubre también entra), y solo relee los que sumaron comentarios.
# Se guarda en ajustes_audiencia, una fila por reel: clave "seguir:<id>", valor JSON
# {desde, por, visto} (visto = cuántos comentarios marcaba la última vez que se leyó).

SEGUIR = "seguir:"


def reels_seguidos() -> dict[str, dict]:
    from pony.orm import db_session

    from src.models import AjusteAudiencia

    with db_session:
        filas = [(a.clave, a.valor) for a in list(AjusteAudiencia.select()) if a.clave.startswith(SEGUIR)]
    salida = {}
    for clave, valor in filas:
        try:
            datos = json.loads(valor or "{}")
        except ValueError:
            datos = {}
        salida[clave[len(SEGUIR):]] = datos
    return salida


def seguir_reel(media_id: str, por: str | None = None, visto: int | None = None) -> None:
    from pony.orm import db_session

    from src.models import AjusteAudiencia

    with db_session:
        fila = AjusteAudiencia.get(clave=f"{SEGUIR}{media_id}") or AjusteAudiencia(clave=f"{SEGUIR}{media_id}")
        try:
            datos = json.loads(fila.valor or "{}")
        except ValueError:
            datos = {}
        datos.setdefault("desde", datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S"))
        if por and not datos.get("por"):
            datos["por"] = por
        if visto is not None:
            datos["visto"] = int(visto)
        fila.valor = json.dumps(datos)
        fila.actualizado_at = datetime.utcnow()
        fila.actualizado_por = por or fila.actualizado_por


def sincronizar_comentarios() -> dict:
    """Los comentarios nuevos de los reels seguidos: un lead por persona nueva."""
    seguidos = reels_seguidos()
    if not seguidos:
        return {"reels": 0, "leidos": 0, "nuevos": 0, "sinUsuario": 0}
    token, uid = _credenciales()
    propia = _cuenta_propia(token, uid)
    ids = list(seguidos)
    nuevos = sin_usuario = leidos = 0
    # Un pedido por cada 50 reels (?ids=): saber cuántos comentarios tiene cada uno cuesta poco.
    for i in range(0, len(ids), 50):
        r = _pedir(token, "", ids=",".join(ids[i:i + 50]),
                   fields="id,caption,permalink,timestamp,comments_count")
        for mid, m in (r or {}).items():
            if not isinstance(m, dict) or mid.startswith("_"):
                continue
            total = int(m.get("comments_count") or 0)
            if total == int(seguidos.get(mid, {}).get("visto", -1)):
                continue   # sin comentarios nuevos desde la última lectura
            n, s_u = _comentarios_de_reel(token, propia, m)
            nuevos += n
            sin_usuario += s_u
            leidos += 1
            seguir_reel(mid, visto=total)
    return {"reels": len(ids), "leidos": leidos, "nuevos": nuevos, "sinUsuario": sin_usuario}


def _comentarios_de_reel(token: str, propia: str, m: dict) -> tuple[int, int]:
    """Crea un lead por cada persona nueva que comentó el reel `m`. Devuelve (nuevos, sin usuario)."""
    from pony.orm import db_session

    from src.models import LeadAudiencia

    nuevos = sin_usuario = 0
    if not m.get("comments_count"):
        return 0, 0
    url = f"{m['id']}/comments"
    params = {"fields": "id,text,username,timestamp", "limit": 50}
    leidos = 0

    def anotar(c: dict) -> None:
        nonlocal nuevos, sin_usuario
        usuario = _usuario_limpio(c.get("username") or "")
        if not usuario:
            sin_usuario += 1
            return
        if usuario == propia:
            return
        with db_session:
            if LeadAudiencia.get(comentario_id=c["id"]):
                return
            # Una persona que comentó varios reels es un solo lead: se suma el
            # comentario al que ya existe en vez de duplicarla.
            previo = next((x for x in list(LeadAudiencia.select()) if x.ig_usuario == usuario), None)
            if previo:
                return
            LeadAudiencia(
                ig_usuario=usuario, media_id=m["id"], reel_caption=(m.get("caption") or "")[:300],
                reel_url=m.get("permalink"), comentario=(c.get("text") or "")[:1000],
                comentado_at=_fecha(c.get("timestamp")), comentario_id=c["id"], creado_por="instagram",
            )
            nuevos += 1

    while url and leidos < MAX_COMENTARIOS:
        r = _pedir(token, url, **params)
        filas = r.get("data") or []
        for c in filas:
            leidos += 1
            anotar(c)
        siguiente = (r.get("paging") or {}).get("next")
        if not siguiente:
            break
        url, params = _ruta_siguiente(siguiente).split("?")[0], dict(urllib.parse.parse_qsl(siguiente.split("?", 1)[1]))
        params.pop("access_token", None)
    # Lo que Meta avisó por webhook en el momento: la única fuente completa.
    from src.services import apify_services, comentarios_ig_services

    recibidos = comentarios_ig_services.del_reel(str(m["id"]))
    for c in recibidos:
        anotar(c)
    # La API de Instagram entrega una parte de los comentarios (en algunos reels, ninguno).
    # Si se quedó corta y el webhook tampoco cubre, el resto se lee con Apify.
    if apify_services.hace_falta(leidos + len(recibidos), m.get("comments_count")):
        for c in apify_services.comentarios(str(m["id"]), m.get("permalink"), m.get("comments_count")):
            anotar(c)
    return nuevos, sin_usuario


def analizar_reel(media_id: str, por: str | None = None) -> dict:
    """Empieza a seguir un reel (de cualquier fecha) y lo analiza en el momento: trae a todos los
    que comentaron, lee sus perfiles y los pasa por la IA. Desde ahí lo sigue la corrida de
    cada dos horas con cada comentario nuevo."""
    if not str(media_id).isdigit():
        raise HTTPException(status_code=400, detail="Id de reel inválido.")
    seguir_reel(str(media_id), por=por)
    if not _lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay un análisis corriendo. Esperá a que termine.")
    try:
        token, uid = _credenciales()
        propia = _cuenta_propia(token, uid)
        m = _pedir(token, str(media_id), fields="id,caption,permalink,timestamp,comments_count")
        nuevos, sin_usuario = _comentarios_de_reel(token, propia, m)
        seguir_reel(str(media_id), visto=int(m.get("comments_count") or 0))
        try:
            from src.services import chats_reels_services

            chats_reels_services.sincronizar_reel(str(media_id), m.get("caption"))
        except Exception as e:  # noqa: BLE001
            logger.warning("Chats del reel %s: %s", media_id, str(e)[:160])
        perfiles = ia = 0
        # Hasta terminar con este reel (con tope, por si Instagram o la IA se traban).
        for _ in range(5):
            p = completar_perfiles(limite=60)
            r = analizar(limite=60)
            perfiles += p if isinstance(p, int) else 0
            hechos = r.get("analizados", 0) if isinstance(r, dict) else 0
            ia += hechos
            if not hechos and not p:
                break
        resultado = {"reel": media_id, "nuevos": nuevos, "sinUsuario": sin_usuario, "perfiles": perfiles, "ia": ia}
        logger.info("Audiencia, reel a mano: %s", resultado)
        return resultado
    finally:
        _lock.release()


# ------------------------------------------------------------------ respuestas a historias
#
# Quien responde una historia le escribe a la cuenta por mensaje directo. Instagram los
# entrega por la página de Facebook vinculada (conversaciones de la bandeja), con el usuario
# de quien escribió y el id de la historia que respondió: el mismo `ig_id` que Ops ya guarda
# de cada pieza. Para leerlos hace falta el token de la página, que sale del token de la
# cuenta (permiso instagram_manage_messages, que ya tiene).

DM_POR_PEDIDO = 10        # conversaciones por pedido; con más, Instagram suele pedir "menos datos"
MAX_PEDIDOS_DM = 80       # tope por corrida (~800 conversaciones: un día de CTA entra entero)
DIAS_DM = 3               # la primera vez se mira hasta acá; después, solo lo nuevo desde la última lectura
_pagina_cache: dict = {}


def _pagina(token: str) -> tuple[str, str]:
    """(id de la página, token de la página), guardado una hora."""
    guardado = _pagina_cache.get("v")
    if guardado and (datetime.utcnow() - guardado["at"]).total_seconds() < 3600:
        return guardado["data"]
    # El token tiene permiso sobre una sola página: es la que figura en sus permisos.
    datos = _pedir(token, "debug_token", input_token=token).get("data") or {}
    page_id = next((g["target_ids"][0] for g in datos.get("granular_scopes") or []
                    if g.get("scope") == "pages_show_list" and g.get("target_ids")), None)
    if not page_id:
        cuentas = _pedir(token, "me/accounts", fields="id").get("data") or []
        page_id = cuentas[0]["id"] if cuentas else None
    pagina = _pedir(token, page_id, fields="access_token") if page_id else {}
    if not pagina.get("access_token"):
        raise HTTPException(status_code=503, detail="No se pudo leer la página de Facebook de Instagram para ver los mensajes.")
    data = (page_id, pagina["access_token"])
    _pagina_cache["v"] = {"at": datetime.utcnow(), "data": data}
    return data


def _historias_guardadas(dias: int) -> dict[str, dict]:
    """ig_id → la pieza de historia guardada en Ops (con su día de secuencia)."""
    from pony.orm import db_session

    from src.models import PublicacionIg

    desde = datetime.utcnow() - timedelta(days=dias)
    with db_session:
        return {p.ig_id: {"caption": (p.caption or "")[:300], "url": p.permalink, "dia": p.publicado_at.strftime("%Y-%m-%d")}
                for p in list(PublicacionIg.select())
                if p.tipo == "historia" and p.publicado_at and p.publicado_at >= desde}


def _guardar_historias_vivas(token: str, uid: str) -> int:
    """Las historias que están publicadas ahora y Ops todavía no guardó.

    La sincronización de Instagram corre cada 3 horas (y al arrancar tarda minutos): sin esto,
    las respuestas a una secuencia recién subida se leían antes de que su historia estuviera
    guardada, no tenían con qué cruzarse y se descartaban."""
    from pony.orm import db_session

    from src.models import PublicacionIg
    from src.services import instagram_services

    vivas = _pedir(token, f"{uid}/stories", fields="id,media_type,timestamp,permalink,media_url,thumbnail_url").get("data") or []
    with db_session:
        guardadas = {p.ig_id for p in list(PublicacionIg.select()) if p.tipo == "historia"}
    nuevas = 0
    for h in vivas:
        if h.get("id") and h["id"] not in guardadas:
            instagram_services._guardar("historia", h, instagram_services._insights(token, h["id"], instagram_services.METRICAS_HISTORIA))
            nuevas += 1
    return nuevas


def sincronizar_historias(dias: int = DIAS_DM) -> dict:
    """Las respuestas a historias que llegaron por mensaje directo: un lead por persona nueva.

    Se recorre la bandeja desde lo más nuevo hasta la última lectura (con 6 horas de margen,
    porque la historia puede guardarse en Ops después de que alguien la respondió)."""
    from pony.orm import db_session

    from src.models import AjusteAudiencia, LeadAudiencia

    token, uid = _credenciales()
    propia = _cuenta_propia(token, uid)
    page_id, token_pagina = _pagina(token)
    _guardar_historias_vivas(token, uid)
    historias = _historias_guardadas(max(dias, 7))
    ahora = datetime.utcnow()
    with db_session:
        marca = AjusteAudiencia.get(clave="dm_leido_hasta")
        leido = _fecha(marca.valor) if marca and marca.valor else None
    desde = max(ahora - timedelta(days=dias), (leido - timedelta(hours=6)) if leido else ahora - timedelta(days=dias))
    desde_iso = desde.strftime("%Y-%m-%dT%H:%M:%S")
    with db_session:
        todos = list(LeadAudiencia.select())
        # Una persona aparece una vez por secuencia que respondió (aunque ya sea lead por un reel u
        # otra secuencia): es lo que marketing quiere ver de cada secuencia.
        conocidos = {(x.ig_usuario, historias.get(x.media_id, {}).get("dia")) for x in todos if x.creado_por == "historia"}
        # Si ya está analizada por otro lado, se copia el análisis en vez de pagarlo de nuevo.
        analizados = {}
        for x in sorted(todos, key=lambda x: x.analizado_at or datetime.min):
            if x.perfil_at is not None:
                analizados[x.ig_usuario] = x.id
    nuevos = respuestas = conversaciones = pedidos = 0
    mas_vieja = None
    despues, por_pedido, completo = None, DM_POR_PEDIDO, False
    while pedidos < MAX_PEDIDOS_DM:
        params = {"platform": "instagram", "limit": por_pedido,
                  "fields": "updated_time,messages.limit(15){id,created_time,from,story}"}
        if despues:
            params["after"] = despues
        r = _pedir(token_pagina, f"{page_id}/conversations", **params)
        pedidos += 1
        if r.get("_error"):
            # "Pedí menos datos": se reintenta con menos conversaciones por pedido.
            if '"code":1,' in r["_error"].replace(" ", "") and por_pedido > 5:
                por_pedido = max(5, por_pedido // 2)
                continue
            logger.info("Audiencia: mensajes: %s", r["_error"][:200])
            break
        filas = r.get("data") or []
        for cv in filas:
            conversaciones += 1
            mas_vieja = cv.get("updated_time") or mas_vieja
            for m in (cv.get("messages") or {}).get("data") or []:
                historia = ((m.get("story") or {}).get("reply_to") or {}).get("id")
                if not historia or historia not in historias:
                    continue
                respuestas += 1
                de = m.get("from") or {}
                usuario = _usuario_limpio(de.get("username") or "")
                h = historias[historia]
                if not usuario or usuario == propia or (usuario, h["dia"]) in conocidos:
                    continue
                with db_session:
                    if LeadAudiencia.get(comentario_id=f"dm:{m['id']}"):
                        continue
                    nuevo = LeadAudiencia(
                        ig_usuario=usuario, media_id=historia, reel_caption=h["caption"], reel_url=h["url"],
                        # Sin el texto: de los mensajes directos no se guarda lo que dicen (política de
                        # privacidad, igual que en instagram_mensajes_services). Alcanza con quién y cuándo.
                        comentario=None, comentado_at=_fecha(m.get("created_time")),
                        comentario_id=f"dm:{m['id']}", creado_por="historia",
                        # El id de Instagram de quien escribió: con él se lee su perfil por mensajes,
                        # que trae foto, seguidores y verificado también de las cuentas personales.
                        perfil=json.dumps({"igsid": de.get("id")}),
                    )
                    previo = LeadAudiencia.get(id=analizados[usuario]) if usuario in analizados else None
                    if previo is not None:
                        perfil_previo = json.loads(previo.perfil or "{}")
                        nuevo.set(tipo_cuenta=previo.tipo_cuenta, perfil_at=previo.perfil_at, veredicto=previo.veredicto,
                                  puntaje=previo.puntaje, motivo=previo.motivo, analisis=previo.analisis,
                                  analizado_at=previo.analizado_at,
                                  perfil=json.dumps({**perfil_previo, "igsid": de.get("id")}, ensure_ascii=False))
                conocidos.add((usuario, h["dia"]))
                nuevos += 1
        despues = ((r.get("paging") or {}).get("cursors") or {}).get("after")
        if not filas or not despues or (filas[-1].get("updated_time") or "") < desde_iso:
            completo = True
            break
    # Hasta dónde quedó leído: todo si se llegó a la lectura anterior; si se cortó por el tope,
    # hasta la conversación más vieja que se alcanzó (más atrás de eso no se puede retomar:
    # la bandeja se recorre siempre desde lo más nuevo).
    hasta = ahora if completo else _fecha(mas_vieja)
    if hasta:
        with db_session:
            marca = AjusteAudiencia.get(clave="dm_leido_hasta") or AjusteAudiencia(clave="dm_leido_hasta")
            marca.valor = hasta.strftime("%Y-%m-%dT%H:%M:%S")
            marca.actualizado_at = ahora
    return {"conversaciones": conversaciones, "respuestas": respuestas, "nuevos": nuevos, "pedidos": pedidos, "completo": completo}


def perfil_por_mensajes(token_pagina: str, igsid: str, usuario: str) -> dict:
    """Lo que Instagram muestra de quien escribió por mensaje directo (sirve para cuentas personales)."""
    r = _pedir(token_pagina, igsid, fields="name,username,profile_pic,follower_count,is_verified_user,is_user_follow_business")
    if r.get("_error"):
        if any(c in r["_error"].replace(" ", "") for c in ('"code":4,', '"code":32,', '"code":613,')):
            raise LimiteInstagram(r["_error"][:200])
        return {}
    return {
        "foto": _guardar_foto(r.get("profile_pic"), usuario), "nombre": r.get("name"),
        "seguidores": r.get("follower_count"), "verificado": bool(r.get("is_verified_user")),
        "teSigue": r.get("is_user_follow_business"),
    }


def _fecha(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None


def cargar_a_mano(texto: str, usuario: dict, reel: dict | None = None) -> dict:
    """Usuarios pegados a mano (uno por línea, con o sin @, o links de perfil). Con `reel`
    (id, caption, permalink) quedan atados a ese reel, como si los hubiera traído la API."""
    from pony.orm import db_session

    from src.models import LeadAudiencia

    usuarios = []
    for parte in re.split(r"[\s,;]+", texto or ""):
        u = _usuario_limpio(parte)
        if u and re.fullmatch(r"[a-z0-9._]{1,30}", u) and u not in usuarios:
            usuarios.append(u)
    if not usuarios:
        raise HTTPException(status_code=400, detail="No encontré usuarios de Instagram en lo que pegaste.")
    nuevos = 0
    with db_session:
        existentes = {x.ig_usuario for x in list(LeadAudiencia.select())}
        for u in usuarios[:200]:
            if u in existentes:
                continue
            if reel:
                LeadAudiencia(ig_usuario=u, creado_por="instagram", media_id=str(reel["id"]),
                              reel_caption=(reel.get("caption") or "")[:300], reel_url=reel.get("permalink"),
                              comentario_id=f"mano:{reel['id']}:{u}")
            else:
                LeadAudiencia(ig_usuario=u, creado_por=usuario.get("username"))
            nuevos += 1
    return {"recibidos": len(usuarios), "nuevos": nuevos, "usuarios": usuarios[:200]}


MAX_A_MANO = 12   # cuántos se analizan en el momento; el resto queda para la corrida automática


def analizar_a_mano(texto: str, usuario: dict, media_id: str | None = None) -> dict:
    """Pegar usuarios y ver el análisis enseguida: se lee el perfil de cada uno y se pasa
    por la IA en el momento, sin esperar la corrida automática (que además arranca por
    los más viejos y podía no llegar a estos)."""
    from pony.orm import db_session

    from src.models import LeadAudiencia

    token, uid = _credenciales()
    reel = None
    if media_id:
        # Los pegados quedan atados al reel, y el reel queda seguido: lo que la API sí devuelva
        # después (comentarios nuevos) entra solo.
        reel = _pedir(token, str(media_id), fields="id,caption,permalink")
        if reel.get("_error") or not reel.get("id"):
            raise HTTPException(status_code=404, detail="Ese reel no está en Instagram.")
        seguir_reel(str(media_id), por=usuario.get("username"))
    r = cargar_a_mano(texto, usuario, reel)
    ahora = r["usuarios"][:MAX_A_MANO]
    with db_session:
        ids = [x.id for x in list(LeadAudiencia.select()) if x.ig_usuario in set(ahora)]
        sin_perfil = [(x.id, x.ig_usuario) for x in list(LeadAudiencia.select()) if x.id in set(ids) and x.perfil_at is None]
    limite = None
    for lid, u in sin_perfil:
        try:
            tipo, perfil = leer_perfil(token, uid, u)
        except LimiteInstagram:
            limite = "Instagram pidió esperar (límite de pedidos por hora): algunos perfiles se leen en la próxima corrida."
            break
        with db_session:
            x = LeadAudiencia.get(id=lid)
            x.tipo_cuenta, x.perfil, x.perfil_at = tipo, (json.dumps(perfil, ensure_ascii=False) if perfil else None), datetime.utcnow()
    with db_session:
        listos = [x.id for x in list(LeadAudiencia.select()) if x.id in set(ids) and x.perfil_at is not None]
    ia = analizar(reanalizar_ids=listos) if listos else {"analizados": 0, "errores": 0}
    with db_session:
        leads = [_a_dict(x) for x in list(LeadAudiencia.select()) if x.id in set(ids)]
    orden = {u: i for i, u in enumerate(ahora)}
    leads.sort(key=lambda f: orden.get(f["usuario"], 99))
    return {**{k: v for k, v in r.items() if k != "usuarios"}, "leads": leads, "ia": ia,
            "pendientes": max(0, len(r["usuarios"]) - MAX_A_MANO), "aviso": limite}


# ------------------------------------------------------------------ perfiles + IA

def completar_perfiles(limite: int = 40) -> int:
    from pony.orm import db_session

    from src.models import LeadAudiencia

    token, uid = _credenciales()
    with db_session:
        pendientes = [x.id for x in list(LeadAudiencia.select()) if x.perfil_at is None][:limite]
    hechos = 0
    token_pagina = None
    for lid in pendientes:
        with db_session:
            x = LeadAudiencia.get(id=lid)
            usuario = x.ig_usuario
            previo = json.loads(x.perfil) if x.perfil else {}
        try:
            tipo, perfil = leer_perfil(token, uid, usuario)
            # Quien respondió una historia escribió por mensaje: de ahí salen foto, seguidores y
            # el verificado aunque la cuenta sea personal (Business Discovery no la muestra).
            if previo.get("igsid"):
                if token_pagina is None:
                    token_pagina = _pagina(token)[1]
                por_mensajes = perfil_por_mensajes(token_pagina, previo["igsid"], usuario)
                perfil = {**{k: v for k, v in por_mensajes.items() if v is not None}, **{k: v for k, v in perfil.items() if v is not None},
                          "verificado": por_mensajes.get("verificado"), "teSigue": por_mensajes.get("teSigue"), "igsid": previo["igsid"]}
        except LimiteInstagram as e:
            # Se corta la corrida y los que faltan quedan para la próxima.
            logger.info("Audiencia: Instagram pidió esperar (%s). Quedan %d perfiles para después.",
                        str(e)[:80], len(pendientes) - hechos)
            break
        hechos += 1
        with db_session:
            x = LeadAudiencia.get(id=lid)
            x.tipo_cuenta = tipo
            x.perfil = json.dumps(perfil, ensure_ascii=False) if perfil else None
            x.perfil_at = datetime.utcnow()
    return hechos


SYSTEM = (
    "Vas a recibir un CRITERIO (tu rol, cómo puntuar y las reglas) y una lista de PERSONAS. "
    "Aplicá el criterio a cada persona por separado, usando solo sus datos.\n"
    "Respondé EXCLUSIVAMENTE un JSON, sin texto antes ni después, con esta forma:\n"
    "{\"leads\": [{\"username\": \"...\", \"veredicto\": \"CALIFICADO|DESCARTADO\", "
    "\"descarte_automatico\": true|false, \"puntaje_final\": 0.0, "
    "\"dimensiones\": {\"negocio\": 0, \"financiero\": 0, \"intencion\": 0, \"avatar\": 0}, "
    "\"razon\": \"máximo 2 frases\", \"señales_detectadas\": [\"máximo 3\"], \"red_flags\": []}]}\n"
    "`descarte_automatico` es true solo si se cumple alguna regla de descalificación automática."
)

# Los pesos y los cortes del criterio de marketing. La cuenta se hace acá y no se le
# cree al modelo: cuando se le pidió juzgar, el número que devolvía no siempre salía de
# sus propias dimensiones. El modelo da los hechos (cuatro puntajes y si hay descarte
# automático); el veredicto lo decide el código.
# Sin intención (Franco, opción A): en reels con CTA todos comentan la palabra que
# dispara el bot, así que la intención no separa a nadie y la IA la puntuaba distinto
# para el mismo comentario. Decide el perfil; el comentario solo sirve para el descarte.
PESOS = {"negocio": 0.45, "financiero": 0.40, "avatar": 0.15}
# Calificado = puntaje 7 o más (Franco, 20-10-2026; antes 5). Se aplica también a lo ya analizado
# al leerlo (ver _veredicto_vigente): el puntaje está guardado, no hace falta reanalizar.
CORTE_CALIFICADO = 7.0


def _veredicto(dimensiones: dict, descarte: bool) -> tuple[str, float]:
    total = 0.0
    for k, peso in PESOS.items():
        try:
            total += max(0.0, min(10.0, float(dimensiones.get(k) or 0))) * peso
        except (TypeError, ValueError):
            pass
    total = round(total, 1)
    if descarte or total < CORTE_CALIFICADO:
        return "no", total
    return "calificado", total


def _veredicto_vigente(veredicto: str, puntaje: float | None) -> str:
    """El veredicto con el corte de hoy. "tibio" era el nombre viejo de calificado; y lo que se
    calificó con un corte más bajo baja a descartado si su puntaje no llega al actual."""
    if veredicto in ("calificado", "tibio"):
        return "calificado" if puntaje is None or puntaje >= CORTE_CALIFICADO else "no"
    return veredicto


def _bloque(x) -> dict:
    perfil = json.loads(x.perfil) if x.perfil else {}
    historia = x.creado_por == "historia"
    return {
        "origen": "respondió una historia por mensaje directo" if historia else ("comentó un reel" if x.media_id else "cargado a mano"),
        "comentario": (x.comentario or "")[:400] or None,
        "reel_tema": (x.reel_caption or "")[:300] or None,
        "perfil": {
            "username": x.ig_usuario,
            "nombre": perfil.get("nombre"),
            "bio": perfil.get("bio"),
            "seguidores": perfil.get("seguidores"),
            "siguiendo": perfil.get("seguidos"),
            "cantidad_posts": perfil.get("publicaciones"),
            # Business Discovery solo responde por cuentas de empresa o creador: si no hay
            # perfil, es personal o privada y la API no deja ver nada más.
            "es_cuenta_privada": x.tipo_cuenta != "empresa",
            "es_verificado": perfil.get("verificado"),
            "sigue_a_la_cuenta": perfil.get("teSigue"),
            "categoria_cuenta": None,
            "ultimos_posts": [p.get("caption") for p in (perfil.get("posts") or [])[:5]] or None,
            "link_en_bio": perfil.get("web"),
        },
    }


def analizar(limite: int = 60, reanalizar_ids: list[int] | None = None) -> dict:
    """Pasa por la IA los leads con perfil leído y sin veredicto, en lotes."""
    from pony.orm import db_session

    from src.models import LeadAudiencia
    from src.services.activacion_ia_services import invocar_claude_texto

    texto_criterio = criterio()["texto"]
    with db_session:
        if reanalizar_ids:
            ids = [x.id for x in list(LeadAudiencia.select()) if x.id in set(reanalizar_ids)]
        else:
            ids = [x.id for x in list(LeadAudiencia.select())
                   if x.perfil_at is not None and x.veredicto == "sin_analizar"][:limite]
    analizados = errores = 0
    costo = 0.0
    for i in range(0, len(ids), LOTE_IA):
        lote = ids[i:i + LOTE_IA]
        with db_session:
            filas = [LeadAudiencia.get(id=lid) for lid in lote]
            datos = [_bloque(x) for x in filas if x]
        user = f"CRITERIO:\n{texto_criterio}\n\nPERSONAS:\n{json.dumps(datos, ensure_ascii=False)}"
        try:
            texto, meta = invocar_claude_texto(SYSTEM, user)
            costo += float(meta.get("costo_usd") or 0)
            ini, fin = texto.find("{"), texto.rfind("}")
            respuesta = json.loads(texto[ini:fin + 1]).get("leads") or []
        except Exception as e:  # noqa: BLE001
            logger.warning("Audiencia: la IA no respondió para un lote: %s", str(e)[:200])
            errores += len(lote)
            continue
        por_usuario = {str(r.get("username") or r.get("usuario") or "").lstrip("@").lower(): r for r in respuesta}
        with db_session:
            for lid in lote:
                x = LeadAudiencia.get(id=lid)
                r = por_usuario.get(x.ig_usuario)
                if not r:
                    errores += 1
                    continue
                dims = r.get("dimensiones") or {}
                descarte = bool(r.get("descarte_automatico")) or (
                    str(r.get("veredicto") or "").upper() == "DESCARTADO"
                    and float(r.get("puntaje_final") or 0) >= CORTE_CALIFICADO)
                x.veredicto, x.puntaje = _veredicto(dims, descarte)
                x.motivo = str(r.get("razon") or r.get("motivo") or "")[:500]
                x.analisis = json.dumps({
                    "dimensiones": {k: dims.get(k) for k in ("negocio", "financiero", "intencion", "avatar")},
                    "descarteAutomatico": descarte,
                    "señales": list(r.get("señales_detectadas") or r.get("senales_detectadas") or [])[:3],
                    "redFlags": list(r.get("red_flags") or [])[:5],
                    "veredictoModelo": r.get("veredicto"), "puntajeModelo": r.get("puntaje_final"),
                }, ensure_ascii=False)
                x.analizado_at = datetime.utcnow()
                analizados += 1
    return {"analizados": analizados, "errores": errores, "costoUsd": round(costo, 4)}


def correr(usuario: dict | None = None) -> dict:
    """La corrida entera: comentarios nuevos → perfiles → IA. Una a la vez."""
    if not _lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay un análisis corriendo. Esperá a que termine.")
    try:
        resultado = {"comentarios": None}
        try:
            resultado["comentarios"] = sincronizar_comentarios()
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            logger.warning("Audiencia: comentarios: %s", str(e)[:200])
            resultado["comentarios"] = {"error": str(e)[:200]}
        try:
            resultado["historias"] = sincronizar_historias()
        except HTTPException as e:
            resultado["historias"] = {"error": e.detail}
        except Exception as e:  # noqa: BLE001
            logger.warning("Audiencia: historias: %s", str(e)[:200])
            resultado["historias"] = {"error": str(e)[:200]}
        try:
            from src.services import chats_reels_services

            resultado["chatsReels"] = chats_reels_services.sincronizar()
        except Exception as e:  # noqa: BLE001
            resultado["chatsReels"] = {"error": str(e)[:200]}
        resultado["perfiles"] = completar_perfiles()
        resultado["fotos"] = completar_fotos()
        resultado["ia"] = analizar()
        logger.info("Audiencia: %s", resultado)
        return resultado
    finally:
        _lock.release()


# ------------------------------------------------------------------ lectura y acciones

def _a_dict(x) -> dict:
    perfil = json.loads(x.perfil) if x.perfil else {}
    perfil.pop("igsid", None)  # el id interno de Instagram no le sirve a la pantalla
    return {
        "id": x.id, "usuario": x.ig_usuario, "url": f"https://instagram.com/{x.ig_usuario}",
        "comentario": x.comentario, "comentadoAt": x.comentado_at.isoformat() if x.comentado_at else None,
        "reelId": x.media_id, "reelCaption": x.reel_caption, "reelUrl": x.reel_url,
        "cuenta": x.tipo_cuenta, "perfil": perfil or None, "perfilLeido": x.perfil_at is not None,
        "veredicto": _veredicto_vigente(x.veredicto, x.puntaje), "puntaje": x.puntaje, "motivo": x.motivo,
        "analisis": json.loads(x.analisis) if x.analisis else None,
        "analizadoAt": x.analizado_at.isoformat() if x.analizado_at else None,
        "estado": x.estado, "pitchId": x.pitch_id,
        "origen": "comentario" if x.media_id else "manual",
        "fuente": "historia" if x.creado_por == "historia" else ("reel" if x.media_id else "manual"),
        "creadoAt": x.creado_at.isoformat() if x.creado_at else None,
    }


def listar() -> dict:
    from pony.orm import db_session

    from src.models import LeadAudiencia

    with db_session:
        # Los cuatro textos largos (LongStr) Pony los trae de a uno, al leerlos: con 300 leads
        # eran 1.200 consultas a Neon y Audiencia tardaba hasta 7 s. `prefetch` los trae en
        # la misma consulta.
        filas = [_a_dict(x) for x in list(LeadAudiencia.select().prefetch(
            LeadAudiencia.comentario, LeadAudiencia.perfil, LeadAudiencia.motivo, LeadAudiencia.analisis))]
    orden = {"calificado": 0, "tibio": 1, "sin_analizar": 2, "no": 3}
    filas.sort(key=lambda f: (orden.get(f["veredicto"], 9), -(f["puntaje"] or -1), f["comentadoAt"] or f["creadoAt"] or ""))
    conteo: dict[str, int] = {}
    for f in filas:
        if f["estado"] != "descartado":
            conteo[f["veredicto"]] = conteo.get(f["veredicto"], 0) + 1
    reels = _reels([f for f in filas if f["fuente"] != "historia"])
    historias = _secuencias([f for f in filas if f["fuente"] == "historia"])
    try:
        estado_permisos = permisos()
    except HTTPException as e:
        estado_permisos = {"comentarios": False, "perfiles": False, "error": e.detail}
    return {"leads": filas, "conteo": conteo, "reels": reels, "historias": historias, "permisos": estado_permisos,
            "criterio": criterio()}


def _reels(filas: list[dict]) -> list[dict]:
    """Los reels recientes con lo que dejaron sus comentarios, del más nuevo al más viejo.

    La miniatura, el caption y el total de comentarios salen del sync de Instagram que ya
    corre (`publicaciones_ig`, con la foto guardada en el servidor: la URL de Instagram
    vence a los pocos días). Las cuentas por veredicto, de los leads de cada reel."""
    from pony.orm import db_session

    from src.models import PublicacionIg

    # Todos los reels guardados, de cualquier mes: los de meses anteriores aparecen aunque
    # nadie los haya analizado todavía, para poder analizarlos a mano.
    with db_session:
        publicados = {r.ig_id: r for r in list(PublicacionIg.select())
                      if r.tipo == "reel" and r.publicado_at}
        base = {}
        for ig_id, r in publicados.items():
            try:
                metricas = json.loads(r.metricas or "{}")
            except ValueError:
                metricas = {}
            base[ig_id] = {"id": ig_id, "caption": (r.caption or "")[:400], "url": r.permalink,
                           "thumbnail": r.thumbnail or None,
                           "fecha": r.publicado_at.isoformat() if r.publicado_at else None,
                           "comentarios": int(metricas.get("comments") or 0)}
    salida = {rid: {**b, "personas": 0, "calificado": 0, "tibio": 0, "no": 0, "sin_analizar": 0}
              for rid, b in base.items()}
    for f in filas:
        rid = f["reelId"]
        if not rid:
            continue
        r = salida.setdefault(rid, {**base.get(rid, {"id": rid, "caption": f["reelCaption"], "url": f["reelUrl"],
                                                      "thumbnail": None, "fecha": None, "comentarios": 0}),
                                    "personas": 0, "calificado": 0, "tibio": 0, "no": 0, "sin_analizar": 0})
        r["personas"] += 1
        r[f["veredicto"]] = r.get(f["veredicto"], 0) + 1
    from src.services import chats_reels_services

    try:
        estado = chats_reels_services.estado()
    except Exception:  # noqa: BLE001
        estado = {}
    seguidos = reels_seguidos()
    for rid, r in salida.items():
        r["seguido"] = rid in seguidos
        c = estado.get(rid) or {"origen": "auto", "esCta": False, "palabra": None, "chats": 0}
        r["chats"] = int(c.get("chats") or 0)
        r["palabra"] = c.get("palabra")
        r["cta"] = c
        analizados = r["calificado"] + r["tibio"] + r["no"]
        r["analizados"] = analizados
        r["pctCalificados"] = round(r["calificado"] / analizados * 100, 1) if analizados else None
        # Instagram cuenta cada comentario y las respuestas; las personas son únicas. Si el
        # sync todavía no trajo el número, se muestran las personas.
        r["comentarios"] = max(r["comentarios"], r["personas"])
    return sorted(salida.values(), key=lambda r: r.get("fecha") or "", reverse=True)


def _secuencias(filas: list[dict]) -> list[dict]:
    """Las secuencias de historias (un día de historias) con lo que dejaron sus respuestas.

    A cada lead se le anota el día de su secuencia (`secuencia`) para que la pantalla filtre.
    Las respuestas totales salen de lo que midió Instagram en cada pieza."""
    from pony.orm import db_session

    from src.models import PublicacionIg
    from src.services.instagram_services import cta_marcadas

    desde = datetime.utcnow() - timedelta(days=60)
    with db_session:
        piezas = sorted([p for p in list(PublicacionIg.select())
                         if p.tipo == "historia" and p.publicado_at and p.publicado_at >= desde],
                        key=lambda p: p.publicado_at)
        dia_de, por_dia = {}, {}
        for p in piezas:
            try:
                metricas = json.loads(p.metricas or "{}")
            except ValueError:
                metricas = {}
            dia = p.publicado_at.strftime("%Y-%m-%d")
            dia_de[p.ig_id] = dia
            por_dia.setdefault(dia, []).append({"id": p.ig_id, "thumbnail": p.thumbnail or None, "url": p.permalink,
                                                "respuestas": int(metricas.get("replies") or 0)})
    try:
        marcadas = cta_marcadas()
    except Exception:  # noqa: BLE001
        marcadas = set()
    salida: dict[str, dict] = {}
    for f in filas:
        dia = dia_de.get(f["reelId"])
        f["secuencia"] = dia
        if not dia:
            continue
        s = salida.setdefault(dia, {"id": dia, "fecha": dia, "piezas": por_dia.get(dia, []), "cta": dia in marcadas,
                                    "respuestas": sum(x["respuestas"] for x in por_dia.get(dia, [])),
                                    "personas": 0, "calificado": 0, "tibio": 0, "no": 0, "sin_analizar": 0})
        s["personas"] += 1
        s[f["veredicto"]] = s.get(f["veredicto"], 0) + 1
    for s in salida.values():
        analizados = s["calificado"] + s["tibio"] + s["no"]
        s["analizados"] = analizados
        s["pctCalificados"] = round(s["calificado"] / analizados * 100, 1) if analizados else None
        # Instagram cuenta cada respuesta (alguien puede responder varias piezas); las personas son únicas.
        s["respuestas"] = max(s["respuestas"], s["personas"])
    return sorted(salida.values(), key=lambda s: s["fecha"], reverse=True)


def marcar(lead_id: int, estado: str) -> dict:
    from pony.orm import db_session

    from src.models import LeadAudiencia

    if estado not in ("nuevo", "descartado"):
        raise HTTPException(status_code=400, detail="Estado inválido.")
    with db_session:
        x = LeadAudiencia.get(id=lead_id)
        if x is None:
            raise HTTPException(status_code=404, detail="Ese lead no existe.")
        x.estado = estado
        return _a_dict(x)


# ------------------------------------------------------------------ scheduler

def iniciar_scheduler(stop: threading.Event) -> None:
    """Cada dos horas, si Instagram está conectado. Sin permiso de comentarios igual
    completa perfiles y veredictos de lo que se cargó a mano."""
    stop.wait(120)
    while not stop.is_set():
        try:
            correr()
        except HTTPException as e:
            logger.info("Audiencia: %s", e.detail)
        except Exception as e:  # noqa: BLE001
            logger.warning("Audiencia: %s", str(e)[:200])
        stop.wait(CADA_HORAS * 3600)
