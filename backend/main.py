from contextlib import asynccontextmanager

from pathlib import Path

from decouple import config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.controllers.auth_controller import router as auth_router
from src.controllers.clientes_controller import router as clientes_router
from src.controllers.cobranza_controller import router as cobranza_router
from src.controllers.ideas_controller import router as ideas_router
from src.controllers.integrantes_controller import router as integrantes_router
from src.controllers.reuniones_controller import router as reuniones_router
from src.controllers.transcripts_controller import router as transcripts_router
from src.db import init_db
from src.services.auth_services import AuthServices
from src.services.integrantes_services import FOTOS_DIR, IntegrantesServices


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    AuthServices().ensure_local_user()
    IntegrantesServices().ensure_defaults()
    yield


app = FastAPI(title="atv-ops", lifespan=lifespan)

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

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(transcripts_router, prefix="/api/transcripts", tags=["transcripts"])
app.include_router(clientes_router, prefix="/api/clientes", tags=["clientes"])
app.include_router(cobranza_router, prefix="/api/cobranza", tags=["cobranza"])
app.include_router(ideas_router, prefix="/api/ideas", tags=["ideas"])
app.include_router(integrantes_router, prefix="/api/integrantes", tags=["integrantes"])
app.include_router(reuniones_router, prefix="/api/reuniones", tags=["reuniones"])

FOTOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(Path(__file__).resolve().parent / "data")), name="uploads")


@app.get("/health")
def health():
    return {"status": "ok"}
