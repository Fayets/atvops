"""
Los mensajes directos de Instagram, en el momento en que pasan.

Este es el uso real de `instagram_manage_messages`. Instagram avisa por webhook cada vez
que alguien le escribe a la cuenta y cada vez que la cuenta responde, y de ahí salen los
dos números que hacían falta:

- Una **conversación abierta** es el primer mensaje de una persona. Los que siguen son la
  misma conversación, no una nueva.
- Un **Calendly enviado** es un mensaje nuestro que lleva un link de calendly.com. Sale de
  leerlo, así que cuenta igual lo que manda el bot y lo que escribe un setter a mano, que
  es justamente lo que antes no se podía medir.

No se guarda el texto de los mensajes. De cada uno queda quién, cuándo y si llevaba el
link: es lo que la atribución necesita y lo que dice la política de privacidad.

Meta manda los avisos firmados con la clave secreta de la app. Si está cargada, se valida
la firma y se descarta lo que no venga de Meta; si no está, se registra la advertencia y
se sigue, porque perder los avisos es peor que aceptarlos sin firma en una cuenta propia.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
from datetime import datetime

logger = logging.getLogger("atv_ops.ig_mensajes")

_CALENDLY = re.compile(r"calendly\.com", re.I)
FUENTE = "instagram"


def _credenciales() -> dict:
    from src.services import conexiones_services

    return conexiones_services.obtener("instagram")


def token_verificacion() -> str:
    """El que Meta repite al dar de alta el webhook, para probar que la URL es nuestra."""
    return str(_credenciales().get("webhook_verify_token") or "").strip()


def verificar_alta(modo: str, token: str, desafio: str) -> str:
    """Meta da de alta la URL con un GET: si el token coincide, se le devuelve su desafío."""
    esperado = token_verificacion()
    if not esperado:
        raise PermissionError("ATV Ops no tiene guardado el token de verificación de Instagram.")
    if modo != "subscribe" or token != esperado:
        raise PermissionError("El token de verificación no coincide.")
    return desafio


def firma_valida(cuerpo: bytes, cabecera: str) -> bool:
    """Compara la firma que manda Meta contra la clave secreta de la app."""
    secreto = str(_credenciales().get("app_secret") or "").strip()
    if not secreto:
        logger.warning("Llega un aviso de Instagram sin clave secreta cargada: no se valida la firma.")
        return True
    if not cabecera.startswith("sha256="):
        return False
    esperada = hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperada, cabecera.split("=", 1)[1])


def _quien_es(igsid: str) -> tuple[str, str]:
    """Nombre y usuario de quien escribió. Si Instagram no lo devuelve, queda el id."""
    import urllib.parse
    import urllib.request

    cred = _credenciales()
    token = str(cred.get("access_token") or "")
    if not token or not igsid:
        return "", ""
    url = f"https://graph.facebook.com/v21.0/{igsid}?{urllib.parse.urlencode({'fields': 'name,username', 'access_token': token})}"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            d = json.loads(r.read())
        return str(d.get("name") or ""), str(d.get("username") or "")
    except Exception as e:  # noqa: BLE001
        logger.info("No se pudo resolver quién es %s: %s", igsid, str(e)[:120])
        return "", ""


def _ya_escribio(igsid: str) -> bool:
    from src.models import ConversacionIg

    return any(c.contacto_id == igsid and c.evento == "conversacion"
               for c in list(ConversacionIg.select()))


def _guardar(evento: str, igsid: str, cuando: datetime, crudo: dict) -> None:
    from src.models import ConversacionIg

    nombre, usuario = _quien_es(igsid)
    ConversacionIg(evento=evento, at=cuando, ig_usuario=usuario[:120],
                   nombre=(nombre or usuario)[:160], keyword="", content_url="",
                   contacto_id=igsid[:120], fuente=FUENTE,
                   payload=json.dumps(crudo, ensure_ascii=False)[:2000])


def _momento(ms) -> datetime:
    try:
        return datetime.utcfromtimestamp(int(ms) / 1000)
    except (TypeError, ValueError):
        return datetime.utcnow()


def procesar(cuerpo: dict) -> dict:
    """Lee un aviso de Instagram y anota lo que corresponda. Devuelve qué hizo."""
    from pony.orm import db_session

    cuenta = str(_credenciales().get("instagram_user_id") or "").strip()
    conversaciones = calendlys = 0

    with db_session:
        for entrada in (cuerpo.get("entry") or []):
            for m in (entrada.get("messaging") or []):
                mensaje = m.get("message") or {}
                if mensaje.get("is_deleted"):
                    continue
                emisor = str((m.get("sender") or {}).get("id") or "")
                receptor = str((m.get("recipient") or {}).get("id") or "")
                cuando = _momento(m.get("timestamp"))
                texto = str(mensaje.get("text") or "")

                # `is_echo` marca lo que mandó la cuenta: ahí es donde puede ir el Calendly.
                nuestro = bool(mensaje.get("is_echo")) or (cuenta and emisor == cuenta)
                if nuestro:
                    if _CALENDLY.search(texto):
                        _guardar("calendly", receptor, cuando, m)
                        calendlys += 1
                    continue

                # De la persona: solo el primero abre una conversación.
                if emisor and not _ya_escribio(emisor):
                    _guardar("conversacion", emisor, cuando, m)
                    conversaciones += 1

    if conversaciones or calendlys:
        logger.info("Instagram: %s conversaciones nuevas, %s Calendly enviados",
                    conversaciones, calendlys)
    return {"ok": True, "conversaciones": conversaciones, "calendlys": calendlys}
