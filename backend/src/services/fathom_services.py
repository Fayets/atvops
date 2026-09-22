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

Los tres primeros campos son EXACTAMENTE los que el closer tiene que cargar en ATV Ops
(Resultado, Programa, Cash cobrado) y el cuarto es su "Nota de la llamada". Devolvelos
de forma que el closer pueda copiarlos sin pensar.

Devolvé ÚNICAMENTE un JSON:

{"lead": "nombre y apellido del prospecto, como se presentó",
 "estado": "<uno EXACTO de la lista de estados, o null>",
 "plan": "<uno EXACTO de la lista de programas, o null>",
 "cash_usd": <número o null>,
 "nota": ["primera frase", "segunda frase"],
 "resumen": ["primera frase", "segunda frase"],
 "facturacion_usd": <lo que el prospecto dijo que factura por mes, en dólares, o null>,
 "pagos_acordados": <cuántos pagos quedaron acordados CON monto y fecha, o null>,
 "encaje_puntaje": <1 a 10, o null si no hay datos para juzgarlo>,
 "encaje_motivo": "UNA frase corta con el dato que sostiene el puntaje, sea alto o bajo",
 "desvio_oferta": "UNA frase: qué dijo el closer que NO coincide con el documento, o null",
 "saldo_usd": <número o null>,
 "proximo_paso": "una línea: qué se comprometió cada parte y para cuándo, o null",
 "objecion": "la objeción que quedó sin resolver, en una línea, o null"}

Reglas:
- estado y plan: SOLO valores de las listas que te paso. Si ninguno encaja con lo que
  realmente pasó, devolvé null. NO elijas el más parecido.
- Cómo elegir el estado:
  - **Cerrado** / **Seña**: NO elijas entre estos dos vos. Poné el que te parezca y
    completá `estructura_pago`, que es lo que decide.
  - **No tiene la plata**: no cerró y el motivo fue el dinero — no lo tiene, no le
    alcanza, tiene que juntarlo, está endeudado.
  - **Lo voy a pensar**: no cerró y el motivo fue duda o indecisión, sin una objeción
    concreta. Es el "déjame pensarlo", "lo hablo con mi mujer", "te aviso".
  - **Seguimiento**: no cerró y quedó un próximo paso concreto que NO es ninguno de los
    dos anteriores (esperar a un socio, mirar material, cobrar a un cliente suyo).
  - **Descalificado**: no es el perfil, no importa lo que diga de la plata.
  - **No show** / **No contesta**: no se conectó a la llamada.
- **"Seguimiento" es el último recurso, no el default.** Si el motivo real fue la plata
  o la duda, usá el estado específico: esa distinción es justamente lo que se quiere
  medir, y el closer no la va a tipear nunca. Vos tenés la transcripción y él no.
- **El nivel se decide PRIMERO por la banda de facturación, que es objetiva.** Buscá en
  qué banda cae lo que el prospecto dijo que factura por mes y ese es el nivel. Recién
  después mirá el avatar, para confirmarlo o para bajar el puntaje.
  **El precio y la duración que se dijeron en la llamada NO deciden el nivel.** Si el
  closer cobró un precio o prometió una duración que es de otro nivel, eso es un desvío
  y va en desvio_oferta — no es una razón para reclasificar la venta.
  **Error a evitar, que ya pasó:** el prospecto factura 15-20k/mes y el closer le cobró
  $15k por 6 meses. El nivel es **Mid** (banda 10-30k). NO es High: High arranca en
  +30k y 15-20k no está ni cerca de esa banda. Los $15k y los 6 meses son el desvío.
  Nunca escribas que una facturación está "en el borde" de una banda en la que no
  entra: si no entra, no entra.
- **desvio_oferta**: si el closer describió la oferta de una forma que contradice el
  documento, poné qué dijo mal. Ejemplos: le dijo que Mid dura 6 meses cuando dura 4;
  le prometió WhatsApp directo con Juan en un Mid, que es de High; le cobró un precio
  que no es el del nivel ni un plan de pago previsto.
  Es lo más caro de todo: el cliente entra esperando algo que no compró, y el que se
  come el problema es fulfillment dos meses después. Si todo lo que dijo coincide con
  el documento, va null. No lo fuerces: un desvío inventado hace que nadie mire los reales.
- facturacion_usd: lo que el prospecto dijo que factura POR MES, en dólares. Si dio un
  rango, el piso. Si habló de lo que factura un cliente suyo y no él, null. Si no lo
  dijo, null: no lo deduzcas del tamaño del negocio ni de los seguidores.
- **pagos_acordados**: contá cuántos pagos quedaron acordados con MONTO y MOMENTO
  definidos. Es contar, no juzgar.
  - Pagó los $14.000 de una → **1**
  - Pagó $7.500 y quedó $7.500 a 45 días → **2**
  - Pagó $6.000 y quedaron $5.000 y $3.000 en los meses siguientes → **3**
  - Puso $50 para reservar y el resto está por verse → **0**
  - No hubo venta o no se habló de plata → **null**
  **La palabra que usen en la llamada no decide.** Si le dicen "seña" a la primera de
  dos cuotas ya acordadas, son 2 pagos igual. Lo que cuenta es si el monto y el momento
  del resto ya están dichos.
- **encaje_puntaje**: si hubo venta (Cerrado o Seña), qué tan bien le calza la oferta,
  del 1 al 10. Mirá los dos chequeos de la nota de ofertas: banda de facturación y
  avatar. La escala, para que el número signifique lo mismo siempre:
  - **9-10**: los dos cierran con holgura. Es el avatar del nivel hecho persona.
  - **7-8**: cierran, con un detalle menor — está en el borde de la banda, o el equipo
    es más chico de lo típico.
  - **5-6**: uno de los dos falla, pero hay contexto que lo explica.
  - **3-4**: uno falla claro. La venta se va a sentir en fulfillment.
  - **1-2**: no debería habérsele vendido esto.
  - **null**: no hay con qué juzgarlo — no dijo a qué se dedica ni cuánto factura. No
    inventes un número para no dejarlo vacío.
  **encaje_motivo va SIEMPRE, encaje o no**: UNA sola frase, del largo de las de la
  nota. Lleva el dato que sostiene el veredicto,
  nunca la opinión. Citá los números que dijo en la llamada — facturación, tamaño del
  equipo, margen, gasto en ads — que es lo que hace que el veredicto se pueda discutir.
  **NO nombres el nivel en encaje_motivo**: el nivel lo decide el sistema y se muestra
  arriba. Vos poné solo los hechos, que es lo que se puede verificar.
  Sirve: "15-20k/mes, equipo de 5, margen 60%, ads con ROAS 1.2".
  Sirve: "factura $600/mes y todavía no tiene un solo cliente estable".
  No sirve: "es el avatar de Mid" — eso lo concluye el sistema, no vos.
  Lo que el closer dijo mal NO va acá: va en desvio_oferta.
  No sirve: "el avatar y la facturación dan para esta oferta".
  No sirve: "no parece el perfil".
- **cash_usd es lo que ENTRÓ en esta llamada**: la seña, el pago que hizo ahí. NO es el
  precio del programa ni lo que prometió pagar más adelante. Si pagó US$ 50 de seña de
  un programa de US$ 1.800, cash_usd es 50 y el resto va en la nota. Si no pagó nada,
  null. Si hablaron en pesos y no dijeron el equivalente, null: no conviertas.
- **nota: EXACTAMENTE DOS frases, cada una de una línea.** Ni tres ni una larga partida
  en dos. Qué pasó y cuál es el próximo paso. Escribilas como el closer apurado entre
  llamada y llamada: rioplatense, sin adornos, sin conectores de relleno. Es lo que se
  pega en el reporte, no un resumen ejecutivo — nada de "el prospecto manifestó".
  Ejemplo del largo exacto que se espera:
  ["Pagó $50 de seña y completa la reserva a fin de mes.",
   "Primer pago de $1.800 arranca el 30/11, Nick coordina."]
- **resumen: EXACTAMENTE DOS frases cortas**, del mismo largo que las de la nota. Dos
  elementos en la lista, no uno largo partido con punto y coma. Quién es el
  prospecto (a qué se dedica, en qué está) y por qué la llamada terminó como terminó. NO
  repitas los montos ni las fechas que ya pusiste en la nota: acá va el contexto que no
  se ve en los campos de arriba.
  Ejemplo:
  ["Storymaker colombiano ganando $600/mes, en transición a Growth Operator.",
   "Cerró seña por la charla previa con Cris, no por la oferta."]
- Lo que dice el closer no es evidencia; lo que dice el prospecto sí.
- Si la transcripción está cortada o no es una llamada de venta, devolvé todo null y
  explicá por qué en nota.
Sin texto fuera del JSON."""


def _nota_ofertas() -> str:
    """Los criterios de validación salen del cerebro, no del código.

    Las ofertas cambian: si vivieran en el prompt, cada cambio de precio o de avatar
    sería un deploy. En `cerebro/ventas/ofertas.md` los edita cualquiera desde Obsidian.
    """
    from src.services.cerebro_services import CEREBRO_DIR, SEMILLA_DIR

    for base in (CEREBRO_DIR, SEMILLA_DIR):
        ruta = base / "ventas" / "ofertas.md"
        try:
            texto = ruta.read_text(encoding="utf-8")
        except OSError:
            continue
        # Sin el frontmatter, que no le dice nada al modelo y ocupa tokens en cada llamada.
        return texto.split("---", 2)[-1].strip()[:6000]
    return "(no hay nota de ofertas cargada: no valides el encaje, devolvé encaje null)"


_BANDA = re.compile(r"^##\s+(.+?)\s+·", re.M)
_FACTURA = re.compile(r"\*\*Factura:\*\*\s*(.+)")


def _bandas() -> dict[str, tuple[float, float]]:
    """Las bandas de facturación de cada nivel, leídas de la nota de ofertas.

    Se parsean para poder decidir el nivel en código. Haiku no respeta la banda ni con
    la regla escrita ni con un contraejemplo: eligió High para alguien de 15-20k tres
    veces seguidas y después inventó que estaba "en el borde" de una banda en la que no
    entra. Una comparación numérica no se racionaliza.
    """
    nota = _nota_ofertas()
    bandas: dict[str, tuple[float, float]] = {}
    partes = _BANDA.split(nota)
    for nivel, cuerpo in zip(partes[1::2], partes[2::2]):
        m = _FACTURA.search(cuerpo)
        if not m:
            continue
        montos = [float(x) * (1000 if k else 1) for x, k in re.findall(r"\$?([\d.,]+)\s*(k)?", m.group(1), re.I)]
        if not montos:
            continue
        if m.group(1).strip().startswith("+"):
            bandas[nivel.strip()] = (montos[0], float("inf"))
        elif len(montos) >= 2:
            bandas[nivel.strip()] = (montos[0], montos[1])
    return bandas


def _nivel_por_banda(facturacion) -> str | None:
    """En qué nivel cae una facturación mensual. None si no hay dato o no encaja."""
    if not facturacion:
        return None
    for nivel, (piso, techo) in _bandas().items():
        if piso <= float(facturacion) < techo:
            return nivel
    return None


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
        "## Ofertas y cómo se valida una venta\n" + _nota_ofertas(),
        "",
        "## Transcripción",
        datos["transcripcion"][:60_000],
    ]
    texto, meta = invocar_claude_texto(SYSTEM, "\n".join(x for x in contexto if x != ""))
    campos = _json_de(texto)
    campos = _decidir_en_codigo(campos, planes)
    # El servicio devuelve la clave en snake_case; leerla como costoUsd dejaba
    # todas las extracciones registradas en cero.
    return _validar(campos, estados, planes) | {"costoUsd": meta.get("costo_usd", 0.0), "via": meta.get("via", "")}


def _decidir_en_codigo(campos: dict, planes: list[str]) -> dict:
    """Las dos decisiones que el modelo erraba sistemáticamente, hechas con reglas.

    El nivel sale de la banda de facturación y el estado de la estructura de pago. Las
    dos son mecánicas: una comparación numérica y un mapeo de tres casos. Lo que el
    modelo sí hace bien —leer qué factura y cómo quedó la plata— queda de su lado.
    """
    nivel = _nivel_por_banda(campos.get("facturacion_usd"))
    elegido = str(campos.get("plan") or "").strip()
    # Solo se pisa si el modelo eligió uno de los niveles nuevos o no eligió nada: una
    # venta cargada con un programa viejo puede ser un cliente que ya estaba adentro.
    if nivel and (not elegido or elegido in _bandas()):
        # El nivel sale de un título de la nota y el programa tiene que existir en el
        # catálogo: si alguien renombra "Mid Level" a "Mid" en Obsidian, `_validar` lo
        # descartaría sin decir nada y las ventas quedarían sin programa.
        if nivel not in planes:
            log.warning("El nivel %r de la nota de ofertas no está en el catálogo de "
                        "programas: la venta va a quedar sin programa.", nivel)
        campos["plan"] = nivel

    # Contar pagos acordados es un hecho; decidir si eso es "seña" o "cerrado" es la
    # regla de ATV, y la aplica el código. El modelo le creía a la palabra que usaban en
    # la llamada: a la primera de dos cuotas acordadas le decían seña y él la reportaba
    # como reserva.
    pagos = campos.get("pagos_acordados")
    try:
        pagos = int(pagos) if pagos is not None and str(pagos).strip() != "" else None
    except (TypeError, ValueError):
        pagos = None
    if pagos is not None and pagos >= 1:
        campos["estado"] = "Cerrado"
    elif pagos == 0:
        campos["estado"] = "Seña"
    return campos


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

    def _recortar(v, tope):
        """Corta por palabra y avisa con puntos suspensivos.

        Cortar en el carácter exacto parte la última palabra al medio y el mensaje
        parece roto, no resumido: en el grupo se leyó "...para e".
        """
        s = " ".join(str(v).split()) if v else ""
        if not s:
            return None
        if len(s) <= tope:
            return s
        corte = s.rfind(" ", 0, tope)
        return (s[:corte] if corte > tope // 2 else s[:tope]).rstrip(" ,;.") + "…"

    def _linea(v, tope=300):
        return _recortar(v, tope)

    def _puntaje(v):
        """Un entero del 1 al 10. Fuera de rango se descarta: un 12 o un 0 dicen que el
        modelo no estaba usando la escala, y quedarse con el número sería fingir que sí."""
        try:
            n = int(round(float(str(v).strip()))) if v is not None and str(v).strip() else None
        except (TypeError, ValueError):
            return None
        return n if n is not None and 1 <= n <= 10 else None

    def _veredicto(n):
        """El signo sale del puntaje, no de un juicio aparte del modelo.

        Pedirle las dos cosas invita a que se contradigan —un 9 con veredicto "no"— y
        después hay que decidir cuál gana. Con una sola fuente eso no puede pasar.
        """
        if n is None:
            return None
        return "ok" if n >= 8 else ("dudoso" if n >= 5 else "no")

    def _dos_frases(v, tope=125):
        """Dos frases cortas, unidas con un espacio.

        Pedir "máximo 200 caracteres" no funciona: Haiku devuelve el párrafo igual y el
        recorte lo corta. Una restricción de ESTRUCTURA —una lista de dos— sí la respeta,
        y de paso cada frase se acota sola. Si igual manda un string, se usa como venía.
        """
        if isinstance(v, str):
            return _recortar(v, tope * 2)
        if not isinstance(v, list):
            return None
        frases = [_recortar(x, tope) for x in v[:2] if str(x or "").strip()]
        return " ".join(f for f in frases if f) or None

    return {
        "lead": _linea(campos.get("lead"), 120),
        "estado": _de_la_lista(campos.get("estado"), estados),
        "plan": _de_la_lista(campos.get("plan"), planes),
        "cashUsd": _numero(campos.get("cash_usd")),
        "nota": _dos_frases(campos.get("nota")),
        "facturacionUsd": _numero(campos.get("facturacion_usd")),
        "pagosAcordados": campos.get("pagos_acordados"),
        "encajePuntaje": _puntaje(campos.get("encaje_puntaje")),
        "encaje": _veredicto(_puntaje(campos.get("encaje_puntaje"))),
        # 110 era muy corto para una justificación con evidencia: se cortaba justo donde
        # empezaba el dato que la sostiene.
        "encajeMotivo": _recortar(campos.get("encaje_motivo"), 160),
        "desvioOferta": _recortar(campos.get("desvio_oferta"), 160),
        "resumen": _dos_frases(campos.get("resumen")),
        "saldoUsd": _numero(campos.get("saldo_usd")),
        "proximoPaso": _linea(campos.get("proximo_paso")),
        "objecion": _linea(campos.get("objecion")),
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
    if not (reunion.nota or "").strip() and campos["nota"]:
        reunion.nota = campos["nota"]
        completados.append("nota")
    if completados:
        reunion.actualizado_por = "fathom"
        reunion.actualizado_at = datetime.utcnow()
    return {"completados": completados}


def _norm_estado(v) -> str:
    return str(v or "").strip().lower()


def mensaje(datos: dict, campos: dict, reunion=None) -> str:
    """El texto que Theo manda al grupo.

    Los tres campos de arriba son los MISMOS que pide ATV Ops para cargar el
    resultado (Resultado, Programa, Cash cobrado) y en el mismo orden, así cargar
    la llamada es copiar. Abajo va la nota, que es el cuarto campo del formulario.

    Lo que el equipo ya cargó le gana a lo que leyó la IA: si Nick puso otra cosa,
    el grupo tiene que ver lo que Nick puso, no una segunda versión que lo
    contradiga.
    """
    def cargado(atributo, campo):
        valor = getattr(reunion, atributo, None) if reunion is not None else None
        if isinstance(valor, str):
            valor = valor.strip() or None
        return valor if valor else campos.get(campo)

    estado = cargado("resultado", "estado")
    cash = cargado("cash_usd", "cashUsd")
    # El programa es la EXCEPCIÓN a "lo cargado manda": acá se muestra la oferta que la
    # llamada cerró de verdad, porque es lo que el grupo necesita ver. Lo que figura en
    # el registro suele ser un nombre viejo elegido de una lista, y si difiere hay que
    # decirlo en vez de tapar uno con el otro — esa diferencia es un error de carga que
    # además descuadra el saldo.
    plan = campos.get("plan") or (getattr(reunion, "programa", "") or "").strip() or None
    # La hora de la reunión agendada, que es la que el equipo reconoce; la de la
    # grabación arranca unos minutos después y no coincide con el calendario.
    cuando = (getattr(reunion, "inicio_at", None) if reunion is not None else None) or datos.get("inicio")
    quien = (getattr(reunion, "closer", "") if reunion is not None else "") or datos.get("grabo") or ""

    encabezado = f"*{campos['lead'] or datos['titulo'] or 'Llamada sin nombre'}*"
    if cuando:
        encabezado += f" · {cuando:%d/%m %H:%M}"
    if quien:
        encabezado += f" · {quien}"

    lineas = [encabezado, ""]
    lineas.append(f"*Resultado:* {estado}" if estado else "*Resultado:* no se pudo determinar")
    if plan:
        lineas.append(f"*Programa:* {plan}")
    lineas.append(f"*Cash cobrado:* US$ {cash:,.0f}" if cash else "*Cash cobrado:* —")

    # El encaje se muestra SIEMPRE que hubo venta, no solo cuando falla. Si solo aparece
    # el aviso malo, nadie sabe que la validación existe ni confía en ella el día que
    # salta. Lo que cambia es el signo, no la presencia.
    # El puntaje ya dice lo que decía el signo: un 7/10 no necesita un ícono al lado.
    if _norm_estado(estado) in ("cerrado", "seña", "sena") and campos.get("encaje"):
        # Siempre con texto: un "3/10" pelado es una alarma muda, no dice qué mirar.
        motivo = campos.get("encajeMotivo") or {
            "ok": "el avatar y la facturación dan para esta oferta",
            "dudoso": "algo no termina de cerrar",
            "no": "la oferta no le cierra a esta persona",
        }[campos["encaje"]]
        lineas.append(f"*Encaje:* {campos['encajePuntaje']}/10 · {motivo}")
    # Lo que el closer prometió mal es más caro que un mal encaje: el cliente entra
    # esperando algo que no compró y el problema aparece en fulfillment, ya cobrado.
    if campos.get("desvioOferta"):
        lineas.append(f"*Ojo:* {campos['desvioOferta']}")

    nota = campos.get("nota") or campos.get("proximoPaso")
    if nota:
        lineas += ["", f"_{nota}_"]
    if campos.get("resumen"):
        lineas += ["", f"*Resumen:* {campos['resumen']}"]
    if reunion is None:
        lineas += ["", "No la encontré en el calendario: el reporte no quedó cargado."]
    if datos.get("url"):
        lineas += ["", datos["url"]]
    return "\n".join(lineas).strip()


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
            # `reporte_enviado_at` NO se toca a propósito. Fathom reintenta los avisos
            # que fallan, y cada reintento volvería a encolar un reporte que el grupo
            # ya vio. Si la llamada nunca se reportó el campo ya está en None y sigue
            # en la cola; si ya salió, se actualiza el texto pero no se repite.
        ident = reunion.evento_id if reunion else None
    log.info("Fathom: %s → %s (completó %s)", datos["titulo"], campos["estado"], guardado["completados"] or "nada")
    return {"ok": True, "eventoId": ident, "estado": campos["estado"], "mensaje": texto,
            "pagosAcordados": campos.get("pagosAcordados"),
            "facturacionUsd": campos.get("facturacionUsd"), **guardado}


# ------------------------------------------------------------------ para Theo

@db_session
def pendientes() -> list[dict]:
    """Los reportes que todavía no salieron al grupo, del más viejo al más nuevo.

    Es la cola del aviso por llamada: Theo pregunta seguido, manda lo que haya y
    avisa qué mandó. Sin la marca de enviado, el mismo reporte saldría en cada
    corrida y el grupo se llenaría de repetidos.
    """
    filas = [r for r in list(ReunionCrm.select())
             if (r.reporte_mensaje or "").strip() and r.reporte_enviado_at is None]
    filas.sort(key=lambda r: r.reporte_at or datetime.min)
    return [{"eventoId": r.evento_id,
             "prospecto": r.prospecto,
             "closer": r.closer or "",
             "hora": r.inicio_at.strftime("%H:%M") if r.inicio_at else "",
             "mensaje": r.reporte_mensaje} for r in filas]


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


@db_session
def reencolar(ids: list[str]) -> int:
    """Vuelve a poner un reporte en la cola para que Theo lo mande de nuevo.

    Hace falta porque el aviso repetido de Fathom ya NO reencola nada: así se evita que
    un reintento repita la llamada en el grupo. Pero a veces se quiere justamente eso —
    cambió el formato del mensaje, o se corrigió el resultado— y sin esto la única salida
    era tocar la base a mano.
    """
    n = 0
    for ident in ids:
        r = ReunionCrm.get(evento_id=ident)
        if r is not None and (r.reporte_mensaje or "").strip():
            r.reporte_enviado_at = None
            n += 1
    return n
