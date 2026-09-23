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
    en_discord: bool = True   # False = está en disco pero ya no existe en Discord (cerrado)
    actualizado_at: datetime | None = None


class TranscriptsResumen(BaseModel):
    base_path: str
    base_disponible: bool
    base_es_canonica: bool = False
    canales_completos: int = 0
    parcial: bool = False
    canales: int
    canales_cerrados: int = 0
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


class AdjuntoTranscript(BaseModel):
    url: str
    nombre: str
    es_imagen: bool = False
    local: str | None = None   # nombre del archivo guardado por el bot, si existe


class MensajeTranscript(BaseModel):
    indice: int
    fecha_at: datetime
    autor: str
    contenido: str
    adjuntos: list[AdjuntoTranscript]


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


# ---------------------------------------------------------------- asistente


class AsistenteTurno(BaseModel):
    rol: str  # 'usuario' | 'asistente'
    texto: str


class AsistentePregunta(BaseModel):
    pregunta: str
    historial: list[AsistenteTurno] = []


class AsistenteCita(BaseModel):
    nombre: str
    canalId: str | None = None
    canal: str


class AsistenteRespuesta(BaseModel):
    respuesta: str
    citas: list[AsistenteCita]
    coincidencias: int
    modelo: str | None = None
    tokens_entrada: int = 0
    tokens_salida: int = 0
    costo_usd: float = 0.0
    duracion_ms: int = 0


# ---------------------------------------------------------------- webinars


class WebinarCampania(BaseModel):
    id: str
    nombre: str = ""


class WebinarCreate(BaseModel):
    nombre: str
    fechaHora: str | None = None
    tema: str | None = None
    ctaTipo: str = "call_funnel"
    precioUsd: float = 0
    landingUrl: str | None = None
    thankYouUrl: str | None = None
    calendlyUrl: str | None = None
    whatsappGrupo: str | None = None
    campaniasAds: list[WebinarCampania] = []
    benchmarks: dict | None = None
    estado: str | None = None
    notas: str | None = None
    plantillaDeId: int | None = None


class WebinarUpdate(BaseModel):
    nombre: str | None = None
    fechaHora: str | None = None
    tema: str | None = None
    ctaTipo: str | None = None
    precioUsd: float | None = None
    landingUrl: str | None = None
    thankYouUrl: str | None = None
    calendlyUrl: str | None = None
    whatsappGrupo: str | None = None
    campaniasAds: list[WebinarCampania] | None = None
    benchmarks: dict | None = None
    metricas: dict | None = None
    estado: str | None = None
    notas: str | None = None


class WebinarDuplicar(BaseModel):
    nombre: str | None = None
    fechaHora: str | None = None
    tema: str | None = None
    calendlyUrl: str | None = None
    campaniasAds: list[WebinarCampania] | None = None


class IntegracionCreate(BaseModel):
    nombre: str | None = None
    tipo: str = "landing"
    webinarId: int


class IntegracionUpdate(BaseModel):
    nombre: str | None = None
    webinarId: int | None = None
    activo: bool | None = None
    # True = desvincular webinar aunque webinarId venga None
    quitarWebinar: bool = False


class TrackPageview(BaseModel):
    token: str
    url: str | None = None
    referrer: str | None = None
    sessionId: str | None = None
