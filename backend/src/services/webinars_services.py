"""
Webinars: cada evento es una entidad con su config, ads y métricas.

No hay webinars hardcodeados. Crear, duplicar, editar y listar. Las métricas de ads
salen de las campañas vinculadas; el resto del funnel (registros, show, booking) se
carga o sincroniza por webinar.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from fastapi import HTTPException
from pony.orm import db_session

logger = logging.getLogger("atv_ops.webinars")

ESTADOS = ("borrador", "configurado", "en_vivo", "finalizado")
CTA_TIPOS = ("call_funnel", "checkout", "formulario")

# Campos que se copian al duplicar (no fecha ni tema: eso se redefine).
_HEREDA = (
    "cta_tipo", "precio_usd", "landing_url", "thank_you_url", "calendly_url",
    "whatsapp_grupo", "campanias_ads", "benchmarks",
)


def _json(v, default):
    if not v:
        return default
    try:
        return json.loads(v)
    except (TypeError, json.JSONDecodeError):
        return default


def _dump(v) -> str:
    return json.dumps(v if v is not None else [], ensure_ascii=False)


def _esta_configurado(w) -> bool:
    return bool(w.nombre and w.fecha_hora and w.landing_url and w.calendly_url)


def _estado_sugerido(w, ahora: datetime) -> str:
    """Si el estado es automático (borrador/configurado) o por fecha (en vivo/finalizado)."""
    if w.estado == "finalizado":
        return "finalizado"
    if not _esta_configurado(w):
        return "borrador"
    if w.fecha_hora is None:
        return "configurado"
    # Ventana en vivo: desde 1h antes hasta 3h después del start.
    inicio = w.fecha_hora - timedelta(hours=1)
    fin = w.fecha_hora + timedelta(hours=3)
    if inicio <= ahora <= fin:
        return "en_vivo"
    if ahora > fin:
        return "finalizado"
    return "configurado"



# Qué campo del webinar corresponde a cada evento del script.
PISO_POR_CAMPO = {
    "visitasLanding": "pageview",
    "optins": "optin",
    "thankYou": "thank_you",
    "entradasWhatsapp": "whatsapp",
    "agendasWebinar": "calendario",
}


def _fijar_piso_del_script(webinar_id: int, metricas: dict) -> None:
    """Deja el contador del script en el número que alguien escribió a mano.

    No borra eventos ni inventa: guarda la diferencia entre lo tipeado y lo contado. El
    tablero muestra `contado + piso`, así que queda exactamente el número escrito, y cada
    evento nuevo se apila encima en vez de reemplazarlo.

    Si alguien escribe menos de lo ya contado, el piso queda negativo: es correcto, quiere
    decir que el script contó de más —reenvíos del formulario, pruebas— y esa corrección
    también tiene que sobrevivir a los eventos que vengan.
    """
    import json as _json_mod

    from pony.orm import db_session

    from src.models import Integracion
    from src.services.integraciones_services import _resumen_eventos

    pedidos = {PISO_POR_CAMPO[k]: v for k, v in metricas.items() if k in PISO_POR_CAMPO}
    if not pedidos:
        return
    try:
        with db_session:
            filas = [i for i in list(Integracion.select())
                     if i.webinar_id == int(webinar_id) and i.tipo == "landing"]
            if not filas:
                return  # sin script pegado, el número escrito vale tal cual
            fila = filas[0]
            contado = (_resumen_eventos([fila.id]).get(fila.id) or {}).get("counts") or {}
            try:
                piso = _json_mod.loads(fila.base or "{}")
                piso = piso if isinstance(piso, dict) else {}
            except (TypeError, ValueError):
                piso = {}
            for evento, valor in pedidos.items():
                try:
                    piso[evento] = int(valor) - int(contado.get(evento, 0))
                except (TypeError, ValueError):
                    continue
            fila.base = _json_mod.dumps(piso)
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo fijar el piso del script: %s", str(e)[:160])

def _metricas_completas(m: dict, gasto: float) -> dict:
    """Raw + derivadas del funnel de 3 fases."""
    def num(k, default=0):
        try:
            return float(m.get(k) if m.get(k) is not None else default)
        except (TypeError, ValueError):
            return float(default)

    def tasa(a, b):
        return round(a / b * 100, 1) if b else None

    def money(a, b):
        return round(a / b, 2) if b else None

    gasto = float(gasto or 0)
    impresiones = int(num("impresiones"))
    alcance = int(num("alcance"))
    clicks = int(num("clicks"))
    visitas = int(num("visitasLanding"))
    optins = int(num("optins"))
    thank_you = int(num("thankYou"))
    registros = int(num("registros"))
    whatsapp = int(num("entradasWhatsapp"))
    agendas = int(num("agendasWebinar"))
    vivos = int(num("vivos") or num("shows"))
    pico = int(num("picoConcurrentes"))
    retenidos = int(num("retenidosPitch") or num("retenidos"))
    booked = int(num("booked"))
    llamadas = int(num("llamadasAgendadas") or booked)
    shows_call = int(num("showsLlamadas"))
    cierres = int(num("cierres"))
    cash = num("cashUsd")
    pif = int(num("pif"))

    return {
        "impresiones": impresiones, "alcance": alcance, "clicks": clicks,
        "visitasLanding": visitas,
        "optins": optins, "thankYou": thank_you, "registros": registros,
        "registrosDerivados": bool(m.get("registrosDerivados")),
        "entradasWhatsapp": whatsapp, "agendasWebinar": agendas,
        "vivos": vivos, "shows": vivos,
        "picoConcurrentes": pico, "retenidosPitch": retenidos, "booked": booked,
        "llamadasAgendadas": llamadas, "showsLlamadas": shows_call,
        "cierres": cierres, "cashUsd": cash, "pif": pif,
        "gastoAdsUsd": round(gasto, 2),
        "ctr": tasa(clicks, impresiones), "cpc": money(gasto, clicks),
        # Optins = registros cuando no hay contador aparte (landing de webinar).
        "conversionLanding": tasa(optins or registros, visitas),
        # Frecuencia: cuántas veces vio el anuncio la misma persona. Cuando sube, el
        # costo por registro sube detrás sin que cambie nada más. Se recalcula sobre el
        # total y no se promedia entre campañas; con varias, el alcance se superpone y
        # el número sale algo bajo.
        "frecuencia": round(impresiones / alcance, 2) if alcance else None,
        # Sin un registro cargado aparte no hubo segundo paso que medir. Mostrar el
        # 100% que da dividir un número por sí mismo es peor que no mostrar nada.
        "tasaRegistro": None if m.get("registrosDerivados") else tasa(registros, optins),
        "tasaWhatsapp": tasa(whatsapp, registros),
        "tasaAgendaWebinar": tasa(agendas, registros),
        "costoPorRegistrante": money(gasto, registros),
        "showRate": tasa(vivos, registros),
        "retencionPitch": tasa(retenidos, pico or vivos),
        "bookingRate": tasa(booked, retenidos or vivos),
        "showRateCalls": tasa(shows_call, llamadas),
        "closeRate": tasa(cierres, shows_call or llamadas),
        "aov": money(cash, cierres),
        "pifRate": tasa(pif, cierres),
    }


def _semaforo_bajo(valor, verde_max, amarillo_max):
    if valor is None:
        return "off"
    if valor < verde_max:
        return "ok"
    if valor <= amarillo_max:
        return "warn"
    return "alert"


def _semaforo_alto(valor, verde_min, amarillo_min):
    if valor is None:
        return "off"
    if valor > verde_min:
        return "ok"
    if valor >= amarillo_min:
        return "warn"
    return "alert"


def _fases(m: dict, benchmarks: dict | None = None) -> list[dict]:
    """Tres secciones del dashboard con portada y semáforo."""
    bm = {
        "costoPorRegistrante": {"verdeMax": 10, "amarilloMax": 15},
        "showRate": {"verdeMin": 40, "amarilloMin": 25},
        "retencionPitch": {"verdeMin": 30, "amarilloMin": 20},
        "bookingRate": {"verdeMin": 25, "amarilloMin": 15},
        "closeRateCalls": {"verdeMin": 30, "amarilloMin": 20},
        "pifRate": {"verdeMin": 60, "amarilloMin": 30},
        **(benchmarks or {}),
    }
    s1 = _semaforo_bajo(m.get("costoPorRegistrante"),
                        bm["costoPorRegistrante"]["verdeMax"], bm["costoPorRegistrante"]["amarilloMax"])
    s_show = _semaforo_alto(m.get("showRate"), bm["showRate"]["verdeMin"], bm["showRate"]["amarilloMin"])
    s_ret = _semaforo_alto(m.get("retencionPitch"), bm["retencionPitch"]["verdeMin"], bm["retencionPitch"]["amarilloMin"])
    s_book = _semaforo_alto(m.get("bookingRate"), bm["bookingRate"]["verdeMin"], bm["bookingRate"]["amarilloMin"])
    orden = {"alert": 0, "warn": 1, "ok": 2, "off": 3}
    s2 = sorted([s_show, s_ret, s_book], key=lambda x: orden[x])[0]
    s3 = "off"
    if m.get("llamadasAgendadas") or m.get("cierres") or m.get("cashUsd"):
        s3 = _semaforo_alto(m.get("closeRate"), bm["closeRateCalls"]["verdeMin"], bm["closeRateCalls"]["amarilloMin"])
        if (m.get("cierres") or 0) > 0 and not m.get("cashUsd"):
            s3 = "alert"
        pif = m.get("pifRate")
        if pif is not None:
            s_pif = _semaforo_alto(pif, bm["pifRate"]["verdeMin"], bm["pifRate"]["amarilloMin"])
            s3 = sorted([s3, s_pif], key=lambda x: orden[x])[0]

    return [
        {
            "id": "registro", "n": 1, "titulo": "Registro",
            "portadaKey": "costoPorRegistrante", "portadaLabel": "Costo / registrante",
            "portadaValor": m.get("costoPorRegistrante"), "portadaFormato": "usd",
            "semaforo": s1,
        },
        {
            "id": "dia", "n": 2, "titulo": "Día del webinar",
            "portadaKey": "showRate", "portadaLabel": "Show rate",
            "portadaValor": m.get("showRate"), "portadaFormato": "pct",
            "semaforo": s2,
        },
        {
            "id": "post", "n": 3, "titulo": "Post-webinar",
            "portadaKey": "cashUsd", "portadaLabel": "Cash collected",
            "portadaValor": m.get("cashUsd"), "portadaFormato": "usd",
            "semaforo": s3,
        },
    ]


def _metricas_funnel(m: dict, gasto: float) -> dict:
    return _metricas_completas(m, gasto)


def _a_dict(w, ahora: datetime | None = None, con_detalle: bool = False) -> dict:
    ahora = ahora or datetime.utcnow()
    campanias = _json(w.campanias_ads, [])
    metricas_raw = _json(w.metricas, {})
    benchmarks = _json(w.benchmarks, {})
    estado = _estado_sugerido(w, ahora)
    # Gasto de ads se completa en listar/detalle cuando hay sync; acá usa lo cacheado.
    gasto = float(metricas_raw.get("gastoAdsUsd") or 0)
    principales = _metricas_funnel(metricas_raw, gasto)
    base = {
        "id": w.id,
        "nombre": w.nombre,
        "estado": estado,
        "estadoGuardado": w.estado,
        "fechaHora": w.fecha_hora.isoformat(sep=" ") if w.fecha_hora else None,
        "tema": w.tema or "",
        "ctaTipo": w.cta_tipo,
        "zoomWebinarId": w.zoom_webinar_id,
        "precioUsd": float(w.precio_usd or 0),
        "landingUrl": w.landing_url or "",
        "thankYouUrl": w.thank_you_url or "",
        "calendlyUrl": w.calendly_url or "",
        "whatsappGrupo": w.whatsapp_grupo or "",
        "campaniasAds": campanias,
        "benchmarks": benchmarks,
        "metricas": principales,
        "fases": _fases(principales, benchmarks),
        "plantillaDeId": w.plantilla_de_id,
        "creadoPor": w.creado_por,
        "creadoAt": w.creado_at.isoformat() if w.creado_at else None,
        "actualizadoAt": w.actualizado_at.isoformat() if w.actualizado_at else None,
        "configurado": _esta_configurado(w),
    }
    if con_detalle:
        base["notas"] = w.notas or ""
        base["metricasCrudas"] = metricas_raw
    return base


def _parse_fecha(v):
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v
    s = str(v).strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:19] if len(s) > 10 else s, fmt)
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail=f"Fecha inválida: {v!r}")


def _limpiar_campanias(raw) -> list[dict]:
    if not isinstance(raw, list):
        return []
    salida = []
    for c in raw:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("id") or "").strip()
        if not cid:
            continue
        salida.append({"id": cid, "nombre": str(c.get("nombre") or cid).strip()})
    return salida


class WebinarsServices:
    def listar(self) -> list[dict]:
        from src.models import Webinar

        ahora = datetime.utcnow()
        with db_session:
            filas = [w for w in list(Webinar.select()) if w.borrado_at is None]
            filas.sort(key=lambda w: w.fecha_hora or w.creado_at, reverse=True)
            return [_a_dict(w, ahora) for w in filas]

    def obtener(self, webinar_id: int) -> dict:
        from src.models import Webinar

        with db_session:
            w = Webinar.get(id=webinar_id)
            if w is None or w.borrado_at is not None:
                raise HTTPException(status_code=404, detail="Ese webinar no existe.")
            data = _a_dict(w, con_detalle=True)
        data["metricas"] = self._enriquecer_ads(data)
        return data

    def crear(self, datos: dict, usuario: dict) -> dict:
        from src.models import Webinar

        nombre = str(datos.get("nombre") or "").strip()
        if not nombre:
            raise HTTPException(status_code=400, detail="El webinar necesita un nombre.")
        cta = str(datos.get("ctaTipo") or "call_funnel").strip()
        if cta not in CTA_TIPOS:
            raise HTTPException(status_code=400, detail=f"CTA inválido: {cta}")
        estado = str(datos.get("estado") or "borrador").strip()
        if estado not in ESTADOS:
            estado = "borrador"
        campanias = _limpiar_campanias(datos.get("campaniasAds"))
        ahora = datetime.utcnow()
        with db_session:
            w = Webinar(
                nombre=nombre[:200],
                estado=estado,
                fecha_hora=_parse_fecha(datos.get("fechaHora")),
                tema=(str(datos.get("tema") or "").strip() or None),
                cta_tipo=cta,
                precio_usd=max(0.0, float(datos.get("precioUsd") or 0)),
                landing_url=(str(datos.get("landingUrl") or "").strip() or None),
                thank_you_url=(str(datos.get("thankYouUrl") or "").strip() or None),
                calendly_url=(str(datos.get("calendlyUrl") or "").strip() or None),
                whatsapp_grupo=(str(datos.get("whatsappGrupo") or "").strip() or None),
                campanias_ads=_dump(campanias),
                benchmarks=_dump(datos.get("benchmarks") or {}),
                zoom_webinar_id=(str(datos.get("zoomWebinarId") or "").strip() or None),
                metricas=_dump(datos.get("metricas") or {}),
                plantilla_de_id=int(datos["plantillaDeId"]) if datos.get("plantillaDeId") else None,
                notas=(str(datos.get("notas") or "").strip() or None),
                creado_por=usuario.get("username"),
                actualizado_por=usuario.get("username"),
                creado_at=ahora,
                actualizado_at=ahora,
            )
            if _esta_configurado(w) and w.estado == "borrador":
                w.estado = "configurado"
            w.flush()
            data = _a_dict(w, ahora, con_detalle=True)
        # Token de tracking listo apenas se crea el webinar.
        try:
            from src.services.integraciones_services import IntegracionesServices
            IntegracionesServices().asegurar_para_webinar(data["id"], usuario)
        except Exception as e:  # noqa: BLE001
            logger.warning("No se pudo crear tracking del webinar: %s", str(e)[:160])
        data["metricas"] = self._enriquecer_ads(data)
        return data

    def vivo(self, webinar_id: int) -> dict:
        """Cómo viene el webinar ahora, según los avisos que Zoom fue mandando."""
        from src.models import Webinar
        from src.services import zoom_services

        with db_session:
            w = Webinar.get(id=webinar_id, borrado_at=None)
            if w is None:
                raise HTTPException(status_code=404, detail="No existe ese webinar.")
            zoom_id = w.zoom_webinar_id
            crudas = _json(w.metricas, {})

        # Cuántos registrados tiene este webinar, con la misma cuenta que muestra la
        # Los dos números de arriba del embudo, que no son el mismo.
        #
        # Opt-ins: dejaron el mail en la landing. Los cuenta el script de tracking, no
        # están guardados en el webinar, así que hay que pedírselos.
        #
        # Confirmados: reservaron lugar en el evento. Es manual, porque esa confirmación
        # pasa fuera del sistema. Cuando está cargado manda ese: es el denominador
        # honesto de la sala y del show rate, porque son los que dijeron que venían.
        # Cuando no —una landing de un paso, donde el opt-in ES el registro— se toma el
        # opt-in, que ahí sí es la misma gente.
        optins = 0
        try:
            from src.services.integraciones_services import IntegracionesServices

            tracking = IntegracionesServices().metricas_tracking_webinar(webinar_id)
            optins = int((tracking or {}).get("optins") or 0)
        except Exception as e:  # noqa: BLE001 — sin esto la sala igual se dibuja
            logger.info("Opt-ins del vivo: %s", str(e)[:160])
        optins = optins or int(crudas.get("optins") or 0)
        registros = int(crudas.get("registros") or 0) or optins

        if not zoom_id:
            raise HTTPException(status_code=400,
                                detail="Falta el ID del webinar en Zoom. Se carga en Configurar.")
        minuto_pitch = crudas.get("minutoPitch")
        minuto_pitch = int(minuto_pitch) if str(minuto_pitch or "").strip().isdigit() else None
        r = zoom_services.vivo(zoom_id, minuto_pitch)

        # La sala es la gente de Zoom: los inscriptos ahí más los que entraron. No se
        # completa hasta los confirmados —eran ciento ochenta y siete butacas grises sin
        # nombre, que ocupan toda la pantalla y no se pueden mirar—. Los confirmados
        # siguen estando, en el show rate y en el embudo, que es donde ese número dice algo.
        butacas = list(r.get("butacas") or [])

        # Los webhooks solo avisan de quien entra DESPUÉS de que la suscripción existe:
        # si se activa con el webinar empezado, los que ya estaban adentro no generan
        # ningún evento y el contador arranca en cero con la sala llena.
        #
        # `conectadosOffset` tapa ese agujero. Es un ajuste, no un número fijo: se
        # calcula cuando alguien corrige "conectados ahora" —lo que puso menos lo que
        # estábamos midiendo en ese momento— y se suma de ahí en adelante. Por eso las
        # salidas siguen restando: lo medido cambia, el ajuste no.
        vivos_a_mano = int(crudas.get("vivos") or 0)
        pico_a_mano = int(crudas.get("picoConcurrentes") or 0)
        offset = int(crudas.get("conectadosOffset") or 0)

        medidos_dentro = int(r.get("conectados") or 0)
        medidos_distintos = int(r.get("distintos") or 0)
        medido_pico = int(r.get("picoConcurrentes") or 0)

        # Solo mientras pasa: una vez terminado, los números cargados son los
        # definitivos —salen del reporte— y sumarles lo medido los contaría dos veces.
        sin_escuchar = (max(offset, vivos_a_mano - medidos_distintos, 0)
                        if r.get("enVivo") else 0)

        # Terminado el webinar, mandan los números del reporte. Los webhooks solo
        # cuentan desde que se prendieron y pueden haber empezado tarde; el reporte es
        # la lista completa. Dejar el del webhook al lado del de la Fase 2 sería mostrar
        # dos verdades distintas del mismo webinar en pantallas contiguas.
        if not r.get("enVivo") and (vivos_a_mano or pico_a_mano):
            r = {
                **r,
                "distintos": vivos_a_mano or medidos_distintos,
                "picoConcurrentes": pico_a_mano or medido_pico,
                "delReporte": True,
            }
        if sin_escuchar or pico_a_mano:
            r = {
                **r,
                "conectados": medidos_dentro + sin_escuchar,
                "distintos": max(vivos_a_mano, medidos_distintos + sin_escuchar),
                "picoConcurrentes": max(medido_pico + sin_escuchar, pico_a_mano),
                "sinEscuchar": sin_escuchar,
            }
            butacas.extend(
                {"nombre": None, "email": None, "estado": "adentro", "inscripto": False}
                for _ in range(sin_escuchar)
            )
        # Lo que se está midiendo de verdad, para que la pantalla pueda calcular el
        # ajuste cuando alguien corrija el número.
        r = {**r, "medidosDentro": medidos_dentro}

        # El embudo del vivo: los cinco saltos, con lo que hay. `booked` es manual y
        # puede estar en cero durante el vivo; se muestra igual para que el último
        # escalón no aparezca recién cuando alguien lo carga.
        en_pitch = next((x["conectados"] for x in (r.get("tramos") or [])
                         if minuto_pitch and x["minuto"] == minuto_pitch), None)
        booked = int(crudas.get("booked") or 0)
        embudo = [
            {"label": "Opt-ins", "n": optins, "nota": "dejaron el mail en la landing"},
            *([{"label": "Confirmados", "n": registros,
                "nota": "reservaron lugar en el evento"}]
              if registros and registros != optins else []),
            {"label": "Inscriptos", "n": r.get("inscriptos") or 0, "nota": "confirmaron lugar en Zoom"},
            {"label": "Entraron", "n": r.get("distintos") or 0, "nota": "pisaron el vivo"},
            *([{"label": "Al pitch", "n": en_pitch,
                "nota": f"seguían al minuto {minuto_pitch}"}] if en_pitch is not None else []),
            {"label": "Agendaron", "n": booked, "nota": "tomaron el CTA"},
        ]
        return {**r, "butacas": butacas, "registros": registros, "embudo": embudo,
                "minutoPitch": minuto_pitch, "enElPitch": en_pitch, "booked": booked,
                "optins": optins}

    def sincronizar_zoom(self, webinar_id: int, usuario: dict) -> dict:
        """Trae la asistencia real de Zoom y llena los números de la Fase 2.

        Pisa vivos y pico porque son medidos y nadie los sabe mejor que el reporte. No
        toca `booked`, que sale del cierre y no de la asistencia. Y si todavía no está
        cargado el minuto del pitch, deja retenidos como estaba: mejor el número viejo
        que uno calculado contra un momento inventado.
        """
        from src.models import Webinar
        from src.services import zoom_services

        with db_session:
            w = Webinar.get(id=webinar_id, borrado_at=None)
            if w is None:
                raise HTTPException(status_code=404, detail="No existe ese webinar.")
            zoom_id = w.zoom_webinar_id
            minuto = _json(w.metricas, {}).get("minutoPitch")

        if not zoom_id:
            raise HTTPException(
                status_code=400,
                detail="Falta el ID del webinar en Zoom. Se carga en Configurar.",
            )

        minuto = int(minuto) if str(minuto or "").strip().isdigit() and int(minuto) > 0 else None
        r = zoom_services.resumen_del_dia(zoom_id, minuto)

        nuevos = {"vivos": r["vivos"], "picoConcurrentes": r["picoConcurrentes"]}
        if r["retenidosPitch"] is not None:
            nuevos["retenidosPitch"] = r["retenidosPitch"]

        with db_session:
            w = Webinar.get(id=webinar_id, borrado_at=None)
            actual = _json(w.metricas, {})
            actual.update(nuevos)
            w.metricas = _dump(actual)
            w.actualizado_por = usuario.get("username") or ""
            w.actualizado_at = datetime.utcnow()

        data = self.obtener(webinar_id)
        # Un solo aviso, el más urgente primero: sin minuto no hay retención; con el
        # arranque estimado la retención existe pero puede estar corrida.
        if not minuto:
            aviso = "Cargá el minuto en que arrancó el pitch para que se calcule la retención."
        elif r.get("arranqueEstimado"):
            aviso = ("Zoom no dio el arranque real de la sesión: se tomó el primer ingreso, "
                     "que suele ser el del anfitrión. La retención puede estar corrida.")
        elif r.get("sinEmail"):
            aviso = (f"{r['sinEmail']} de los {r['vivos']} que entraron no tienen email en Zoom: "
                     "entraron por link directo en vez de registrarse, así que no se pueden "
                     "cruzar contra los leads.")
        else:
            aviso = None

        return {**data, "zoom": r, "aviso": aviso}

    def actualizar(self, webinar_id: int, datos: dict, usuario: dict) -> dict:
        from src.models import Webinar

        with db_session:
            w = Webinar.get(id=webinar_id)
            if w is None or w.borrado_at is not None:
                raise HTTPException(status_code=404, detail="Ese webinar no existe.")
            if "nombre" in datos:
                nombre = str(datos.get("nombre") or "").strip()
                if not nombre:
                    raise HTTPException(status_code=400, detail="El webinar necesita un nombre.")
                w.nombre = nombre[:200]
            if "fechaHora" in datos:
                w.fecha_hora = _parse_fecha(datos.get("fechaHora"))
            if "tema" in datos:
                w.tema = str(datos.get("tema") or "").strip() or None
            if "ctaTipo" in datos:
                cta = str(datos.get("ctaTipo") or "").strip()
                if cta not in CTA_TIPOS:
                    raise HTTPException(status_code=400, detail=f"CTA inválido: {cta}")
                w.cta_tipo = cta
            if "precioUsd" in datos:
                w.precio_usd = max(0.0, float(datos.get("precioUsd") or 0))
            if "landingUrl" in datos:
                w.landing_url = str(datos.get("landingUrl") or "").strip() or None
            if "thankYouUrl" in datos:
                w.thank_you_url = str(datos.get("thankYouUrl") or "").strip() or None
            if "calendlyUrl" in datos:
                w.calendly_url = str(datos.get("calendlyUrl") or "").strip() or None
            if "whatsappGrupo" in datos:
                w.whatsapp_grupo = str(datos.get("whatsappGrupo") or "").strip() or None
            if "campaniasAds" in datos:
                w.campanias_ads = _dump(_limpiar_campanias(datos.get("campaniasAds")))
            if "benchmarks" in datos and isinstance(datos.get("benchmarks"), dict):
                w.benchmarks = _dump(datos["benchmarks"])
            if "zoomWebinarId" in datos:
                # Zoom lo muestra con guiones y espacios ("123 4567 8901"): se limpia acá
                # y no en la pantalla, así vale para cualquiera que pegue por API.
                crudo = "".join(ch for ch in str(datos.get("zoomWebinarId") or "") if ch.isdigit())
                w.zoom_webinar_id = crudo or None
            if "metricas" in datos and isinstance(datos.get("metricas"), dict):
                actual = _json(w.metricas, {})
                actual.update(datos["metricas"])
                w.metricas = _dump(actual)
                # Los campos que cuenta el script no se pueden escribir a mano: el
                # siguiente evento los vuelve a pisar. Lo que se escribe se guarda como
                # piso de la integración —la diferencia entre lo tipeado y lo que el
                # script lleva contado— así el tablero muestra ese número y sigue
                # sumando encima. Es el caso de una landing que ya venía midiendo con
                # su propio contador antes de que le pegaran el script.
                _fijar_piso_del_script(w.id, datos["metricas"])
            if "notas" in datos:
                w.notas = str(datos.get("notas") or "").strip() or None
            if "estado" in datos:
                est = str(datos.get("estado") or "").strip()
                if est not in ESTADOS:
                    raise HTTPException(status_code=400, detail=f"Estado inválido: {est}")
                w.estado = est
            elif _esta_configurado(w) and w.estado == "borrador":
                w.estado = "configurado"
            w.actualizado_por = usuario.get("username")
            w.actualizado_at = datetime.utcnow()
            w.flush()
            data = _a_dict(w, con_detalle=True)
        data["metricas"] = self._enriquecer_ads(data)
        return data

    def duplicar(self, webinar_id: int, usuario: dict, overrides: dict | None = None) -> dict:
        """Nueva copia heredando config; fecha/tema/nombre se pueden pisar."""
        from src.models import Webinar

        overrides = overrides or {}
        with db_session:
            origen = Webinar.get(id=webinar_id)
            if origen is None or origen.borrado_at is not None:
                raise HTTPException(status_code=404, detail="Ese webinar no existe.")
            base = {
                "nombre": overrides.get("nombre") or f"Copia de {origen.nombre}",
                "tema": overrides.get("tema", origen.tema),
                "fechaHora": overrides.get("fechaHora"),
                "ctaTipo": origen.cta_tipo,
                "zoomWebinarId": None,  # cada evento tiene el suyo: no se hereda al duplicar
                "precioUsd": origen.precio_usd,
                "landingUrl": origen.landing_url,
                "thankYouUrl": origen.thank_you_url,
                "calendlyUrl": overrides.get("calendlyUrl", origen.calendly_url),
                "whatsappGrupo": origen.whatsapp_grupo,
                "campaniasAds": overrides.get("campaniasAds", _json(origen.campanias_ads, [])),
                "benchmarks": _json(origen.benchmarks, {}),
                "plantillaDeId": origen.id,
                "estado": "borrador",
            }
        return self.crear(base, usuario)

    def borrar(self, webinar_id: int, usuario: dict) -> dict:
        from src.models import Webinar

        with db_session:
            w = Webinar.get(id=webinar_id)
            if w is None or w.borrado_at is not None:
                raise HTTPException(status_code=404, detail="Ese webinar no existe.")
            w.borrado_at = datetime.utcnow()
            w.actualizado_por = usuario.get("username")
            return {"ok": True, "id": webinar_id}

    def _enriquecer_ads(self, data: dict) -> dict:
        """Suma gasto, impresiones y clicks de las campañas Meta vinculadas."""
        campanias = data.get("campaniasAds") or []
        ids = {str(c.get("id")) for c in campanias if c.get("id")}
        crudas = dict(data.get("metricasCrudas") or {})
        # Si no hay crudas (listado sin detalle), partir de lo ya derivado.
        if not crudas and data.get("metricas"):
            crudas = {k: v for k, v in (data["metricas"] or {}).items()
                      if k in (
                          "impresiones", "alcance", "clicks", "visitasLanding", "optins",
                          "thankYou",
                          "registros", "registrosDerivados", "entradasWhatsapp",
                          "agendasWebinar", "vivos", "shows",
                          "picoConcurrentes",
                          "retenidosPitch", "booked", "llamadasAgendadas", "showsLlamadas",
                          "cierres", "cashUsd", "pif", "gastoAdsUsd",
                      )}
        gasto = 0.0
        impresiones = 0
        alcance = 0
        clicks = 0
        leads_ads = 0
        # Campaña por campaña, para poder abrir el número combinado y ver de dónde sale.
        detalle_campanias: list[dict] = []
        sync_ok = False
        if ids:
            try:
                from src.services.meta_services import MetaServices
                mes = None
                if data.get("fechaHora"):
                    mes = str(data["fechaHora"])[:7]
                resumen = MetaServices().ads_resumen(mes)
                for c in resumen.get("campanias") or []:
                    if str(c.get("id")) in ids:
                        gasto += float(c.get("gastoUsd") or 0)
                        impresiones += int(c.get("impresiones") or 0)
                        alcance += int(c.get("alcance") or 0)
                        clicks += int(c.get("clicks") or 0)
                        detalle_campanias.append({
                            "id": str(c.get("id")),
                            "nombre": c.get("nombre") or str(c.get("id")),
                            "estado": c.get("estado") or "",
                            "impresiones": int(c.get("impresiones") or 0),
                            "alcance": int(c.get("alcance") or 0),
                            "clicks": int(c.get("clicks") or 0),
                            "gastoUsd": float(c.get("gastoUsd") or 0),
                            "frecuencia": float(c.get("frecuencia") or 0) or None,
                        })
                        leads_ads += int(c.get("leads") or 0)
                sync_ok = True
            except Exception as e:  # noqa: BLE001
                logger.warning("No se pudieron leer ads del webinar: %s", str(e)[:160])
        if sync_ok:
            crudas["impresiones"] = impresiones
            crudas["alcance"] = alcance
            crudas["clicks"] = clicks
            data["campaniasMetricas"] = sorted(
                detalle_campanias, key=lambda c: -(c["impresiones"] or 0))
        elif not gasto:
            gasto = float(crudas.get("gastoAdsUsd") or (data.get("metricas") or {}).get("gastoAdsUsd") or 0)
        if leads_ads:
            crudas["leadsAds"] = leads_ads

        # Visitas / optins / TY / WhatsApp desde el script de tracking.
        try:
            from src.services.integraciones_services import IntegracionesServices
            tracking = IntegracionesServices().metricas_tracking_webinar(int(data["id"]))
            if tracking is not None:
                crudas["visitasLanding"] = tracking["visitasLanding"]
                if tracking["optins"]:
                    crudas["optins"] = tracking["optins"]
                elif not int(crudas.get("optins") or 0) and int(crudas.get("registros") or 0):
                    crudas["optins"] = int(crudas["registros"])
                # En una landing de un paso —completás el formulario y ya estás
                # registrado— el opt-in ES el registro. Si nadie cargó un número aparte,
                # se toma ese: si no, todo lo que divide por registros (costo por
                # registrante, show rate, entrada a WhatsApp) queda mudo para siempre
                # esperando un dato que nadie va a escribir. Un número cargado a mano
                # siempre gana, que es el caso del embudo con confirmación aparte.
                if not int(crudas.get("registros") or 0) and int(crudas.get("optins") or 0):
                    crudas["registros"] = int(crudas["optins"])
                    crudas["registrosDerivados"] = True
                if tracking["thankYou"]:
                    crudas["thankYou"] = tracking["thankYou"]
                if tracking["entradasWhatsapp"]:
                    crudas["entradasWhatsapp"] = tracking["entradasWhatsapp"]
                if tracking["agendasWebinar"]:
                    crudas["agendasWebinar"] = tracking["agendasWebinar"]
                # Cuántos eventos hay de verdad, sin las deducciones de arriba. Lo usa el
                # botón de poner en cero: contar sobre los números mostrados lo haría
                # ofrecer borrar siete eventos que no existen, porque `optins` puede
                # venir deducido de los registros.
                data["trackingEventos"] = (
                    int(tracking["visitasLanding"])
                    + int(tracking["optins"])
                    + int(tracking["thankYou"])
                    + int(tracking["entradasWhatsapp"])
                    + int(tracking["agendasWebinar"])
                )
        except Exception as e:  # noqa: BLE001
            logger.warning("No se pudieron leer visitas de tracking: %s", str(e)[:160])

        completas = _metricas_completas(crudas, gasto)
        data["metricas"] = completas
        data["fases"] = _fases(completas, data.get("benchmarks"))
        return completas

