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
_CALENDLY = re.compile(r"calendly\.com", re.I)


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

    return {
        # Sin ningún aviso todavía no hay fuente: el tablero tiene que decirlo, no poner 0.
        "conectado": total_historico > 0,
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
