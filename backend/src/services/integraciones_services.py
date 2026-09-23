"""Integraciones públicas: token por webinar + eventos de funnel (landing → TY)."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException
from pony.orm import db_session, flush

TIPOS_INTEGRACION = frozenset({"landing"})
# pageview = visita landing · optin · thank_you · whatsapp
TIPOS_EVENTO = frozenset({"pageview", "optin", "thank_you", "whatsapp"})
# Si hubo un evento en esta ventana, el status es "recibiendo".
VENTANA_CONECTADO = timedelta(hours=48)


class IntegracionesServices:
    def listar(self) -> list[dict]:
        from src.models import Integracion, Webinar

        with db_session:
            rows = list(Integracion.select().order_by(Integracion.id.desc()))
            out = []
            for i in rows:
                webinar_nombre = None
                calendly_url = None
                if i.webinar_id:
                    w = Webinar.get(id=i.webinar_id)
                    if w is not None and w.borrado_at is None:
                        webinar_nombre = w.nombre
                        calendly_url = w.calendly_url
                out.append(self._to_dict(i, webinar_nombre=webinar_nombre, calendly_url=calendly_url))
            return out

    def panel(self) -> dict:
        """Vista de integraciones: tracking por webinar + estado de plataformas."""
        from src.models import Integracion, Webinar
        from src.services import conexiones_services

        with db_session:
            webinars = [w for w in list(Webinar.select()) if w.borrado_at is None]
            webinars.sort(key=lambda w: w.fecha_hora or w.creado_at, reverse=True)
            ints = list(Integracion.select())
            por_webinar = {i.webinar_id: i for i in ints if i.webinar_id}

            items = []
            for w in webinars:
                i = por_webinar.get(w.id)
                if i is None:
                    items.append({
                        "webinarId": w.id,
                        "webinarNombre": w.nombre,
                        "calendlyUrl": w.calendly_url,
                        "campaniasAds": _cargar_campanias(w.campanias_ads),
                        "integracion": None,
                    })
                else:
                    items.append({
                        "webinarId": w.id,
                        "webinarNombre": w.nombre,
                        "calendlyUrl": w.calendly_url,
                        "campaniasAds": _cargar_campanias(w.campanias_ads),
                        "integracion": self._to_dict(
                            i, webinar_nombre=w.nombre, calendly_url=w.calendly_url
                        ),
                    })

        conexiones = conexiones_services.estado()
        meta = next((c for c in conexiones if c.get("plataforma") == "meta_ads"), None)
        return {
            "webinars": items,
            "plataformas": {
                "metaAds": {
                    "conectada": bool(meta and meta.get("campos")),
                    "actualizadoAt": meta.get("actualizadoAt") if meta else None,
                },
            },
        }

    def asegurar_para_webinar(self, webinar_id: int, usuario: dict | None = None) -> dict:
        """Garantiza un token de tracking para el webinar (idempotente)."""
        from src.models import Integracion, Webinar

        with db_session:
            w = Webinar.get(id=int(webinar_id))
            if w is None or w.borrado_at is not None:
                raise HTTPException(status_code=404, detail="Ese webinar no existe.")
            existente = next(
                (i for i in list(Integracion.select())
                 if i.webinar_id == w.id and i.tipo == "landing"),
                None,
            )
            if existente is not None:
                return self._to_dict(
                    existente, webinar_nombre=w.nombre, calendly_url=w.calendly_url
                )
            i = Integracion(
                nombre=f"Tracking · {w.nombre}"[:200],
                tipo="landing",
                token=secrets.token_urlsafe(24),
                webinar_id=w.id,
                activo=True,
                creado_por=(usuario or {}).get("username"),
            )
            flush()
            return self._to_dict(i, webinar_nombre=w.nombre, calendly_url=w.calendly_url)

    def obtener(self, integracion_id: int) -> dict:
        from src.models import Integracion, Webinar

        with db_session:
            i = Integracion.get(id=integracion_id)
            if i is None:
                raise HTTPException(status_code=404, detail="Esa integración no existe.")
            webinar_nombre = None
            calendly_url = None
            if i.webinar_id:
                w = Webinar.get(id=i.webinar_id)
                if w is not None and w.borrado_at is None:
                    webinar_nombre = w.nombre
                    calendly_url = w.calendly_url
            return self._to_dict(i, webinar_nombre=webinar_nombre, calendly_url=calendly_url)

    def crear(self, datos: dict, usuario: dict) -> dict:
        from src.models import Integracion, Webinar

        webinar_id = datos.get("webinarId")
        if webinar_id is None:
            raise HTTPException(
                status_code=400,
                detail="La integración tiene que estar vinculada a un webinar.",
            )
        return self.asegurar_para_webinar(int(webinar_id), usuario)

    def actualizar(self, integracion_id: int, datos: dict) -> dict:
        from src.models import Integracion, Webinar

        with db_session:
            i = Integracion.get(id=integracion_id)
            if i is None:
                raise HTTPException(status_code=404, detail="Esa integración no existe.")
            if "nombre" in datos and datos["nombre"] is not None:
                nombre = str(datos["nombre"]).strip()
                if not nombre:
                    raise HTTPException(status_code=400, detail="El nombre no puede quedar vacío.")
                i.nombre = nombre
            if "activo" in datos and datos["activo"] is not None:
                i.activo = bool(datos["activo"])
            i.actualizado_at = datetime.utcnow()
            webinar_nombre = None
            calendly_url = None
            if i.webinar_id:
                w = Webinar.get(id=i.webinar_id)
                if w is not None and w.borrado_at is None:
                    webinar_nombre = w.nombre
                    calendly_url = w.calendly_url
            return self._to_dict(i, webinar_nombre=webinar_nombre, calendly_url=calendly_url)

    def borrar(self, integracion_id: int) -> dict:
        from src.models import Integracion

        with db_session:
            i = Integracion.get(id=integracion_id)
            if i is None:
                raise HTTPException(status_code=404, detail="Esa integración no existe.")
            for e in list(i.eventos):
                e.delete()
            i.delete()
            return {"ok": True, "id": integracion_id}

    def registrar_evento(
        self,
        token: str,
        tipo: str = "pageview",
        *,
        url: str | None = None,
        referrer: str | None = None,
        session_id: str | None = None,
    ) -> dict:
        from src.models import Integracion, TrackingEvento

        token = (token or "").strip()
        tipo = (tipo or "pageview").strip().lower()
        if tipo == "ty":
            tipo = "thank_you"
        if tipo == "landing":
            tipo = "pageview"
        if not token:
            raise HTTPException(status_code=400, detail="Falta el token.")
        if tipo not in TIPOS_EVENTO:
            raise HTTPException(status_code=400, detail=f"Evento no soportado: {tipo}.")
        with db_session:
            i = Integracion.get(token=token)
            if i is None or i.activo is not True:
                raise HTTPException(status_code=401, detail="Token inválido o integración inactiva.")
            TrackingEvento(
                integracion=i,
                tipo=tipo,
                url=(url or "")[:2000] or None,
                referrer=(referrer or "")[:2000] or None,
                session_id=(session_id or "")[:120] or None,
            )
            return {"ok": True, "tipo": tipo}

    def registrar_pageview(self, token: str, **kwargs) -> dict:
        return self.registrar_evento(token, "pageview", **kwargs)

    def metricas_tracking_webinar(self, webinar_id: int) -> dict | None:
        """Conteos de eventos para enriquecer el webinar. None = sin integración."""
        from src.models import Integracion

        with db_session:
            ints = [
                i for i in list(Integracion.select())
                if i.webinar_id == webinar_id and i.tipo == "landing" and i.activo is True
            ]
            if not ints:
                return None
            counts = {t: 0 for t in TIPOS_EVENTO}
            ultimo = None
            for i in ints:
                for e in i.eventos:
                    if e.tipo in counts:
                        counts[e.tipo] += 1
                    if ultimo is None or (e.creado_at and e.creado_at > ultimo):
                        ultimo = e.creado_at
            return {
                "visitasLanding": counts["pageview"],
                "optins": counts["optin"],
                "thankYou": counts["thank_you"],
                "entradasWhatsapp": counts["whatsapp"],
                "ultimoEventoAt": ultimo.isoformat() + "Z" if ultimo else None,
            }

    def contar_visitas_webinar(self, webinar_id: int) -> int | None:
        m = self.metricas_tracking_webinar(webinar_id)
        if m is None:
            return None
        return int(m["visitasLanding"])

    @staticmethod
    def _to_dict(i, *, webinar_nombre: str | None, calendly_url: str | None = None) -> dict:
        counts = {t: 0 for t in TIPOS_EVENTO}
        ultimo = None
        for e in i.eventos:
            if e.tipo in counts:
                counts[e.tipo] += 1
            if ultimo is None or (e.creado_at and e.creado_at > ultimo):
                ultimo = e.creado_at
        ahora = datetime.utcnow()
        if ultimo and (ahora - ultimo) <= VENTANA_CONECTADO:
            status = "recibiendo"
        elif ultimo:
            status = "inactivo"
        else:
            status = "sin_datos"
        return {
            "id": i.id,
            "nombre": i.nombre,
            "tipo": i.tipo,
            "token": i.token,
            "webinarId": i.webinar_id,
            "webinarNombre": webinar_nombre,
            "calendlyUrl": calendly_url,
            "activo": i.activo,
            "visitas": counts["pageview"],
            "eventos": {
                "pageview": counts["pageview"],
                "optin": counts["optin"],
                "thankYou": counts["thank_you"],
                "whatsapp": counts["whatsapp"],
            },
            "ultimoEventoAt": ultimo.isoformat() + "Z" if ultimo else None,
            "status": status,
            "creadoPor": i.creado_por,
            "creadoAt": i.creado_at.isoformat() + "Z" if i.creado_at else None,
            "actualizadoAt": i.actualizado_at.isoformat() + "Z" if i.actualizado_at else None,
        }


def _cargar_campanias(raw) -> list:
    import json
    try:
        data = json.loads(raw or "[]")
        return data if isinstance(data, list) else []
    except Exception:  # noqa: BLE001
        return []
