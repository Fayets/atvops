"""
Ads por campaña: qué corre, cómo le va a cada creativo y si trae seguidores.

La pantalla vieja mostraba leads y CPL a todo, y una campaña de seguidores no tiene leads:
quedaba en cero y no se podía decidir nada. Acá cada campaña se mide por lo que optimiza
(visitas al perfil, leads o clicks) y los creativos se comparan entre sí con un veredicto que
calcula el código, no la IA.

Dos límites de Meta que mandan sobre el diseño:

- **Meta no dice cuántos seguidores trajo cada anuncio.** Solo cuenta visitas al perfil. Lo
  que se puede medir es cuántos siguieron en total por día comparado con los días de antes de
  la campaña: eso es "seguidores extra", y es de la campaña entera, no de un creativo.
- **Instagram cierra el día al día siguiente.** El de hoy no está; se mide hasta ayer.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

from src.services.meta_services import MetaServices, _hoy_ar, _iso_ahora, _leads_de_actions, _recordado

logger = logging.getLogger("atv_ops.campanias")

AR = timezone(timedelta(hours=-3))

# Las reglas del veredicto. Se compara cada creativo con el mejor de su misma campaña.
GASTO_MINIMO_USD = 5.0     # menos que esto todavía no dice nada
HOOK_ESCALAR = 0.30        # frena el scroll al menos el 30 % de los que lo ven
VECES_PAUSAR = 1.5         # cuesta 1,5 veces o más que el mejor
FRECUENCIA_QUEMADO = 1.6   # la misma de siempre en Ads: desde acá el creativo está quemado

DIAS_BASE = 7              # los días de antes de la campaña que dicen qué es "lo normal"
DIAS_VENTANA = 21          # cuánto para atrás se le pide a Instagram

_ESTADO = {"ACTIVE": "corriendo", "PAUSED": "pausada", "CAMPAIGN_PAUSED": "pausada",
           "ARCHIVED": "pausada", "DELETED": "pausada", "WITH_ISSUES": "con problemas",
           "IN_PROCESS": "en revisión", "PENDING_REVIEW": "en revisión"}

_OBJETIVO = {"OUTCOME_TRAFFIC": "tráfico", "LINK_CLICKS": "tráfico", "OUTCOME_LEADS": "leads",
             "LEAD_GENERATION": "leads", "OUTCOME_ENGAGEMENT": "interacción",
             "OUTCOME_AWARENESS": "alcance", "OUTCOME_SALES": "ventas", "CONVERSIONS": "ventas",
             "MESSAGES": "mensajes", "VIDEO_VIEWS": "reproducciones"}


# ------------------------------------------------------------------ cuentas puras

def _accion(actions: list | None, tipo: str) -> int:
    for a in actions or []:
        if a.get("action_type") == tipo:
            try:
                return int(float(a.get("value") or 0))
            except (TypeError, ValueError):
                return 0
    return 0


def _primer_valor(lista: list | None) -> int:
    try:
        return int(float((lista or [{}])[0].get("value") or 0))
    except (TypeError, ValueError):
        return 0


def que_mide(objetivo: str | None, destino: str | None) -> dict:
    """Qué cuenta como resultado de la campaña, según lo que optimiza."""
    if (destino or "").upper() == "INSTAGRAM_PROFILE":
        return {"clave": "visitas", "nombre": "Visitas al perfil", "singular": "visita"}
    if _OBJETIVO.get((objetivo or "").upper()) == "leads":
        return {"clave": "leads", "nombre": "Leads", "singular": "lead"}
    return {"clave": "clicks", "nombre": "Clicks", "singular": "click"}


def resultados_de(row: dict | None, mide: dict) -> int:
    row = row or {}
    if mide["clave"] == "leads":
        return _leads_de_actions(row.get("actions"))
    # A un perfil de Instagram Meta lo cuenta como link_click: cada uno es una visita.
    return _accion(row.get("actions"), "link_click")


def numeros(row: dict | None, mide: dict) -> dict:
    """Lo que hizo un anuncio o una campaña, con los nombres de la pantalla."""
    row = row or {}
    gasto = float(row.get("spend") or 0)
    imp = int(row.get("impressions") or 0)
    res = resultados_de(row, mide)
    vistas3 = _accion(row.get("actions"), "video_view")
    p25 = _primer_valor(row.get("video_p25_watched_actions"))
    return {
        "gastoUsd": round(gasto, 2),
        "impresiones": imp,
        "alcance": int(row.get("reach") or 0),
        "frecuencia": round(float(row.get("frequency") or 0), 2),
        "cpmUsd": round(float(row.get("cpm") or 0), 2),
        "resultados": res,
        "costoResultadoUsd": round(gasto / res, 2) if res else None,
        # Es video si alguien lo miró 3 segundos; una imagen no tiene hook ni retención.
        "hook": round(vistas3 / imp, 4) if imp and vistas3 else None,
        "retencion25": round(p25 / vistas3, 4) if vistas3 and p25 else None,
        "completas": _primer_valor(row.get("video_p100_watched_actions")),
        "guardados": _accion(row.get("actions"), "onsite_conversion.post_save"),
        "comentarios": _accion(row.get("actions"), "comment"),
    }


def veredictos(creativos: list[dict]) -> list[dict]:
    """Escalar, mantener, pausar o juntando datos, contra el mejor de la misma campaña.

    - juntando datos: gastó menos de US$ 5 o todavía no tiene resultados.
    - pausar: cuesta 1,5 veces o más que el mejor, o la frecuencia ya quemó el creativo.
    - escalar: es el más barato y frena el scroll al menos al 30 % (una imagen no tiene hook:
      ahí alcanza con ser el más barato).
    - mantener: el resto.
    """
    con_datos = [c for c in creativos if c["gastoUsd"] >= GASTO_MINIMO_USD and c["resultados"] > 0]
    ids = {c["id"] for c in con_datos}
    mejor = min((c["costoResultadoUsd"] for c in con_datos), default=None)
    salida = []
    for c in creativos:
        if c["id"] not in ids:
            v = "juntando datos"
        elif c["frecuencia"] >= FRECUENCIA_QUEMADO or c["costoResultadoUsd"] >= round(VECES_PAUSAR * mejor, 2):
            v = "pausar"
        elif c["costoResultadoUsd"] == mejor and (c["hook"] is None or c["hook"] >= HOOK_ESCALAR):
            v = "escalar"
        else:
            v = "mantener"
        salida.append({**c, "veredicto": v})
    return salida


def primer_dia_medido(inicio: datetime) -> date:
    """El primer día entero de campaña. Si arrancó a la tarde, ese día no cuenta: tuvo pocas
    horas de anuncios y mezclaría lo normal con lo de la campaña."""
    local = inicio.astimezone(AR)
    return local.date() if local.hour < 12 else local.date() + timedelta(days=1)


def seguidores_extra(dias: list[dict], inicio: datetime, gasto_por_dia: dict[str, float]) -> dict:
    """Cuántos siguieron por encima de lo normal desde que arrancó la campaña.

    Lo normal es el promedio de los `DIAS_BASE` días anteriores al arranque. El día del arranque
    no entra en ninguno de los dos lados. `dias` son los días cerrados de Instagram, en orden."""
    arranque = inicio.astimezone(AR).date()
    desde = primer_dia_medido(inicio)
    antes = [d for d in dias if date.fromisoformat(d["fecha"]) < arranque][-DIAS_BASE:]
    durante = [d for d in dias if date.fromisoformat(d["fecha"]) >= desde]
    base = None
    if antes:
        base = {"siguen": round(sum(d["siguen"] for d in antes) / len(antes), 1),
                "dejan": round(sum(d["dejan"] for d in antes) / len(antes), 1),
                "dias": len(antes)}
    salida = {"base": base, "medidos": len(durante), "desde": desde.isoformat(),
              "siguen": sum(d["siguen"] for d in durante), "dejan": sum(d["dejan"] for d in durante),
              "extra": None, "gastoMedidoUsd": None, "costoExtraUsd": None}
    if not base or not durante:
        return salida
    extra = round(sum(d["siguen"] - base["siguen"] for d in durante))
    gasto = round(sum(gasto_por_dia.get(d["fecha"], 0.0) for d in durante), 2)
    salida.update(extra=extra, gastoMedidoUsd=gasto,
                  costoExtraUsd=round(gasto / extra, 2) if extra > 0 else None)
    return salida


def interesados(media_ids: list[str], seguir: list[str] | None = None) -> dict:
    """Quiénes comentaron los anuncios y si califican, según Audiencia.

    De quien solo sigue la cuenta la API no da el usuario; de quien comenta, sí. Los posts de
    los anuncios que corren quedan seguidos en Audiencia, y desde ahí sus comentarios entran
    solos (webhook + la corrida de siempre) y se califican con el criterio de marketing."""
    from pony.orm import db_session

    from src.models import LeadAudiencia
    from src.services import audiencia_services as audiencia

    seguidos = audiencia.reels_seguidos()
    for mid in seguir or []:
        if str(mid) not in seguidos:
            audiencia.seguir_reel(str(mid), por="ads")
    ids = {str(m) for m in media_ids}
    with db_session:
        leads = [(x.veredicto, x.puntaje, x.analizado_at is not None)
                 for x in list(LeadAudiencia.select()) if x.media_id in ids]
    calificados = sum(1 for v, p, leido in leads if leido and audiencia._veredicto_vigente(v, p) == "calificado")
    return {"personas": len(leads), "leidos": sum(1 for _, _, leido in leads if leido),
            "calificados": calificados, "corte": audiencia.CORTE_CALIFICADO}


def _fecha_meta(iso: str | None) -> datetime | None:
    """Meta manda '2026-10-31T21:26:46-0300'."""
    if not iso:
        return None
    try:
        return datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S%z")
    except ValueError:
        return None


# ------------------------------------------------------------------ Meta

class CampaniasServices:
    def __init__(self) -> None:
        self.meta = MetaServices()

    def _ads(self) -> tuple[str, str, str]:
        token, account, ver = self.meta._ads_token(), self.meta._ad_account(), self.meta._ads_ver()
        if not token or not account:
            raise HTTPException(status_code=503, detail="Falta el token o la cuenta publicitaria de Meta.")
        return token, account, ver

    def campanias(self, refrescar: bool = False) -> dict:
        """Todas las campañas de la cuenta, primero las que corren, con lo que gastaron en su vida."""
        return _recordado("campanias", refrescar, self._campanias_crudo)

    def _campanias_crudo(self) -> dict:
        token, account, ver = self._ads()
        camps = self.meta._graph_get_all(ver, f"/{account}/campaigns", token, {
            "fields": "id,name,objective,effective_status,start_time,stop_time", "limit": "100"})
        gasto = {str(r.get("campaign_id")): r for r in self.meta._graph_get_all(ver, f"/{account}/insights", token, {
            "fields": "campaign_id,spend", "level": "campaign", "date_preset": "maximum", "limit": "200"})}
        out = []
        for c in camps:
            out.append({
                "id": str(c["id"]),
                "nombre": c.get("name") or "",
                "estado": _ESTADO.get(c.get("effective_status") or "", "pausada"),
                "objetivo": _OBJETIVO.get((c.get("objective") or "").upper(), (c.get("objective") or "").lower()),
                "inicio": c.get("start_time"),
                "gastoUsd": round(float((gasto.get(str(c["id"])) or {}).get("spend") or 0), 2),
            })
        orden = {"corriendo": 0, "con problemas": 1, "en revisión": 2, "pausada": 3}
        out.sort(key=lambda x: (orden.get(x["estado"], 9), -(x["gastoUsd"] or 0)))
        return {"campanias": out, "ultimaSyncAt": _iso_ahora()}

    def campania(self, cid: str, refrescar: bool = False) -> dict:
        if not cid.isdigit():
            raise HTTPException(status_code=400, detail="Id de campaña inválido.")
        return _recordado(f"campania:{cid}", refrescar, lambda: self._campania_crudo(cid))

    def _campania_crudo(self, cid: str) -> dict:
        token, account, ver = self._ads()
        g = self.meta._graph_get
        c = g(ver, f"/{cid}", token, {"fields": "id,name,objective,effective_status,start_time"})
        conjuntos = self.meta._graph_get_all(ver, f"/{cid}/adsets", token, {
            "fields": "id,name,optimization_goal,destination_type,effective_status,daily_budget", "limit": "50"})
        destino = next((s.get("destination_type") for s in conjuntos if s.get("destination_type")), None)
        mide = que_mide(c.get("objective"), destino)
        diario = sum(float(s.get("daily_budget") or 0) for s in conjuntos
                     if s.get("effective_status") == "ACTIVE") / 100

        campos = ("spend,impressions,reach,frequency,cpm,clicks,actions,"
                  "video_p25_watched_actions,video_p100_watched_actions")
        total = g(ver, f"/{cid}/insights", token, {"fields": campos, "date_preset": "maximum"}).get("data") or []
        por_dia = self.meta._graph_get_all(ver, f"/{cid}/insights", token, {
            "fields": "spend,actions,date_start", "time_increment": "1", "date_preset": "maximum", "limit": "100"})
        ads = self.meta._graph_get_all(ver, f"/{cid}/ads", token, {
            "fields": "id,name,effective_status,adset{name},creative{thumbnail_url,image_url,effective_instagram_media_id}",
            "limit": "50"})
        por_ad = {str(r.get("ad_id")): r for r in self.meta._graph_get_all(ver, f"/{cid}/insights", token, {
            "fields": "ad_id," + campos, "level": "ad", "date_preset": "maximum", "limit": "100"})}

        creativos = []
        for a in ads:
            n = numeros(por_ad.get(str(a["id"])), mide)
            if a.get("effective_status") != "ACTIVE" and not n["gastoUsd"]:
                continue  # uno que nunca salió no tiene nada que comparar
            cr = a.get("creative") or {}
            creativos.append({
                "id": str(a["id"]),
                "nombre": a.get("name") or "",
                "conjunto": (a.get("adset") or {}).get("name"),
                "estado": _ESTADO.get(a.get("effective_status") or "", "pausada"),
                "imagen": self._portada(cr),
                "mediaId": cr.get("effective_instagram_media_id"),
                **n,
            })
        creativos = veredictos(creativos)
        creativos.sort(key=lambda x: (x["costoResultadoUsd"] is None, x["costoResultadoUsd"] or 0))

        dias = [{"fecha": d.get("date_start"), "gastoUsd": round(float(d.get("spend") or 0), 2),
                 "resultados": resultados_de(d, mide)} for d in por_dia]
        inicio = _fecha_meta(c.get("start_time"))
        cuenta = account.replace("act_", "")
        return {
            "id": cid,
            "nombre": c.get("name"),
            "estado": _ESTADO.get(c.get("effective_status") or "", "pausada"),
            "objetivo": _OBJETIVO.get((c.get("objective") or "").upper(), (c.get("objective") or "").lower()),
            "inicio": c.get("start_time"),
            "presupuestoDiarioUsd": round(diario, 2) if diario else None,
            "conjuntos": len(conjuntos),
            "mide": mide,
            "total": numeros(total[0] if total else None, mide),
            "creativos": creativos,
            "dias": dias,
            "seguidores": self._seguidores_de(inicio, {d["fecha"]: d["gastoUsd"] for d in dias}),
            "interesados": interesados([c["mediaId"] for c in creativos if c.get("mediaId")],
                                       seguir=[c["mediaId"] for c in creativos
                                               if c.get("mediaId") and c["estado"] == "corriendo"]),
            "link": f"https://adsmanager.facebook.com/adsmanager/manage/ads?act={cuenta}&selected_campaign_ids={cid}",
            "ultimaSyncAt": _iso_ahora(),
        }

    def _portada(self, cr: dict) -> str | None:
        """La portada en grande sale del post de Instagram; la miniatura del creativo es de 64 px."""
        mid = cr.get("effective_instagram_media_id")
        if mid:
            try:
                m = self.meta._graph_get(self.meta._ig_ver(), f"/{mid}", self.meta._ig_token(),
                                         {"fields": "thumbnail_url,media_url,media_type"})
                url = m.get("thumbnail_url") or (m.get("media_url") if m.get("media_type") == "IMAGE" else None)
                if url:
                    return url
            except HTTPException as e:
                logger.info("Sin portada de Instagram para %s: %s", mid, str(e.detail)[:120])
        return cr.get("image_url") or cr.get("thumbnail_url")

    def _seguidores_de(self, inicio: datetime | None, gasto_por_dia: dict[str, float]) -> dict:
        hoy = _hoy_ar()
        desde = hoy - timedelta(days=DIAS_VENTANA)
        if inicio:
            desde = max(desde, inicio.astimezone(AR).date() - timedelta(days=DIAS_BASE))
        try:
            dias = self.seguidores(desde, hoy - timedelta(days=1))["dias"]
        except HTTPException as e:
            return {"dias": [], "error": str(e.detail)[:200]}
        calculo = seguidores_extra(dias, inicio, gasto_por_dia) if inicio else {}
        return {"dias": dias, **calculo}

    # ------------------------------------------------------------------ Instagram

    def seguidores(self, desde: date, hasta: date, refrescar: bool = False) -> dict:
        """Cuántos siguieron y cuántos dejaron de seguir, día por día (solo días cerrados)."""
        hasta = min(hasta, _hoy_ar() - timedelta(days=1))
        if desde > hasta:
            return {"dias": []}
        return _recordado(f"seguidores:{desde}:{hasta}", refrescar, lambda: self._seguidores_crudo(desde, hasta))

    def _seguidores_crudo(self, desde: date, hasta: date) -> dict:
        token, uid, ver = self.meta._ig_token(), self.meta._ig_user(), self.meta._ig_ver()
        if not token or not uid:
            raise HTTPException(status_code=503, detail="Falta el token de Instagram.")
        fechas = [desde + timedelta(days=i) for i in range((hasta - desde).days + 1)]

        def un_dia(d: date) -> dict:
            # Con desglose, Instagram da el total de la ventana pedida: por eso un pedido por día.
            d0 = datetime(d.year, d.month, d.day, tzinfo=AR)
            r = self.meta._graph_get(ver, f"/{uid}/insights", token, {
                "metric": "follows_and_unfollows", "period": "day", "metric_type": "total_value",
                "breakdown": "follow_type",
                "since": str(int(d0.timestamp())), "until": str(int((d0 + timedelta(days=1)).timestamp()))})
            valores = {}
            for x in (r.get("data") or []):
                for b in ((x.get("total_value") or {}).get("breakdowns") or [{}])[0].get("results", []):
                    valores[(b.get("dimension_values") or [""])[0]] = int(b.get("value") or 0)
            # FOLLOWER = los que empezaron a seguir; NON_FOLLOWER = los que dejaron.
            return {"fecha": d.isoformat(), "siguen": valores.get("FOLLOWER", 0), "dejan": valores.get("NON_FOLLOWER", 0)}

        with ThreadPoolExecutor(max_workers=6) as ex:
            dias = list(ex.map(un_dia, fechas))
        return {"dias": dias, "ultimaSyncAt": _iso_ahora()}
