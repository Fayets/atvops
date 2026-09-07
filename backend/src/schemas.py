from datetime import datetime, date

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


# --------------------------------------------------------------------- auth


class LoginRequest(BaseModel):
    username: str
    password: str


class UsuarioResponse(BaseModel):
    id: int
    username: str
    nombre: str | None = None
    rol: str = "operaciones"


class LoginResponse(BaseModel):
    token: str
    user: UsuarioResponse


# --------------------------------------------------------------- transcripts


class AutorResumen(BaseModel):
    nombre: str
    mensajes: int
    primero_at: datetime | None = None
    ultimo_at: datetime | None = None


class CanalResumen(BaseModel):
    """Una fila del dashboard: un canal de Discord con su actividad agregada."""

    id: str
    canal: str
    categoria: str
    mensajes: int
    autores: list[AutorResumen]
    adjuntos: int
    caracteres: int
    primer_mensaje_at: datetime | None = None
    ultimo_mensaje_at: datetime | None = None
    dias_sin_actividad: int | None = None
    ultimo_autor: str | None = None
    ultimo_texto: str | None = None
    archivo: str
    bytes: int
    completo: bool = False
    actualizado_at: datetime | None = None


class TranscriptsResumen(BaseModel):
    base_path: str
    base_disponible: bool
    base_es_canonica: bool = False
    canales_completos: int = 0
    parcial: bool = False
    canales: int
    mensajes: int
    autores: int
    adjuntos: int
    bytes: int
    primer_mensaje_at: datetime | None = None
    ultimo_mensaje_at: datetime | None = None
    por_categoria: dict[str, int]
    mensajes_por_categoria: dict[str, int]


class TranscriptsListResponse(BaseModel):
    resumen: TranscriptsResumen
    canales: list[CanalResumen]


class MensajeTranscript(BaseModel):
    indice: int
    fecha_at: datetime
    autor: str
    contenido: str
    adjuntos: list[str]


class CanalDetalleResponse(BaseModel):
    canal: CanalResumen
    mensajes: list[MensajeTranscript]


# ------------------------------------------------------------- calendario


class IntegranteCreate(BaseModel):
    nombre: str


class IntegranteResponse(BaseModel):
    id: int
    nombre: str
    foto_url: str | None = None
    activo: bool = True


class ReunionCreate(BaseModel):
    titulo: str
    fecha: date
    hora: str | None = None
    notas: str | None = None
    integrante_ids: list[int] = []


class ReunionResponse(BaseModel):
    id: int
    titulo: str
    fecha: date
    hora: str | None = None
    notas: str | None = None
    participantes: list[IntegranteResponse]


class ReunionesMesResponse(BaseModel):
    anio: int
    mes: int
    reuniones: list[ReunionResponse]


# -------------------------------------------------------------------- ideas


class IdeaCreate(BaseModel):
    texto: str
    quien: str | None = None


class IdeaUpdate(BaseModel):
    texto: str | None = None
    asignada: str | None = None
    estado: str | None = None


class IdeaResponse(BaseModel):
    id: int
    texto: str
    quien: str
    fechaAt: str
    asignada: str | None = None
    estado: str
