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
        "impresiones": impresiones, "clicks": clicks, "visitasLanding": visitas,
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
        "dropoffOptinTy": tasa(max(optins - thank_you, 0), optins),
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
            if "metricas" in datos and isinstance(datos.get("metricas"), dict):
                actual = _json(w.metricas, {})
                actual.update(datos["metricas"])
                w.metricas = _dump(actual)
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
                          "impresiones", "clicks", "visitasLanding", "optins", "thankYou",
                          "registros", "registrosDerivados", "entradasWhatsapp",
                          "agendasWebinar", "vivos", "shows",
                          "picoConcurrentes",
                          "retenidosPitch", "booked", "llamadasAgendadas", "showsLlamadas",
                          "cierres", "cashUsd", "pif", "gastoAdsUsd",
                      )}
        gasto = 0.0
        impresiones = 0
        clicks = 0
        leads_ads = 0
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
                        clicks += int(c.get("clicks") or 0)
                        leads_ads += int(c.get("leads") or 0)
                sync_ok = True
            except Exception as e:  # noqa: BLE001
                logger.warning("No se pudieron leer ads del webinar: %s", str(e)[:160])
        if sync_ok:
            crudas["impresiones"] = impresiones
            crudas["clicks"] = clicks
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

