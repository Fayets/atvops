from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile

from src.controllers.auth_controller import get_current_user
from src.services import estructuras_services as estructuras
from src.services import narrativa_services as narrativa
from src.services import pizarra_services as pizarra

router = APIRouter()

_ROLES = {"admin", "founder", "operaciones", "marketing"}


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if (user.get("rol") or "") not in _ROLES:
        raise HTTPException(status_code=403, detail="La pizarra es de marketing.")
    return user


@router.get("")
def listar(_user: dict = Depends(_puede)):
    """Las llamadas cargadas y el contexto fijo de la marca."""
    return pizarra.listar()


@router.get("/vault")
def vault(_user: dict = Depends(_puede)):
    """Las variantes aprobadas: el vault de ideas."""
    return pizarra.vault()


@router.get("/llamadas/{llamada_id}")
def detalle(llamada_id: int, _user: dict = Depends(_puede)):
    return pizarra.detalle(llamada_id)


@router.post("/llamadas")
def crear(payload: dict = Body(...), user: dict = Depends(_puede)):
    """Un link de Fathom o de una grabación de Zoom, o la transcripción pegada; `tipo` es 1a1 o clase."""
    tipo = str(payload.get("tipo") or "1a1")
    link = str(payload.get("link") or "").strip()
    if link and "zoom.us/" in link:
        return pizarra.crear_desde_zoom(link, user.get("username"), tipo=tipo)
    if link:
        return pizarra.crear_desde_fathom(link, user.get("username"), tipo=tipo)
    return pizarra.crear(str(payload.get("texto") or ""), payload.get("titulo"), user.get("username"), tipo=tipo)


@router.post("/llamadas/archivos")
async def subir(archivos: list[UploadFile] = File(...), tipo: str = Form("1a1"), user: dict = Depends(_puede)):
    """Transcripciones exportadas (.txt de Fathom o .vtt de Zoom), de a varias."""
    cargadas, errores = [], []
    for a in archivos[:300]:
        try:
            cargadas.append(pizarra.crear_desde_archivo(a.filename or "", await a.read(), user.get("username"), tipo=tipo))
        except HTTPException as e:
            errores.append({"archivo": a.filename, "detalle": e.detail})
    return {"cargadas": cargadas, "errores": errores}


@router.delete("/llamadas/{llamada_id}")
def borrar(llamada_id: int, forzar: bool = False, _user: dict = Depends(_puede)):
    return pizarra.borrar(llamada_id, forzar)


@router.post("/llamadas/{llamada_id}/general")
def generar_general(llamada_id: int, _user: dict = Depends(_puede)):
    """Claude propone la idea general del video. Corre en segundo plano."""
    return pizarra.generar_general(llamada_id)


@router.patch("/generales/{general_id}")
def editar_general(general_id: int, payload: dict = Body(...), _user: dict = Depends(_puede)):
    return pizarra.editar_general(general_id, payload or {})


@router.post("/generales/{general_id}/aprobar")
def aprobar_general(general_id: int, user: dict = Depends(_puede)):
    """Aprueba la idea general y arranca las variantes por canal."""
    return pizarra.aprobar_general(general_id, user.get("username"))


@router.post("/generales/{general_id}/variantes")
def regenerar_variantes(general_id: int, _user: dict = Depends(_puede)):
    return pizarra.regenerar_variantes(general_id)


@router.patch("/variantes/{variante_id}")
def actualizar_variante(variante_id: int, payload: dict = Body(...), user: dict = Depends(_puede)):
    """Aprobar (va al vault), descartar, volver a propuesta o retocar el texto."""
    return pizarra.actualizar_variante(variante_id, payload or {}, user.get("username"))


@router.put("/contexto/{clave}")
def guardar_contexto(clave: str, payload: dict = Body(...), user: dict = Depends(_puede)):
    return pizarra.guardar_contexto(clave, str((payload or {}).get("texto") or ""), user.get("username"))


@router.post("/variantes/{variante_id}/secuencias")
def generar_secuencias(variante_id: int, payload: dict = Body(default={}), _user: dict = Depends(_puede)):
    """Corta, media y larga de una idea de historias aprobada. `objetivos` opcional por largo."""
    return pizarra.generar_secuencias(variante_id, (payload or {}).get("objetivos"))


@router.get("/narrativa/propuestas")
def propuestas_narrativa(_user: dict = Depends(_puede)):
    """Las últimas revisiones semanales de la narrativa, con sus cambios propuestos."""
    return narrativa.propuestas()


@router.post("/narrativa/revisar")
def revisar_narrativa(_user: dict = Depends(_puede)):
    """Revisa ya la semana pasada, sin esperar al lunes. Corre en segundo plano."""
    return narrativa.revisar(origen="manual")


@router.patch("/narrativa/propuestas/{propuesta_id}/cambios/{cambio_id}")
def decidir_cambio(propuesta_id: int, cambio_id: int, payload: dict = Body(...), user: dict = Depends(_puede)):
    """`estado` aceptado (se aplica a la narrativa) o descartado."""
    return narrativa.decidir(propuesta_id, cambio_id, str((payload or {}).get("estado") or ""), user.get("username"))


@router.get("/estructuras")
def listar_estructuras(_user: dict = Depends(_puede)):
    """Las estructuras de historias de Juan, con sus secuencias reales y cómo rinden."""
    return estructuras.listar()


@router.post("/estructuras/revisar")
def revisar_estructuras(_user: dict = Depends(_puede)):
    """Lee ya las historias nuevas en vez de esperar al lunes."""
    return estructuras.revisar(origen="manual")


@router.patch("/estructuras/{clave}")
def decidir_estructura(clave: str, payload: dict = Body(...), user: dict = Depends(_puede)):
    """`estado` activa (se acepta una propuesta) o descartada."""
    return estructuras.decidir(clave, str((payload or {}).get("estado") or ""), user.get("username"))
