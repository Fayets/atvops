"""
Las llamadas grabadas con Fathom entran solas.

Fathom empuja cada reunión apenas termina de procesarla, con la transcripción
adentro. Acá se la lee, se sacan los campos del reporte del closer y se guardan
en la llamada que ya existe en el registro (`ReunionCrm`).

Dos reglas que no se negocian:

- **La IA propone, no pisa.** Si el closer ya cargó el resultado, no se toca:
  solo se guarda el reporte al lado. Se completa únicamente lo que está vacío.
  Un sistema que corrige a mano lo que cargó una persona deja de ser confiable
  a la primera vez que se equivoca.
- **El estado y el programa salen de las listas del sistema**, no de lo que a
  Claude le parezca. Si no encaja en ninguna, queda vacío y se avisa — un
  "Seguimiento?" inventado es peor que un campo en blanco, porque nadie lo
  revisa.

Este módulo no manda nada. Theo (OpenClaw) ya manda la lista de llamadas del día
al grupo de ventas; lo que hace `del_dia()` es devolverle esa misma lista con el
resumen al lado. Procesar en el webhook y no en la corrida de Theo es a propósito:
cuando Theo arranca a la mañana los resúmenes ya están hechos, así que no tiene
que leer transcripciones en el momento.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
from datetime import date, datetime, timedelta, timezone

from decouple import config
from pony.orm import db_session

from src.models import ReunionCrm
from src.services.transcripts_services import AR_TZ

log = logging.getLogger("atv_ops.fathom")

SECRETO = config("FATHOM_WEBHOOK_SECRET", default="")
# Fathom firma con el estándar de Standard Webhooks y manda el timestamp: fuera de
# esta ventana el aviso se rechaza, así un pedido viejo capturado no se puede repetir.
VENTANA_SEGUNDOS = 300
# Cuánto puede separarse la hora de la grabación de la reunión agendada para darlas
# por la misma. Una llamada que arranca 20 minutos tarde sigue siendo esa llamada.
MINUTOS_DE_GRACIA = 90


class AvisoNoAutorizado(Exception):
    """La firma no valida, falta el secreto o el aviso llegó fuera de la ventana."""


# --------------------------------------------------------------------- firma

def verificar_firma(cuerpo: bytes, headers) -> None:
    """Standard Webhooks: se firma `{id}.{timestamp}.{body}` con el secreto en base64.

    El secreto viene como `whsec_<base64>`; lo que se usa para el HMAC son los bytes
    decodificados de lo que sigue al prefijo.
    """
    if not SECRETO:
        raise AvisoNoAutorizado("Falta FATHOM_WEBHOOK_SECRET: el aviso no se puede verificar.")

    wid = (headers.get("webhook-id") or "").strip()
    wts = (headers.get("webhook-timestamp") or "").strip()
    firmas = (headers.get("webhook-signature") or "").strip()
    if not (wid and wts and firmas):
        raise AvisoNoAutorizado("Al aviso le faltan las cabeceras de firma.")

    try:
        edad = abs(int(datetime.now(timezone.utc).timestamp()) - int(wts))
    except ValueError:
        raise AvisoNoAutorizado("El timestamp del aviso no es un número.")
    if edad > VENTANA_SEGUNDOS:
        raise AvisoNoAutorizado(f"El aviso llegó {edad}s tarde; se descarta por las dudas.")

    crudo = SECRETO.split("_", 1)[1] if SECRETO.startswith("whsec_") else SECRETO
    try:
        clave = base64.b64decode(crudo)
    except Exception:  # noqa: BLE001
        raise AvisoNoAutorizado("FATHOM_WEBHOOK_SECRET no es base64 válido.")

    firmado = b"%s.%s." % (wid.encode(), wts.encode()) + cuerpo
    esperada = base64.b64encode(hmac.new(clave, firmado, hashlib.sha256).digest()).decode()
    # La cabecera puede traer varias firmas separadas por espacio, cada una `v1,<base64>`.
    for parte in firmas.split():
        _, _, valor = parte.partition(",")
        if hmac.compare_digest(valor or parte, esperada):
            return
    raise AvisoNoAutorizado("La firma del aviso no coincide.")


# ------------------------------------------------------------------ lectura

def _primero(d: dict, *claves, default=None):
    """Fathom fue cambiando nombres de campos; se prueban los que puede mandar."""
    for c in claves:
        if isinstance(d, dict) and d.get(c) not in (None, "", [], {}):
            return d[c]
    return default


def _texto_transcripcion(v) -> str:
    """La transcripción puede venir como texto plano o como lista de intervenciones."""
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        lineas = []
        for t in v:
            if isinstance(t, str):
                lineas.append(t)
            elif isinstance(t, dict):
                quien = _primero(t, "speaker", "speaker_name", "name", default="")
                if isinstance(quien, dict):
                    quien = _primero(quien, "display_name", "name", default="")
                dice = _primero(t, "text", "transcript", "content", default="")
                lineas.append(f"{quien}: {dice}".strip(": ").strip())
        return "\n".join(x for x in lineas if x)
    return ""


def _cuando(v) -> datetime | None:
    if not v:
        return None
    try:
        t = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return (t.astimezone(AR_TZ) if t.tzinfo else t.replace(tzinfo=timezone.utc).astimezone(AR_TZ)).replace(tzinfo=None)


def datos_de(payload: dict) -> dict:
    """Lo que necesitamos del aviso, sin atarnos a un solo nombre de campo."""
    reunion = _primero(payload, "meeting", "recording", default=payload) or {}
    if not isinstance(reunion, dict):
        reunion = {}
    grabo = _primero(payload, "recorded_by", default=_primero(reunion, "recorded_by", default={}))
    if isinstance(grabo, dict):
        grabo = _primero(grabo, "name", "display_name", "email", default="")

    invitados = _primero(payload, "invitees", "attendees", default=_primero(reunion, "invitees", "attendees", default=[])) or []
    gente = []
    for i in invitados if isinstance(invitados, list) else []:
        if isinstance(i, dict):
            gente.append({
                "nombre": _primero(i, "name", "display_name", default="") or "",
                "email": _primero(i, "email", default="") or "",
                "externo": bool(_primero(i, "is_external", "external", default=False)),
            })

    return {
        "titulo": _primero(payload, "title", "meeting_title", default=_primero(reunion, "title", default="")) or "",
        "url": _primero(payload, "url", "share_url", "recording_url", default=_primero(reunion, "url", default="")) or "",
        "inicio": _cuando(_primero(payload, "scheduled_start_time", "started_at", "recording_start_time", "created_at",
                                   default=_primero(reunion, "scheduled_start_time", "started_at", default=None))),
        "grabo": grabo or "",
        "invitados": gente,
        "transcripcion": _texto_transcripcion(_primero(payload, "transcript", "transcription",
                                                       default=_primero(reunion, "transcript", default=""))),
        "resumen": _primero(payload, "default_summary", "summary", default="") or "",
    }


# ------------------------------------------------------------------ extracción

SYSTEM = """Sos el asistente de ventas de ATV (agencia de growth para creadores y emprendedores).
Leés la transcripción de una llamada de venta y devolvés los campos del reporte del closer.

Devolvé ÚNICAMENTE un JSON:

{"lead": "nombre y apellido del prospecto, como se presentó",
 "estado": "<uno EXACTO de la lista de estados, o null>",
 "plan": "<uno EXACTO de la lista de programas, o null>",
 "cash_usd": <número o null>,
 "saldo_usd": <número o null>,
 "proximo_paso": "una línea: qué se comprometió cada parte y para cuándo, o null",
 "objecion": "la objeción que quedó sin resolver, en una línea, o null",
 "resumen": "2 líneas: en qué está el prospecto y por qué cerró o no"}

Reglas:
- estado y plan: SOLO valores de las listas que te paso. Si ninguno encaja con lo que
  realmente pasó, devolvé null. NO elijas el más parecido.
- "Cerrado" es que pagó o se comprometió a pagar el total. "Seña" es que pagó una parte.
  Si quedó en pensarlo o en volver a hablar, es "Seguimiento". Si no apareció, "No show".
  Si no tiene con qué pagar o no es el perfil, "Descalificado".
- cash_usd es lo que EFECTIVAMENTE entró o se comprometió en esta llamada, en dólares.
  Si hablaron en pesos y no dijeron el equivalente, devolvé null: no conviertas.
- Lo que dice el closer no es evidencia; lo que dice el prospecto sí.
- Si la transcripción está cortada o no es una llamada de venta, devolvé todo null y
  explicá por qué en resumen.
Sin texto fuera del JSON."""


def _listas() -> tuple[tuple[str, ...], list[str]]:
    from src.services.ventas_services import ESTADOS_LLAMADA, programas
    try:
        nombres = [p["nombre"] for p in programas()]
    except Exception:  # noqa: BLE001
        nombres = []
    return ESTADOS_LLAMADA, nombres


def extraer(datos: dict) -> dict:
    """Le pasa la transcripción a Claude y devuelve los campos, ya validados."""
    from src.services.activacion_ia_services import invocar_claude_texto

    estados, planes = _listas()
    contexto = [
        f"Título: {datos['titulo']}",
        f"Cuándo: {datos['inicio']:%d/%m/%Y %H:%M}" if datos.get("inicio") else "",
        f"Grabó: {datos['grabo']}",
        "Participantes: " + ", ".join(
            f"{i['nombre']} <{i['email']}>{' (externo)' if i['externo'] else ''}" for i in datos["invitados"]
        ) if datos["invitados"] else "",
        "",
        "## Estados posibles\n" + " | ".join(estados),
        "## Programas posibles\n" + (" | ".join(planes) or "(no hay catálogo cargado)"),
        "",
        "## Transcripción",
        datos["transcripcion"][:60_000],
    ]
    texto, meta = invocar_claude_texto(SYSTEM, "\n".join(x for x in contexto if x != ""))
    campos = _json_de(texto)
    return _validar(campos, estados, planes) | {"costoUsd": meta.get("costoUsd", 0.0)}


def _json_de(texto: str) -> dict:
    """Claude a veces envuelve el JSON en ``` o lo precede de una línea suelta."""
    t = (texto or "").strip()
    if "```" in t:
        m = re.search(r"```(?:json)?\s*(.*?)```", t, re.S)
        if m:
            t = m.group(1).strip()
    try:
        d = json.loads(t)
    except ValueError:
        m = re.search(r"\{.*\}", t, re.S)
        if not m:
            raise ValueError(f"La respuesta no trae JSON: {t[:200]}")
        d = json.loads(m.group(0))
    return d if isinstance(d, dict) else {}


def _validar(campos: dict, estados: tuple[str, ...], planes: list[str]) -> dict:
    """Un estado o un programa que no esté en la lista se descarta, no se aproxima."""
    def _de_la_lista(valor, opciones):
        v = str(valor or "").strip().lower()
        return next((o for o in opciones if o.lower() == v), None)

    def _numero(v):
        """Un monto, venga como número o como lo escribiría una persona.

        El punto es ambiguo: en "1.500" es separador de miles y en "1.5" es decimal.
        Se resuelve por posición — el separador más a la derecha manda, y uno solo
        seguido de exactamente tres dígitos es de miles. Sin esto, "US$ 1.500"
        entraba como 1,5 dólares y nadie lo iba a mirar.
        """
        if isinstance(v, (int, float)):
            return float(v)
        s = re.sub(r"[^\d.,]", "", str(v or ""))
        if not s:
            return None
        ultimo = max(s.rfind("."), s.rfind(","))
        if ultimo == -1:
            entero, decimales = s, ""
        elif s.count(".") + s.count(",") == 1 and len(s) - ultimo - 1 == 3:
            entero, decimales = s.replace(".", "").replace(",", ""), ""
        else:
            entero = re.sub(r"[.,]", "", s[:ultimo])
            decimales = re.sub(r"[^\d]", "", s[ultimo + 1:])
        try:
            return float(f"{entero or 0}.{decimales or 0}")
        except ValueError:
            return None

    def _linea(v, tope=300):
        s = str(v).strip() if v else ""
        return s[:tope] or None

    return {
        "lead": _linea(campos.get("lead"), 120),
        "estado": _de_la_lista(campos.get("estado"), estados),
        "plan": _de_la_lista(campos.get("plan"), planes),
        "cashUsd": _numero(campos.get("cash_usd")),
        "saldoUsd": _numero(campos.get("saldo_usd")),
        "proximoPaso": _linea(campos.get("proximo_paso")),
        "objecion": _linea(campos.get("objecion")),
        "resumen": _linea(campos.get("resumen"), 600),
    }


# ------------------------------------------------------------------ registro

def _emails_externos(datos: dict) -> set[str]:
    return {i["email"].lower() for i in datos["invitados"] if i["email"] and i["externo"]}


def buscar_reunion(datos: dict, campos: dict):
    """La llamada del registro que corresponde a esta grabación.

    Primero por el email del prospecto, que es la señal fuerte; si no, por cercanía
    en el tiempo. Se piden las dos cosas de a una y nunca se adivina por nombre
    parecido: aparear mal es peor que no aparear, porque escribe el resultado en la
    llamada de otro.
    """
    inicio = datos.get("inicio")
    if not inicio:
        return None
    desde, hasta = inicio - timedelta(minutes=MINUTOS_DE_GRACIA), inicio + timedelta(minutes=MINUTOS_DE_GRACIA)
    cerca = [r for r in list(ReunionCrm.select())
             if r.es_venta and not r.descartada and r.inicio_at and desde <= r.inicio_at <= hasta]
    if not cerca:
        return None

    emails = _emails_externos(datos)
    porrear = [r for r in cerca if (r.email or "").lower() in emails]
    if len(porrear) == 1:
        return porrear[0]
    if len(cerca) == 1:
        return cerca[0]
    return min(cerca, key=lambda r: abs((r.inicio_at - inicio).total_seconds()))


def _guardar(reunion, datos: dict, campos: dict) -> dict:
    """Escribe el reporte al lado y completa SOLO los campos que estén vacíos."""
    reunion.reporte_ia = json.dumps(campos, ensure_ascii=False)
    reunion.reporte_at = datetime.utcnow()
    reunion.fathom_url = (datos.get("url") or "")[:500] or None

    completados = []
    if not (reunion.resultado or "").strip() and campos["estado"]:
        reunion.resultado = campos["estado"]
        completados.append("resultado")
    if not (reunion.programa or "").strip() and campos["plan"]:
        reunion.programa = campos["plan"]
        completados.append("programa")
    if reunion.cash_usd in (None, 0) and campos["cashUsd"]:
        reunion.cash_usd = campos["cashUsd"]
        completados.append("cash")
    if not (reunion.nota or "").strip() and campos["resumen"]:
        reunion.nota = campos["resumen"]
        completados.append("nota")
    if completados:
        reunion.actualizado_por = "fathom"
        reunion.actualizado_at = datetime.utcnow()
    return {"completados": completados}


def mensaje(datos: dict, campos: dict, reunion=None) -> str:
    """El texto que Theo manda al grupo. Corto: se lee en un celular."""
    cuando = datos.get("inicio")
    lineas = [
        f"📞 *{campos['lead'] or datos['titulo'] or 'Llamada sin nombre'}*",
        f"_{cuando:%d/%m %H:%M}_" if cuando else "",
        "",
        f"*Estado:* {campos['estado'] or '⚠️ no se pudo determinar'}",
        f"*Plan:* {campos['plan']}" if campos["plan"] else "",
    ]
    if campos["cashUsd"]:
        saldo = f" (saldo US$ {campos['saldoUsd']:,.0f})" if campos["saldoUsd"] else ""
        lineas.append(f"*Cash:* US$ {campos['cashUsd']:,.0f}{saldo}")
    if campos["proximoPaso"]:
        lineas += ["", f"*Próximo paso:* {campos['proximoPaso']}"]
    if campos["objecion"]:
        lineas.append(f"*Objeción abierta:* {campos['objecion']}")
    if campos["resumen"]:
        lineas += ["", campos["resumen"]]
    if reunion is None:
        lineas += ["", "⚠️ No encontré esta llamada en el calendario: el reporte no quedó cargado."]
    if datos.get("url"):
        lineas += ["", datos["url"]]
    return "\n".join(x for x in lineas if x != "" or lineas[-1] != "").strip()


# ------------------------------------------------------------------ entrada

def recibir(cuerpo: bytes, headers) -> dict:
    """Punto de entrada del webhook: verifica, lee, extrae, guarda y deja el mensaje."""
    verificar_firma(cuerpo, headers)
    try:
        payload = json.loads(cuerpo.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise AvisoNoAutorizado("El cuerpo del aviso no es JSON.")

    datos = datos_de(payload if isinstance(payload, dict) else {})
    if not datos["transcripcion"]:
        # Sin transcripción no hay nada que leer. Se avisa en el log con el payload
        # entero para poder ajustar los nombres de campo si Fathom los cambió.
        log.warning("Aviso de Fathom sin transcripción: %s", json.dumps(payload)[:2000])
        return {"ok": False, "motivo": "El aviso llegó sin transcripción."}

    campos = extraer(datos)
    with db_session:
        reunion = buscar_reunion(datos, campos)
        guardado = _guardar(reunion, datos, campos) if reunion else {"completados": []}
        texto = mensaje(datos, campos, reunion)
        if reunion is not None:
            reunion.reporte_mensaje = texto
            reunion.reporte_enviado_at = None
        ident = reunion.evento_id if reunion else None
    log.info("Fathom: %s → %s (completó %s)", datos["titulo"], campos["estado"], guardado["completados"] or "nada")
    return {"ok": True, "eventoId": ident, "estado": campos["estado"], "mensaje": texto, **guardado}


# ------------------------------------------------------------------ para Theo

@db_session
def del_dia(fecha: date | None = None) -> dict:
    """Las llamadas de un día con su reporte al lado. Es lo que manda Theo al grupo.

    Devuelve TODAS las llamadas de venta del día, tengan reporte o no: una llamada
    que Fathom no grabó también es información — significa que nadie la va a poder
    reportar solo.
    """
    dia = fecha or datetime.now(AR_TZ).date()
    filas = [r for r in list(ReunionCrm.select())
             if r.es_venta and not r.descartada and r.inicio_at and r.inicio_at.date() == dia]
    filas.sort(key=lambda r: r.inicio_at)

    llamadas = []
    for r in filas:
        campos = json.loads(r.reporte_ia) if (r.reporte_ia or "").strip() else None
        llamadas.append({
            "eventoId": r.evento_id,
            "prospecto": campos["lead"] if campos and campos.get("lead") else (r.prospecto or ""),
            "hora": r.inicio_at.strftime("%H:%M"),
            "closer": r.closer or "",
            # Lo cargado manda sobre lo que leyó la IA: es lo que el equipo decidió.
            "estado": (r.resultado or "").strip() or (campos or {}).get("estado"),
            "plan": (r.programa or "").strip() or (campos or {}).get("plan"),
            "cashUsd": r.cash_usd if r.cash_usd else (campos or {}).get("cashUsd"),
            "proximoPaso": (campos or {}).get("proximoPaso"),
            "objecion": (campos or {}).get("objecion"),
            "grabada": campos is not None,
            "fathomUrl": r.fathom_url,
            "yaEnviado": r.reporte_enviado_at is not None,
        })
    return {
        "fecha": dia.isoformat(),
        "llamadas": llamadas,
        "sinGrabacion": sum(1 for x in llamadas if not x["grabada"]),
    }


@db_session
def marcar_enviados(ids: list[str]) -> int:
    """Theo avisa qué mandó. Sin esto, el mismo reporte saldría en cada corrida."""
    n = 0
    for ident in ids:
        r = ReunionCrm.get(evento_id=ident)
        if r is not None and r.reporte_enviado_at is None:
            r.reporte_enviado_at = datetime.utcnow()
            n += 1
    return n
