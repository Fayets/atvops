from contextlib import asynccontextmanager

from pathlib import Path

from decouple import config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from src.controllers.activacion_ia_controller import router as activacion_ia_router
from src.controllers.asistente_controller import router as asistente_router
from src.controllers.pendientes_controller import router as pendientes_router
from src.controllers.auth_controller import router as auth_router
from src.controllers.clientes_controller import router as clientes_router
from src.controllers.eventos_controller import router as eventos_router
from src.controllers.gcal_controller import router as gcal_router
from src.controllers.ventas_controller import router as ventas_router
from src.controllers.webhooks_controller import router as webhooks_router
from src.controllers.cobranza_controller import router as cobranza_router
from src.controllers.ideas_controller import router as ideas_router
from src.controllers.webinars_controller import router as webinars_router
from src.controllers.integraciones_controller import router as integraciones_router
from src.controllers.track_controller import router as track_router
from src.controllers.integrantes_controller import router as integrantes_router
from src.controllers.mkt_controller import router as mkt_router
from src.controllers.meta_controller import router as meta_router
from src.controllers.reuniones_controller import router as reuniones_router
from src.controllers.setting_controller import router as setting_router
from src.controllers.transcripts_controller import router as transcripts_router
from src.db import init_db
from src.services.auth_services import AuthServices
from src.services.integrantes_services import FOTOS_DIR, IntegrantesServices
from src.controllers.clientes_controller import service as clientes_service
from src.services import (activacion_ia_services, cerebro_services, instagram_services,
                          llamadas_services, pedidos_services, youtube_services)

import logging
import threading
import time

_log = logging.getLogger("atv_ops")


def _precalentar_cartera(stop: threading.Event) -> None:
    """Recalcula la cartera en segundo plano apenas el bot escribe un transcript,
    así ninguna pantalla de Fulfillment paga el análisis: siempre encuentra el
    resultado listo. Cuando nada cambió, cuesta un stat por archivo."""
    while not stop.is_set():
        try:
            t = time.perf_counter()
            clientes_service.listar()
            dt = time.perf_counter() - t
            if dt > 0.5:
                _log.info("Cartera recalculada en %.1fs", dt)
        except Exception as e:  # noqa: BLE001
            _log.warning("Precalentador de cartera: %s", e)
        stop.wait(10)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    AuthServices().ensure_local_user()
    IntegrantesServices().ensure_defaults()
    stop = threading.Event()
    threading.Thread(target=_precalentar_cartera, args=(stop,), daemon=True, name="precalentador").start()
    # Activación por Claude Code, 08:00 y 18:00 AR.
    threading.Thread(target=activacion_ia_services.iniciar_scheduler, args=(stop,), daemon=True, name="activacion-ia").start()
    # Rondas de pendientes de respuesta: 09, 13, 16 y 19 AR.
    cerebro_services.sembrar()
    threading.Thread(target=pedidos_services.iniciar_scheduler, args=(stop,), daemon=True, name="pedidos").start()
    # Instagram cada 3 h: las historias duran un día y si no se traen a tiempo se pierden.
    threading.Thread(target=instagram_services.iniciar_scheduler, args=(stop,), daemon=True, name="instagram").start()
    threading.Thread(target=youtube_services.iniciar_scheduler, args=(stop,), daemon=True, name="youtube").start()
    # Las llamadas de ventas: el calendario y el CRM se cruzan acá cada 10 minutos y lo
    # que queda escrito es lo que muestran las vistas.
    threading.Thread(target=llamadas_services.iniciar_scheduler, args=(stop,), daemon=True, name="llamadas").start()
    yield
    stop.set()


app = FastAPI(title="atv-ops", lifespan=lifespan)


class TrackCorsMiddleware(BaseHTTPMiddleware):
    """CORS abierto solo para /api/track: las landings viven en cualquier dominio."""

    async def dispatch(self, request, call_next):
        if not request.url.path.startswith("/api/track"):
            return await call_next(request)
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400",
        }
        if request.method == "OPTIONS":
            return Response(status_code=204, headers=headers)
        response = await call_next(request)
        for k, v in headers.items():
            response.headers[k] = v
        return response


origins = [
    origin.strip()
    for origin in config(
        "CORS_ORIGINS",
        default="http://localhost:5173,http://localhost:5180",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Después del CORS general: en Starlette el último middleware entra primero.
app.add_middleware(TrackCorsMiddleware)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(transcripts_router, prefix="/api/transcripts", tags=["transcripts"])
app.include_router(clientes_router, prefix="/api/clientes", tags=["clientes"])
app.include_router(cobranza_router, prefix="/api/cobranza", tags=["cobranza"])
app.include_router(mkt_router, prefix="/api/mkt", tags=["mkt"])
app.include_router(meta_router, prefix="/api/meta", tags=["meta"])
app.include_router(ideas_router, prefix="/api/ideas", tags=["ideas"])
app.include_router(webinars_router, prefix="/api/webinars", tags=["webinars"])
app.include_router(integraciones_router, prefix="/api/integraciones", tags=["integraciones"])
# Sin sesión: el script/pixel de la landing se autentica con el token de la integración.
app.include_router(track_router, prefix="/api/track", tags=["track"])
app.include_router(integrantes_router, prefix="/api/integrantes", tags=["integrantes"])
app.include_router(reuniones_router, prefix="/api/reuniones", tags=["reuniones"])
app.include_router(activacion_ia_router, prefix="/api/activacion-ia", tags=["activacion-ia"])
app.include_router(asistente_router, prefix="/api/asistente", tags=["asistente"])
app.include_router(pendientes_router, prefix="/api/pendientes", tags=["pendientes"])
app.include_router(eventos_router, prefix="/api/eventos", tags=["eventos"])
app.include_router(gcal_router, prefix="/api/calendario-ventas", tags=["calendario"])
app.include_router(ventas_router, prefix="/api/ventas", tags=["ventas"])
# El sistema del setter: pitches, métricas, notas de llamadas y respaldo.
app.include_router(setting_router, prefix="/api/setting", tags=["setting"])
# Sin sesión: los avisos de afuera se validan con su propio token.
app.include_router(webhooks_router, prefix="/api/webhooks", tags=["webhooks"])

FOTOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(Path(__file__).resolve().parent / "data")), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
