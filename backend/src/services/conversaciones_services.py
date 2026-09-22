"""
Las conversaciones que se abren por Instagram, en la base de ATV Ops.

Instagram no deja leer los mensajes: el permiso está en el token, pero Meta corta el
pedido con "solicita acceso avanzado a instagram_manage_messages" porque la cuenta tiene
demasiadas conversaciones con gente que no está en la app. Hasta que Meta apruebe ese
acceso, no hay forma de listar el buzón.

Lo que sí se puede es que avise el que las abre. El bot de ManyChat arranca el flujo
cuando alguien comenta la palabra de un reel o escribe la de la bio, y ese flujo puede
pegarle a este webhook en el mismo momento. Así la conversación queda guardada acá
cuando pasa, no cuando alguien la copia a mano.

El mismo camino resuelve los Calendly enviados: el flujo avisa cada vez que manda el
link, y contarlos por rango de fechas pasa a ser una consulta.

El contrato del payload es el mismo que ya usa atv-mkt, así que en ManyChat alcanza con
duplicar el bloque de "External Request" y cambiarle la URL.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta

logger = logging.getLogger("atv_ops.conversaciones")

# Dos avisos iguales del mismo contacto en minutos son el mismo hecho contado dos veces:
# el flujo reintenta, o la persona manda la palabra dos veces seguidas.
VENTANA_REPETIDO = timedelta(minutes=10)

EVENTOS = ("conversacion", "calendly", "respuesta")

# De dónde entró el lead. El canal importa porque un DM de Instagram y un WhatsApp de la
# landing no se responden igual ni convierten igual.
CANALES = {"instagram": "Instagram", "manychat": "Instagram", "whatsapp": "WhatsApp",
           "hibrido": "Híbrido", "manual": "Cargado a mano"}


_CALENDLY = re.compile(r"calendly\.com", re.I)


def _canal(fuente: str) -> str:
    return CANALES.get((fuente or "").lower(), "Otro")


class WebhookNoAutorizado(Exception):
    """El aviso no trae el token que ATV Ops tiene guardado para ManyChat."""


def token_esperado() -> str:
    from src.services import conexiones_services

    return str(conexiones_services.obtener("manychat").get("webhook_token") or "").strip()


def _limpiar(v) -> str:
    """ManyChat manda `{{ig_username}}` literal cuando el campo no se resolvió."""
    texto = str(v or "").strip()
    if not texto or ("{{" in texto and "}}" in texto):
        return ""
    return texto


def _clasificar(payload: dict) -> str:
    """Qué hecho es. El evento explícito manda; si no, se mira si hay un link de Calendly."""
    evento = _limpiar(payload.get("event")).lower().replace(" ", "_")
    if evento in EVENTOS:
        return evento
    if evento in ("calendly_enviado", "link_enviado", "envio_calendly"):
        return "calendly"
    if evento == "respondio_auto":
        return "respuesta"
    texto = " ".join(_limpiar(payload.get(c)) for c in ("mensaje", "texto", "link", "url", "message"))
    return "calendly" if _CALENDLY.search(texto) else "conversacion"


def registrar(payload: dict, token_recibido: str = "") -> dict:
    """Guarda un aviso de ManyChat. Devuelve qué se hizo con él."""
    from pony.orm import db_session

    from src.models import ConversacionIg

    esperado = token_esperado()
    if not esperado:
        raise WebhookNoAutorizado("ATV Ops no tiene guardado el token de ManyChat.")
    recibido = (token_recibido or _limpiar(payload.get("webhook_token"))).strip()
    if recibido != esperado:
        raise WebhookNoAutorizado("El token del aviso no coincide.")

    evento = _clasificar(payload)
    ig = _limpiar(payload.get("contact_ig_username")).lstrip("@")
    nombre = " ".join(x for x in (_limpiar(payload.get("contact_name")),
                                  _limpiar(payload.get("contact_lastname"))) if x).strip() or ig
    keyword = _limpiar(payload.get("keyword")).lower()
    contacto = _limpiar(payload.get("manychat_contact_id"))
    ahora = datetime.utcnow()

    with db_session:
        # Sin persona no hay a quién atribuirle nada, pero igual se guarda: perder el
        # hecho es peor que tener una fila sin nombre.
        if ig or contacto:
            desde = ahora - VENTANA_REPETIDO
            repetido = [c for c in list(ConversacionIg.select())
                        if c.evento == evento and c.at >= desde
                        and ((ig and c.ig_usuario == ig) or (contacto and c.contacto_id == contacto))
                        and (c.keyword or "") == keyword]
            if repetido:
                return {"ok": True, "evento": evento, "guardado": False, "motivo": "repetido"}
        ConversacionIg(evento=evento, at=ahora, ig_usuario=ig[:120], nombre=nombre[:160],
                       keyword=keyword[:120], content_url=_limpiar(payload.get("content_url"))[:500],
                       contacto_id=contacto[:120], payload=json.dumps(payload, ensure_ascii=False)[:2000])
    return {"ok": True, "evento": evento, "guardado": True}


def marcar_pitch(datos: dict, usuario: dict) -> dict:
    """El setter avisa que mandó el link de agenda por fuera de Instagram.

    Lo que sale por Instagram se detecta solo leyendo el mensaje. Lo que se manda por
    WhatsApp o por audio no deja rastro que el sistema pueda leer, y el pitch es el número
    que define el mes del setter: si depende de que alguien lo cargue después, no se carga.
    """
    from pony.orm import db_session

    from src.models import ConversacionIg

    persona = str(datos.get("prospecto") or "").strip()
    canal = str(datos.get("canal") or "whatsapp").strip().lower()
    if canal not in CANALES:
        canal = "manual"
    with db_session:
        fila = ConversacionIg(evento="calendly", at=datetime.utcnow(),
                              ig_usuario=persona[:120], nombre=persona[:160] or "Sin nombre",
                              keyword="", content_url="", contacto_id="", fuente=canal,
                              payload=json.dumps({"por": usuario.get("username", ""),
                                                  "nota": str(datos.get("nota") or "")[:300]},
                                                 ensure_ascii=False))
        return {"ok": True, "id": fila.id, "canal": _canal(canal)}


def chats(desde, hasta) -> dict:
    """Los chats del mes, sumando todas las puertas por las que entra una conversación.

    Un chat es una conversación que arrancó porque el contenido la pidió. Hoy son tres
    puertas y ninguna sabe de la otra:

    - **Historias con CTA.** Alguien contesta una historia que pedía algo. Instagram lo
      cuenta pieza por pieza; solo suman las secuencias marcadas con el botón CTA, porque
      un día de historias sin CTA también junta respuestas y esas no son leads.
    - **Reels y bio.** Alguien comenta la palabra de un reel o la escribe desde la bio y
      ManyChat le abre el DM. Lo cuenta ATV Ops si el flujo ya avisa a este webhook; si
      todavía no, el `lead` del CRM de atv-mkt, que los viene contando desde siempre.
    - **Otras.** WhatsApp, cargadas a mano: lo que entre por un canal que no es Instagram.

    Se devuelven las partes además del total. Un solo número no deja ver que el mes fue
    bueno por historias y malo por reels, que es exactamente la decisión que hay que tomar.

    **Las puertas no se pisan, y eso es una decisión, no una casualidad.** ManyChat escucha
    solo palabras de reels; los CTA de historias no pasan por el bot. Por eso sumar es
    correcto y nadie se cuenta dos veces (Franco, 22-09-2026).

    Lo único que rompería esa garantía es poner en una historia una palabra que ManyChat
    ya escuche: esa persona entraría como respuesta a la historia Y como lead con palabra.
    Si alguna vez el total deja de cerrar con la realidad, empezar por ahí. Las partes se
    muestran siempre, que es lo que permite verlo.
    """
    from pony.orm import db_session

    from src.models import ConversacionIg

    inicio = datetime.combine(desde, datetime.min.time())
    fin = datetime.combine(hasta, datetime.min.time())
    try:
        with db_session:
            filas = [c for c in list(ConversacionIg.select()) if inicio <= c.at < fin]
            historico = ConversacionIg.select().count()
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron leer las conversaciones: %s", str(e)[:160])
        filas, historico = [], 0

    propias = [c for c in filas if c.evento == "conversacion"]
    de_instagram = [c for c in propias if _canal(c.fuente) == "Instagram"]
    otras = [c for c in propias if _canal(c.fuente) != "Instagram"]

    # --- Historias con CTA
    secuencias: list[dict] = []
    con_cta: list[dict] = []
    try:
        from src.services import instagram_services

        secuencias = instagram_services.contenido(desde, hasta).get("secuencias", [])
        con_cta = [x for x in secuencias if x.get("cta")]
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron leer las historias del período: %s", str(e)[:160])
    por_historias = sum(x.get("respuestas") or 0 for x in con_cta)

    # --- Reels y bio. Las propias mandan cuando tienen algo de ESTE mes; si no, el CRM.
    # Mirar el histórico en vez del mes era el bug viejo: ATV Ops tiene avisos de Calendly
    # desde hace rato y ni una conversación, así que la condición daba verdadera y el
    # tablero mostraba cero.
    del_crm = 0
    if not de_instagram:
        try:
            from src.services import marketing_services

            del_crm = int(marketing_services._conversaciones_del_bot(desde, hasta).get("total") or 0)
        except Exception as e:  # noqa: BLE001
            logger.warning("No se pudo leer el CRM de atv-mkt: %s", str(e)[:160])
    por_reels = len(de_instagram) or del_crm

    partes = [
        {"clave": "historias", "fuente": "Historias con CTA", "cuantos": por_historias,
         "detalle": (f"de {len(con_cta)} {'secuencia marcada' if len(con_cta) == 1 else 'secuencias marcadas'}"
                     f" sobre {len(secuencias)} del mes") if secuencias else "sin historias este mes"},
        {"clave": "reels", "fuente": "Reels y bio", "cuantos": por_reels,
         "detalle": "los abre el bot con la palabra" if de_instagram
                    else ("los cuenta el CRM de atv-mkt" if del_crm else "sin chats por palabra este mes")},
        {"clave": "otras", "fuente": "Otras", "cuantos": len(otras),
         "detalle": "WhatsApp y cargadas a mano"},
    ]

    return {
        "total": sum(p["cuantos"] for p in partes),
        "partes": partes,
        # Con qué nivel de confianza se mira el número de reels: propio, prestado o nada.
        "reelsPropios": bool(de_instagram),
        "webhookConectado": historico > 0,
        "secuenciasDelPeriodo": len(secuencias),
        "secuenciasConCta": len(con_cta),
        "detalle": [
            {"cuando": c.at.date().isoformat(), "quien": c.nombre or c.ig_usuario or "Sin nombre",
             "dato": _canal(c.fuente)}
            for c in sorted(propias, key=lambda x: x.at, reverse=True)
        ] or [
            {"cuando": x["fecha"], "quien": f"Secuencia de {x['piezas']} historias",
             "dato": f"{x.get('respuestas') or 0} respuestas",
             # La miniatura de la primera pieza: con verla se reconoce cuál fue.
             "foto": (x.get("historias") or [{}])[0].get("thumbnail")}
            for x in con_cta
        ],
    }


def embudo(desde, hasta, pitches: int = 0, agendas: int = 0, shows: int = 0,
           detalle_reuniones: dict | None = None) -> dict:
    """El embudo del setter: chats, pitches, agendas y shows, con lo que convierte cada paso.

    Los chats salen de `chats()`, que suma las tres puertas; las dos últimas etapas se
    pasan desde ventas, que es donde viven las reuniones. Un pitch es el link de agenda
    enviado: acá el pitch y la aplicación son la misma acción, no dos.
    """
    from pony.orm import db_session

    from src.models import ConversacionIg

    inicio = datetime.combine(desde, datetime.min.time())
    fin = datetime.combine(hasta, datetime.min.time())
    try:
        with db_session:
            filas = [c for c in list(ConversacionIg.select()) if inicio <= c.at < fin]
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo leer el embudo: %s", str(e)[:160])
        filas = []

    c = chats(desde, hasta)

    # El canal sirve para saber por dónde entra la gente, no solo cuánta. Las respuestas a
    # historias son Instagram por definición.
    por_canal: dict[str, dict] = {}
    for fila in [x for x in filas if x.evento == "conversacion"]:
        d = por_canal.setdefault(_canal(fila.fuente), {"canal": _canal(fila.fuente), "chats": 0, "pitches": 0})
        d["chats"] += 1
    por_historias = next((p["cuantos"] for p in c["partes"] if p["clave"] == "historias"), 0)
    if por_historias:
        d = por_canal.setdefault("Instagram", {"canal": "Instagram", "chats": 0, "pitches": 0})
        d["chats"] += por_historias

    return {
        "detalle": {"chats": c["detalle"], **(detalle_reuniones or {})},
        "chats": c["total"],
        # De qué se compone el número. Un total solo no deja ver que el mes fue bueno por
        # historias y malo por reels, que es la decisión que hay que tomar.
        "chatsPartes": c["partes"],
        "secuenciasDelPeriodo": c["secuenciasDelPeriodo"],
        "secuenciasConCta": c["secuenciasConCta"],
        "pitches": pitches,
        "agendas": agendas,
        "shows": shows,
        "porCanal": sorted(por_canal.values(), key=lambda x: -x["chats"]),
        # Sin una sola puerta abierta todavía no hay embudo: el tablero lo dice en vez de
        # poner ceros que parecen un mes malo.
        "conectado": c["total"] > 0 or c["webhookConectado"],
    }


def resumen(desde, hasta) -> dict:
    """Lo que pasó en el período: conversaciones abiertas y Calendly enviados."""
    from pony.orm import db_session

    from src.models import ConversacionIg

    inicio = datetime.combine(desde, datetime.min.time())
    fin = datetime.combine(hasta, datetime.min.time())
    try:
        with db_session:
            filas = [c for c in list(ConversacionIg.select()) if inicio <= c.at < fin]
            total_historico = ConversacionIg.select().count()
            ultima = max((c.at for c in list(ConversacionIg.select())), default=None)
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudieron leer las conversaciones: %s", str(e)[:160])
        return {"conectado": False, "conversaciones": 0, "calendlys": 0,
                "porPalabra": [], "porDia": [], "personas": 0}

    conversaciones = [c for c in filas if c.evento == "conversacion"]
    calendlys = [c for c in filas if c.evento == "calendly"]

    por_palabra: dict[str, int] = {}
    for c in conversaciones:
        por_palabra[c.keyword or "(sin palabra)"] = por_palabra.get(c.keyword or "(sin palabra)", 0) + 1
    por_dia: dict[str, dict] = {}
    for c in filas:
        d = por_dia.setdefault(c.at.date().isoformat(), {"dia": c.at.date().isoformat(),
                                                         "conversaciones": 0, "calendlys": 0})
        if c.evento == "conversacion":
            d["conversaciones"] += 1
        elif c.evento == "calendly":
            d["calendlys"] += 1

    compuesto = chats(desde, hasta)

    return {
        # Sin ningún aviso todavía no hay fuente: el tablero tiene que decirlo, no poner 0.
        "conectado": total_historico > 0,
        # `conversaciones` es lo que registró ATV Ops por su webhook; `chats` es la métrica
        # del negocio, que suma historias con CTA, reels y lo que entre por otro canal.
        # Marketing y el embudo de Ventas leen la misma para no poder discrepar.
        "chats": compuesto["total"],
        "chatsPartes": compuesto["partes"],
        "conversaciones": len(conversaciones),
        "calendlys": len(calendlys),
        "respuestas": sum(1 for c in filas if c.evento == "respuesta"),
        "personas": len({c.ig_usuario or c.contacto_id for c in conversaciones if c.ig_usuario or c.contacto_id}),
        "porPalabra": sorted(({"palabra": k, "conversaciones": v} for k, v in por_palabra.items()),
                             key=lambda x: x["conversaciones"], reverse=True),
        "porDia": sorted(por_dia.values(), key=lambda x: x["dia"]),
        "ultimaAt": ultima.isoformat() if ultima else None,
        "totalHistorico": total_historico,
    }
