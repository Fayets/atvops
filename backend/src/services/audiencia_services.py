"""
Audiencia: quién comenta los reels y si es un lead calificado.

El recorrido es: se publica un reel → la gente comenta → por cada persona nueva se lee su
perfil → la IA lo compara con el criterio que escribe marketing → queda como calificado,
tibio o descartado, con el motivo. Los calificados se pasan a setting con un click, y le llegan a
Cris como pitch pendiente con el usuario de Instagram ya cargado.

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
DIAS_REELS = 21          # cuántos días hacia atrás se miran los reels
MAX_COMENTARIOS = 300    # por reel, para no recorrer miles en una corrida
LOTE_IA = 12             # perfiles por llamada a la IA
CADA_HORAS = 2

CRITERIO_DEFAULT = """ROL
Sos un agente de calificación de leads para ATV, una mentoría de alto ticket (tickets de US$5.000 a US$20.000) para dueños de negocio y emprendedores de marketing en LATAM y España.
Tu trabajo es analizar comentarios de reels y perfiles de Instagram para determinar si la persona es un lead calificado o no. No vendés, no escribís mensajes, no interactuás. Solo analizás y clasificás.

CRITERIOS DE CALIFICACIÓN
Analizá 4 dimensiones y puntuá cada una de 0 a 10.

1. SEÑALES DE NEGOCIO (peso 35%)
Buscá en bio, nombre, categoría de cuenta y posts:
- Dueño de negocio, emprendedor, fundador, CEO, director
- Coach, consultor, mentor, agencia
- Palabras como "escalo", "facturo", "mi empresa", "mi marca", "clientes"
- Categoría de cuenta tipo "Emprendedor", "Business", "Marketing"
Puntaje alto (8-10): bio claramente de dueño de negocio o profesional establecido.
Puntaje medio (4-7): señales ambiguas, menciona trabajar pero no está claro qué.
Puntaje bajo (0-3): estudiante, empleado buscando trabajo, sin señales de negocio.

2. CAPACIDAD FINANCIERA (peso 30%)
Buscá señales indirectas de poder adquisitivo:
- Menciona facturación, resultados de negocio, clientes
- Contenido profesional de calidad (no cuenta personal sin rumbo)
- Seguidores coherentes con un operador real (más de 500 suele ser señal positiva, pero no descartes por debajo)
- Link en bio a negocio propio, web, calendario
Puntaje alto (8-10): señales claras de negocio activo con ingresos.
Puntaje medio (4-7): parece tener actividad pero sin señales claras de dinero.
Puntaje bajo (0-3): cuenta personal, sin actividad, señales de apuro económico ("busco trabajo", "necesito plata").
IMPORTANTE: nunca califiques por apariencia física, género, edad aparente ni país. Solo señales de negocio y capacidad.

3. INTENCIÓN EN EL COMENTARIO (peso 25%)
Analizá el texto del comentario:
- Pregunta específica sobre el tema del reel (alta intención)
- Pide el recurso o más información (alta intención)
- Comentario genérico tipo "buen video", "🔥", "gracias" (baja intención)
- Comentario de spam, venta propia, o promoción de otro servicio (descalifica directo)
Puntaje alto (8-10): pregunta algo concreto o pide el recurso.
Puntaje medio (4-7): comenta pero sin intención clara.
Puntaje bajo (0-3): genérico, emoji solo, o spam.

4. COHERENCIA CON EL AVATAR (peso 10%)
El avatar de ATV es: dueños de negocio de marketing, coaching, consultoría o servicios digitales en países hispanohablantes (Argentina, Chile, Uruguay, Paraguay, Colombia, España, México, Perú).
Puntaje alto (8-10): encaja directo con el avatar.
Puntaje medio (4-7): nicho cercano pero no exacto.
Puntaje bajo (0-3): nicho sin relación (ej: gastronomía local, moda, gaming).

REGLAS DE DESCALIFICACIÓN AUTOMÁTICA
Si se cumple cualquiera de estas, el veredicto es DESCARTADO sin importar el puntaje:
- El comentario es spam o promociona otro servicio/producto
- La cuenta es claramente un bot (sin posts, seguidores raros, bio vacía)
- Es un competidor directo (otra mentoría o agencia del mismo nicho vendiendo lo mismo)
- El comentario pide algo fuera de contexto (ej: "seguidme", "mirá mi perfil")

CÁLCULO DEL PUNTAJE FINAL
puntaje_final = (negocio × 0.35) + (financiero × 0.30) + (intención × 0.25) + (avatar × 0.10)

VEREDICTOS
- CALIFICADO: puntaje_final ≥ 7.0 y sin descarte automático
- TIBIO: puntaje_final entre 5.0 y 6.9 y sin descarte automático
- DESCARTADO: puntaje_final < 5.0 o descarte automático

REGLAS FINALES
- Si falta información del perfil (bio vacía, sin posts), bajá las dimensiones de negocio y financiero, no inventes datos.
- Si el comentario es una pregunta pero el perfil es débil, el veredicto probablemente sea TIBIO, no CALIFICADO. La intención sola no califica.
- Sé estricto con CALIFICADO. Es mejor un TIBIO que entra a revisión manual que un CALIFICADO falso que le hace perder tiempo al setter.
- Escribí la razón siempre en español, en tono neutro y operativo, sin emojis."""


# ------------------------------------------------------------------ Instagram

def _credenciales() -> tuple[str, str]:
    from src.services import instagram_services

    cred = instagram_services._credenciales()
    if not cred:
        raise HTTPException(status_code=503, detail="Falta conectar Instagram en Sistema → Claves API.")
    return cred


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


def permisos() -> dict:
    """Qué puede hacer hoy el token: leer comentarios con usuario y leer perfiles."""
    token, _uid = _credenciales()
    datos = _pedir(token, "me/permissions").get("data") or []
    otorgados = {p.get("permission") for p in datos if p.get("status") == "granted"}
    return {
        "comentarios": "instagram_manage_comments" in otorgados,
        "perfiles": "instagram_basic" in otorgados,
        "otorgados": sorted(otorgados),
    }


def _usuario_limpio(texto: str) -> str:
    t = str(texto or "").strip()
    t = re.sub(r"^https?://(www\.)?instagram\.com/", "", t).split("?")[0].strip("/ ")
    return t.lstrip("@").strip().lower()


def leer_perfil(token: str, uid: str, usuario: str) -> tuple[str, dict]:
    """El perfil público por Business Discovery. Devuelve (tipo_cuenta, perfil)."""
    campos = ("username,name,biography,followers_count,follows_count,media_count,website,"
              "media.limit(6){caption,media_product_type,timestamp,like_count,comments_count}")
    r = _pedir(token, uid, fields=f"business_discovery.username({usuario}){{{campos}}}")
    bd = r.get("business_discovery")
    if not bd:
        # Una cuenta personal o privada responde con error: no hay perfil por la API.
        return "personal", {}
    posts = [{"caption": (m.get("caption") or "")[:280], "tipo": m.get("media_product_type"),
              "fecha": (m.get("timestamp") or "")[:10], "likes": m.get("like_count"),
              "comentarios": m.get("comments_count")}
             for m in (bd.get("media") or {}).get("data") or []]
    return "empresa", {
        "nombre": bd.get("name"), "bio": bd.get("biography"), "web": bd.get("website"),
        "seguidores": bd.get("followers_count"), "seguidos": bd.get("follows_count"),
        "publicaciones": bd.get("media_count"), "posts": posts,
    }


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


def sincronizar_comentarios(dias: int = DIAS_REELS) -> dict:
    """Trae los comentarios de los reels recientes y crea un lead por persona nueva."""
    from pony.orm import db_session

    from src.models import LeadAudiencia

    token, uid = _credenciales()
    propia = _cuenta_propia(token, uid)
    desde = datetime.utcnow() - timedelta(days=dias)
    media = _pedir(token, f"{uid}/media", fields="id,caption,permalink,media_product_type,timestamp,comments_count",
                   limit=50).get("data") or []
    reels = [m for m in media if (m.get("timestamp") or "") >= desde.strftime("%Y-%m-%d")]
    nuevos = sin_usuario = 0
    for m in reels:
        if not m.get("comments_count"):
            continue
        url = f"{m['id']}/comments"
        params = {"fields": "id,text,username,timestamp", "limit": 50}
        leidos = 0
        while url and leidos < MAX_COMENTARIOS:
            r = _pedir(token, url, **params)
            filas = r.get("data") or []
            for c in filas:
                leidos += 1
                usuario = _usuario_limpio(c.get("username") or "")
                if not usuario:
                    sin_usuario += 1
                    continue
                if usuario == propia:
                    continue
                with db_session:
                    if LeadAudiencia.get(comentario_id=c["id"]):
                        continue
                    # Una persona que comentó varios reels es un solo lead: se suma el
                    # comentario al que ya existe en vez de duplicarla.
                    previo = next((x for x in list(LeadAudiencia.select()) if x.ig_usuario == usuario), None)
                    if previo:
                        continue
                    LeadAudiencia(
                        ig_usuario=usuario, media_id=m["id"], reel_caption=(m.get("caption") or "")[:300],
                        reel_url=m.get("permalink"), comentario=(c.get("text") or "")[:1000],
                        comentado_at=_fecha(c.get("timestamp")), comentario_id=c["id"], creado_por="instagram",
                    )
                    nuevos += 1
            siguiente = (r.get("paging") or {}).get("next")
            if not siguiente:
                break
            url, params = siguiente.replace(f"{API}/", "").split("?")[0], dict(urllib.parse.parse_qsl(siguiente.split("?", 1)[1]))
            params.pop("access_token", None)
    return {"reels": len(reels), "nuevos": nuevos, "sinUsuario": sin_usuario}


def _fecha(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None


def cargar_a_mano(texto: str, usuario: dict) -> dict:
    """Usuarios pegados a mano (uno por línea, con o sin @, o links de perfil)."""
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
            LeadAudiencia(ig_usuario=u, creado_por=usuario.get("username"))
            nuevos += 1
    return {"recibidos": len(usuarios), "nuevos": nuevos}


# ------------------------------------------------------------------ perfiles + IA

def completar_perfiles(limite: int = 60) -> int:
    from pony.orm import db_session

    from src.models import LeadAudiencia

    token, uid = _credenciales()
    with db_session:
        pendientes = [x.id for x in list(LeadAudiencia.select()) if x.perfil_at is None][:limite]
    for lid in pendientes:
        with db_session:
            x = LeadAudiencia.get(id=lid)
            tipo, perfil = leer_perfil(token, uid, x.ig_usuario)
            x.tipo_cuenta = tipo
            x.perfil = json.dumps(perfil, ensure_ascii=False) if perfil else None
            x.perfil_at = datetime.utcnow()
    return len(pendientes)


SYSTEM = (
    "Vas a recibir un CRITERIO (tu rol, cómo puntuar y las reglas) y una lista de PERSONAS. "
    "Aplicá el criterio a cada persona por separado, usando solo sus datos.\n"
    "Respondé EXCLUSIVAMENTE un JSON, sin texto antes ni después, con esta forma:\n"
    "{\"leads\": [{\"username\": \"...\", \"veredicto\": \"CALIFICADO|TIBIO|DESCARTADO\", "
    "\"descarte_automatico\": true|false, \"puntaje_final\": 0.0, "
    "\"dimensiones\": {\"negocio\": 0, \"financiero\": 0, \"intencion\": 0, \"avatar\": 0}, "
    "\"razon\": \"máximo 2 frases\", \"señales_detectadas\": [\"máximo 3\"], \"red_flags\": []}]}\n"
    "`descarte_automatico` es true solo si se cumple alguna regla de descalificación automática."
)

# Los pesos y los cortes del criterio de marketing. La cuenta se hace acá y no se le
# cree al modelo: cuando se le pidió juzgar, el número que devolvía no siempre salía de
# sus propias dimensiones. El modelo da los hechos (cuatro puntajes y si hay descarte
# automático); el veredicto lo decide el código.
PESOS = {"negocio": 0.35, "financiero": 0.30, "intencion": 0.25, "avatar": 0.10}
CORTE_CALIFICADO, CORTE_TIBIO = 7.0, 5.0


def _veredicto(dimensiones: dict, descarte: bool) -> tuple[str, float]:
    total = 0.0
    for k, peso in PESOS.items():
        try:
            total += max(0.0, min(10.0, float(dimensiones.get(k) or 0))) * peso
        except (TypeError, ValueError):
            pass
    total = round(total, 1)
    if descarte or total < CORTE_TIBIO:
        return "no", total
    return ("calificado" if total >= CORTE_CALIFICADO else "tibio"), total


def _bloque(x) -> dict:
    perfil = json.loads(x.perfil) if x.perfil else {}
    return {
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
            "es_verificado": None,
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
                    and float(r.get("puntaje_final") or 0) >= CORTE_TIBIO)
                x.veredicto, x.puntaje = _veredicto(dims, descarte)
                x.motivo = str(r.get("razon") or r.get("motivo") or "")[:500]
                x.analisis = json.dumps({
                    "dimensiones": {k: dims.get(k) for k in PESOS},
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
        resultado["perfiles"] = completar_perfiles()
        resultado["ia"] = analizar()
        logger.info("Audiencia: %s", resultado)
        return resultado
    finally:
        _lock.release()


# ------------------------------------------------------------------ lectura y acciones

def _a_dict(x) -> dict:
    perfil = json.loads(x.perfil) if x.perfil else {}
    return {
        "id": x.id, "usuario": x.ig_usuario, "url": f"https://instagram.com/{x.ig_usuario}",
        "comentario": x.comentario, "comentadoAt": x.comentado_at.isoformat() if x.comentado_at else None,
        "reelId": x.media_id, "reelCaption": x.reel_caption, "reelUrl": x.reel_url,
        "cuenta": x.tipo_cuenta, "perfil": perfil or None, "perfilLeido": x.perfil_at is not None,
        "veredicto": x.veredicto, "puntaje": x.puntaje, "motivo": x.motivo,
        "analisis": json.loads(x.analisis) if x.analisis else None,
        "analizadoAt": x.analizado_at.isoformat() if x.analizado_at else None,
        "estado": x.estado, "pitchId": x.pitch_id,
        "origen": "comentario" if x.media_id else "manual",
        "creadoAt": x.creado_at.isoformat() if x.creado_at else None,
    }


def listar() -> dict:
    from pony.orm import db_session

    from src.models import LeadAudiencia

    with db_session:
        filas = [_a_dict(x) for x in list(LeadAudiencia.select())]
    orden = {"calificado": 0, "tibio": 1, "sin_analizar": 2, "no": 3}
    filas.sort(key=lambda f: (orden.get(f["veredicto"], 9), -(f["puntaje"] or -1), f["comentadoAt"] or f["creadoAt"] or ""))
    conteo: dict[str, int] = {}
    for f in filas:
        if f["estado"] != "descartado":
            conteo[f["veredicto"]] = conteo.get(f["veredicto"], 0) + 1
    reels: dict[str, dict] = {}
    for f in filas:
        if f["reelId"]:
            r = reels.setdefault(f["reelId"], {"id": f["reelId"], "caption": f["reelCaption"], "url": f["reelUrl"],
                                              "leads": 0, "calificados": 0})
            r["leads"] += 1
            r["calificados"] += f["veredicto"] == "calificado"
    try:
        estado_permisos = permisos()
    except HTTPException as e:
        estado_permisos = {"comentarios": False, "perfiles": False, "error": e.detail}
    return {"leads": filas, "conteo": conteo, "reels": list(reels.values()), "permisos": estado_permisos,
            "criterio": criterio()}


def a_setting(lead_id: int, usuario: dict) -> dict:
    """Crea el pitch pendiente para el setter con el usuario de Instagram cargado."""
    from pony.orm import db_session

    from src.models import LeadAudiencia
    from src.services import setting_services

    with db_session:
        x = LeadAudiencia.get(id=lead_id)
        if x is None:
            raise HTTPException(status_code=404, detail="Ese lead no existe.")
        if x.pitch_id:
            return _a_dict(x)
        perfil = json.loads(x.perfil) if x.perfil else {}
        nombre = perfil.get("nombre") or x.ig_usuario
        nota = f"Desde Audiencia ({x.veredicto}{f', {x.puntaje}/10' if x.puntaje is not None else ''}): {x.motivo or ''}"
        if x.comentario:
            nota += f" · Comentó: «{x.comentario[:120]}»"
    # El pitch queda a nombre del setter, no de quien tocó el botón: es su bandeja.
    from src.models import Usuario
    with db_session:
        setter = next((u.username for u in list(Usuario.select()) if u.rol == "setter"), None)
    dueño = {"username": setter or usuario.get("username"), "rol": "setter"}
    pitch = setting_services.crear({"prospecto": nombre, "usuarioIg": x.ig_usuario, "canal": "dm",
                                    "origen": "organico", "pitchEstado": "pendiente", "nota": nota[:900]}, dueño)
    with db_session:
        x = LeadAudiencia.get(id=lead_id)
        x.estado = "a_setting"
        x.pitch_id = pitch.get("id")
        return _a_dict(x)


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
