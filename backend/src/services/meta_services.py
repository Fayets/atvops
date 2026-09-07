"""
Meta Graph API — Ads Manager + Instagram content del mes.

Tokens solo desde .env (META_*). No persistir en DB.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json

from decouple import config
from fastapi import HTTPException

AR_OFFSET = timedelta(hours=-3)

FRECUENCIA_OBJETIVO = 1.4
FRECUENCIA_QUEMADO = 1.6

OBJETIVO_VENTAS = {
    "OUTCOME_SALES",
    "CONVERSIONS",
    "PRODUCT_CATALOG_SALES",
    "SALES",
}


def _hoy_ar() -> date:
    return (datetime.utcnow() + AR_OFFSET).date()


def _mes_label(d: date | None = None) -> str:
    d = d or _hoy_ar()
    return f"{d.year:04d}-{d.month:02d}"


def _rango_mes(mes: str) -> tuple[str, str]:
    y, m = map(int, mes.split("-"))
    desde = date(y, m, 1)
    if m == 12:
        fin_mes = date(y + 1, 1, 1) - timedelta(days=1)
    else:
        fin_mes = date(y, m + 1, 1) - timedelta(days=1)
    hoy = _hoy_ar()
    hasta = min(fin_mes, hoy) if mes == _mes_label(hoy) else fin_mes
    if mes > _mes_label(hoy):
        hasta = desde
    return desde.isoformat(), hasta.isoformat()


def _iso_ahora() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _leads_de_actions(actions: list | None) -> int:
    if not actions:
        return 0
    prefer = (
        "lead",
        "onsite_web_lead",
        "onsite_conversion.lead_grouped",
        "offsite_conversion.fb_pixel_lead",
        "onsite_conversion.messaging_conversation_started_7d",
        "onsite_conversion.total_messaging_connection",
    )
    by_type = {a.get("action_type"): float(a.get("value") or 0) for a in actions}
    for key in prefer:
        if key in by_type:
            return int(by_type[key])
    return 0


def _costo_lead(cost_per: list | None, leads: int, spend: float) -> float:
    if cost_per:
        prefer = (
            "lead",
            "onsite_web_lead",
            "onsite_conversion.lead_grouped",
            "offsite_conversion.fb_pixel_lead",
        )
        by_type = {a.get("action_type"): float(a.get("value") or 0) for a in cost_per}
        for key in prefer:
            if key in by_type and by_type[key] > 0:
                return by_type[key]
    if leads > 0:
        return spend / leads
    return 0.0


def _roas_de_row(row: dict) -> float:
    pr = row.get("purchase_roas") or []
    if pr:
        try:
            return float(pr[0].get("value") or 0)
        except (TypeError, ValueError, IndexError):
            return 0.0
    return 0.0


def _objetivo_campania(objective: str | None) -> str:
    if not objective:
        return "trafico"
    return "ventas" if objective.upper() in OBJETIVO_VENTAS else "trafico"


def _estado_campania(status: str | None) -> str:
    s = (status or "").upper()
    if s in {"ACTIVE", "CAMPAIGN_ACTIVE"}:
        return "activa"
    return "pausada"


class MetaServices:
    def _ads_token(self) -> str:
        return config("META_ADS_ACCESS_TOKEN", default="").strip()

    def _ad_account(self) -> str:
        return config("META_AD_ACCOUNT_ID", default="").strip()

    def _ads_ver(self) -> str:
        return config("META_GRAPH_ADS_VERSION", default="v19.0").strip()

    def _ig_token(self) -> str:
        return config("META_IG_ACCESS_TOKEN", default="").strip()

    def _ig_user(self) -> str:
        return config("META_IG_USER_ID", default="").strip()

    def _ig_ver(self) -> str:
        return config("META_GRAPH_IG_VERSION", default="v25.0").strip()

    def _graph_get(self, version: str, path: str, token: str, params: dict | None = None) -> dict:
        if not token:
            raise HTTPException(status_code=503, detail="Falta token Meta en el .env.")
        q = dict(params or {})
        q["access_token"] = token
        url = f"https://graph.facebook.com/{version}{path}?{urlencode(q)}"
        req = Request(url, headers={"Accept": "application/json"})
        try:
            with urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise HTTPException(
                status_code=502,
                detail=f"Meta Graph {e.code}: {body[:320]}",
            ) from e
        except URLError as e:
            raise HTTPException(status_code=503, detail=f"No se pudo conectar a Meta Graph: {e}") from e

    def _graph_get_all(self, version: str, path: str, token: str, params: dict | None = None) -> list:
        """Paginación simple por `paging.next` (máx 10 páginas)."""
        out: list = []
        data = self._graph_get(version, path, token, params)
        out.extend(data.get("data") or [])
        pages = 0
        while data.get("paging", {}).get("next") and pages < 10:
            pages += 1
            next_url = data["paging"]["next"]
            req = Request(next_url, headers={"Accept": "application/json"})
            try:
                with urlopen(req, timeout=40) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
            except HTTPError as e:
                body = e.read().decode("utf-8", errors="replace")
                raise HTTPException(
                    status_code=502,
                    detail=f"Meta Graph page {e.code}: {body[:320]}",
                ) from e
            out.extend(data.get("data") or [])
        return out

    # ------------------------------------------------------------------ ads

    def ads_resumen(self, month: str | None = None) -> dict:
        token = self._ads_token()
        account = self._ad_account()
        ver = self._ads_ver()
        if not token or not account:
            raise HTTPException(
                status_code=503,
                detail="Falta META_ADS_ACCESS_TOKEN o META_AD_ACCOUNT_ID en el .env.",
            )

        mes = month or _mes_label()
        since, until = _rango_mes(mes)
        time_range = json.dumps({"since": since, "until": until})
        sync_at = _iso_ahora()

        camp_meta = {
            c["id"]: c
            for c in self._graph_get_all(
                ver,
                f"/{account}/campaigns",
                token,
                {
                    "fields": "id,name,status,objective,effective_status",
                    "limit": "100",
                },
            )
        }

        insights = self._graph_get_all(
            ver,
            f"/{account}/insights",
            token,
            {
                "fields": (
                    "campaign_id,campaign_name,spend,impressions,reach,frequency,"
                    "actions,cost_per_action_type,purchase_roas"
                ),
                "level": "campaign",
                "time_range": time_range,
                "limit": "100",
            },
        )

        diarios = self._graph_get_all(
            ver,
            f"/{account}/insights",
            token,
            {
                "fields": "spend,actions,date_start",
                "time_increment": "1",
                "time_range": time_range,
                "limit": "50",
            },
        )

        campanias = []
        for row in insights:
            cid = str(row.get("campaign_id") or "")
            meta = camp_meta.get(cid) or {}
            spend = float(row.get("spend") or 0)
            leads = _leads_de_actions(row.get("actions"))
            freq = float(row.get("frequency") or 0)
            campanias.append(
                {
                    "id": cid or row.get("campaign_name"),
                    "nombre": row.get("campaign_name") or meta.get("name") or cid,
                    "canal": "meta",
                    "objetivo": _objetivo_campania(meta.get("objective")),
                    "estado": _estado_campania(meta.get("effective_status") or meta.get("status")),
                    "gastoUsd": round(spend, 2),
                    "leads": leads,
                    "cplUsd": round(_costo_lead(row.get("cost_per_action_type"), leads, spend), 2),
                    "roas": round(_roas_de_row(row), 2),
                    "frecuencia": round(freq, 2),
                    "ultimaSyncAt": sync_at,
                }
            )

        # Mes sin spend (p.ej. campañas pausadas): igual listar el ad account.
        if not campanias:
            for cid, meta in camp_meta.items():
                campanias.append(
                    {
                        "id": cid,
                        "nombre": meta.get("name") or cid,
                        "canal": "meta",
                        "objetivo": _objetivo_campania(meta.get("objective")),
                        "estado": _estado_campania(meta.get("effective_status") or meta.get("status")),
                        "gastoUsd": 0,
                        "leads": 0,
                        "cplUsd": 0,
                        "roas": 0,
                        "frecuencia": 0,
                        "ultimaSyncAt": sync_at,
                    }
                )

        campanias.sort(key=lambda c: (c["frecuencia"], c["gastoUsd"]), reverse=True)

        gasto = sum(c["gastoUsd"] for c in campanias)
        leads = sum(c["leads"] for c in campanias)
        activas = [c for c in campanias if c["estado"] == "activa"]
        quemadas = [c for c in campanias if c["frecuencia"] >= FRECUENCIA_QUEMADO]

        roas_vals = [c["roas"] for c in campanias if c["roas"] > 0]
        roas = (sum(roas_vals) / len(roas_vals)) if roas_vals else 0.0

        gasto_diario = []
        for d in diarios:
            day = (d.get("date_start") or "")[-2:]
            gasto_diario.append(
                {
                    "dia": day,
                    "gastoUsd": round(float(d.get("spend") or 0), 2),
                    "leads": _leads_de_actions(d.get("actions")),
                }
            )
        gasto_diario.sort(key=lambda x: x["dia"])

        gasto_canal = [
            {
                "canal": "Meta",
                "gastoUsd": round(gasto, 2),
                "leads": leads,
                "roas": round(roas, 2),
            }
        ]

        kpis = [
            {
                "id": "roas",
                "label": "ROAS",
                "value": round(roas, 2),
                "format": "x",
                "previous": None,
                "sourceId": "ads_manager",
                "updatedAt": sync_at,
                "nota": (
                    "ROAS solo si hay conversiones de compra reportadas. "
                    "Tráfico a DM suele venir en 0."
                ),
            },
            {
                "id": "cpl",
                "label": "Cost per lead",
                "value": round(gasto / leads, 2) if leads else 0,
                "format": "usd",
                "previous": None,
                "sourceId": "ads_manager",
                "updatedAt": sync_at,
                "good": "down",
            },
            {
                "id": "gasto_ads",
                "label": "Gasto del mes",
                "value": round(gasto, 2),
                "format": "usd",
                "previous": None,
                "sourceId": "ads_manager",
                "updatedAt": sync_at,
                "good": "neutral",
                "serie": [d["gastoUsd"] for d in gasto_diario],
            },
            {
                "id": "campanias_activas",
                "label": "Campañas activas",
                "value": len(activas),
                "format": "count",
                "previous": None,
                "sourceId": "ads_manager",
                "updatedAt": sync_at,
                "good": "neutral",
                "nota": (
                    f"{len(quemadas)} con la frecuencia pasada de {FRECUENCIA_QUEMADO}."
                    if quemadas
                    else "Ninguna con la frecuencia quemada."
                ),
            },
        ]

        return {
            "mes": mes,
            "desde": since,
            "hasta": until,
            "fuente": "meta_ads",
            "syncAt": sync_at,
            "campanias": campanias,
            "gastoCanal": gasto_canal,
            "gastoDiario": gasto_diario,
            "umbrales": {"objetivo": FRECUENCIA_OBJETIVO, "quemado": FRECUENCIA_QUEMADO},
            "kpis": kpis,
            "inversionAds": round(gasto, 2),
        }

    # ----------------------------------------------------------- instagram

    def ig_contenido(self, month: str | None = None) -> dict:
        token = self._ig_token()
        user = self._ig_user()
        ver = self._ig_ver()
        if not token or not user:
            raise HTTPException(
                status_code=503,
                detail="Falta META_IG_ACCESS_TOKEN o META_IG_USER_ID en el .env.",
            )

        mes = month or _mes_label()
        since, until = _rango_mes(mes)
        sync_at = _iso_ahora()

        fields = (
            "id,caption,media_type,media_product_type,media_url,permalink,"
            "thumbnail_url,timestamp,like_count,comments_count,username"
        )
        raw = self._graph_get_all(
            ver,
            f"/{user}/media",
            token,
            {"fields": fields, "limit": "50"},
        )

        items = []
        for m in raw:
            ts = m.get("timestamp") or ""
            day = ts[:10]
            if not day or day < since or day > until:
                continue
            caption = (m.get("caption") or "").strip()
            items.append(
                {
                    "id": m.get("id"),
                    "tipo": m.get("media_product_type") or m.get("media_type"),
                    "mediaType": m.get("media_type"),
                    "caption": caption[:180],
                    "permalink": m.get("permalink"),
                    "thumbnailUrl": m.get("thumbnail_url") or m.get("media_url"),
                    "timestamp": ts,
                    "likes": int(m.get("like_count") or 0),
                    "comments": int(m.get("comments_count") or 0),
                }
            )

        items.sort(key=lambda x: x["timestamp"], reverse=True)

        stories = []
        try:
            story_raw = self._graph_get_all(
                ver,
                f"/{user}/stories",
                token,
                {
                    "fields": "id,media_type,media_url,permalink,timestamp,thumbnail_url",
                    "limit": "30",
                },
            )
        except HTTPException:
            story_raw = []

        from concurrent.futures import ThreadPoolExecutor, as_completed

        def _enrich(s: dict) -> dict:
            metrics = self._story_insights(ver, s.get("id"), token) if s.get("id") else {}
            return {
                "id": s.get("id"),
                "tipo": "STORY",
                "mediaType": s.get("media_type"),
                "permalink": s.get("permalink"),
                "thumbnailUrl": s.get("thumbnail_url") or s.get("media_url"),
                "timestamp": s.get("timestamp"),
                "reach": metrics.get("reach", 0),
                "replies": metrics.get("replies", 0),
                "navigation": metrics.get("navigation", 0),
                "shares": metrics.get("shares", 0),
                "profileVisits": metrics.get("profile_visits", 0),
                "follows": metrics.get("follows", 0),
                "totalInteractions": metrics.get("total_interactions", 0),
            }

        if story_raw:
            with ThreadPoolExecutor(max_workers=min(8, len(story_raw))) as pool:
                futures = [pool.submit(_enrich, s) for s in story_raw]
                for fut in as_completed(futures):
                    stories.append(fut.result())
            stories.sort(key=lambda x: str(x.get("timestamp") or ""))

        por_tipo: dict[str, int] = {}
        for it in items:
            t = it["tipo"] or "OTHER"
            por_tipo[t] = por_tipo.get(t, 0) + 1

        replies_tot = sum(int(s.get("replies") or 0) for s in stories)
        reach_tot = sum(int(s.get("reach") or 0) for s in stories)
        shares_tot = sum(int(s.get("shares") or 0) for s in stories)

        return {
            "mes": mes,
            "desde": since,
            "hasta": until,
            "fuente": "meta_instagram",
            "syncAt": sync_at,
            "instagramUserId": user,
            "publicaciones": items,
            "storiesActivas": stories,
            "totales": {
                "publicaciones": len(items),
                "stories": len(stories),
                "likes": sum(i["likes"] for i in items),
                "comments": sum(i["comments"] for i in items),
                "storyReplies": replies_tot,
                "storyReach": reach_tot,
                "storyShares": shares_tot,
                "porTipo": por_tipo,
            },
        }

    def _parse_insights(self, insights_payload) -> dict:
        """Normaliza {data:[{name,values:[{value}]}]} → {name: value}."""
        out: dict = {}
        if not insights_payload:
            return out
        rows = insights_payload.get("data") if isinstance(insights_payload, dict) else insights_payload
        if not isinstance(rows, list):
            return out
        for row in rows:
            name = row.get("name")
            vals = row.get("values") or []
            if not name or not vals:
                continue
            try:
                out[name] = int(float(vals[0].get("value") or 0))
            except (TypeError, ValueError):
                out[name] = 0
        return out

    def _story_insights(self, version: str, media_id: str, token: str) -> dict:
        # v22+: impressions / exits / taps_* ya no aplican a stories.
        try:
            data = self._graph_get(
                version,
                f"/{media_id}/insights",
                token,
                {
                    "metric": "reach,replies,navigation,shares,profile_visits,follows,total_interactions",
                },
            )
            return self._parse_insights(data)
        except HTTPException:
            try:
                data = self._graph_get(
                    version,
                    f"/{media_id}/insights",
                    token,
                    {"metric": "reach,replies"},
                )
                return self._parse_insights(data)
            except HTTPException:
                return {}

    def resumen(self, month: str | None = None) -> dict:
        """Ads + contenido IG del mes (para Ads / ops)."""
        mes = month or _mes_label()
        ads = self.ads_resumen(mes)
        try:
            ig = self.ig_contenido(mes)
        except HTTPException as e:
            ig = {
                "mes": mes,
                "error": e.detail,
                "publicaciones": [],
                "storiesActivas": [],
                "totales": {"publicaciones": 0, "stories": 0, "likes": 0, "comments": 0, "porTipo": {}},
                "fuente": "meta_instagram",
                "syncAt": None,
            }
        return {**ads, "instagram": ig}
