"""Webinars: listado, alta, edición, duplicado y baja."""

from fastapi import APIRouter, Body, Depends, HTTPException

from src import schemas
from src.controllers.auth_controller import get_current_user
from src.services.webinars_services import WebinarsServices

router = APIRouter()
service = WebinarsServices()

ROLES_WEBINAR = frozenset({"admin", "founder", "operaciones", "marketing", "ventas"})


def _puede_webinars(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ROLES_WEBINAR:
        raise HTTPException(status_code=403, detail="No tenés acceso a webinars.")
    return user


@router.get("")
def listar(user: dict = Depends(_puede_webinars)):
    try:
        return {"webinars": service.listar()}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudieron listar los webinars: {e}") from e


@router.get("/agendas")
def agendas(user: dict = Depends(_puede_webinars)):
    """Quién agendó la llamada en el Typeform del CTA.

    Antes que /{webinar_id}, por lo mismo que zoom/disponibles: si no, FastAPI lee
    "agendas" como un id y contesta 422.
    """
    from src.services import typeform_services

    try:
        filas = typeform_services.agendas()
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"No se pudo leer Typeform: {e}") from e
    # Cruce contra el calendario: completar el formulario no es reservar la llamada.
    # Son dos pasos y entre medio se cae gente —del webinar del 28-09, 36 completaron y
    # 5 reservaron—. Sin esta columna el tablero diría "36 agendas" y nadie iría a
    # buscar a los 31 que quedaron colgados entre un paso y el otro.
    try:
        from src.services import llamadas_services

        llamadas_services.marcar_llamada_de(filas)
        desde = min((a["agendoAt"] or "9999") for a in filas) if filas else ""
        sueltas = llamadas_services.llamadas_sin_formulario(filas, desde) if desde else []
        agendadas = llamadas_services.agendas_desde(desde) if desde else []
        # Quién de las agendas venía del formulario: la lista de agendas se mira para
        # llamar, y saber si esa persona contestó el CTA cambia cómo se abre la llamada.
        del_form = {(a.get("email") or "").strip().lower() for a in filas if a.get("llamadaAt")}
        for x in agendadas:
            x["delFormulario"] = (x.get("email") or "").strip().lower() in del_form
    except Exception as e:  # noqa: BLE001 — la lista sirve igual sin el cruce
        import logging
        logging.getLogger("atv_ops.webinars").info("Cruce de agendas: %s", str(e)[:200])
        sueltas, agendadas = [], []

    # Las preguntas en el orden del formulario: la pantalla arma una columna por cada
    # una. Se sacan de las respuestas y no del formulario para no pedir dos veces lo
    # mismo, y porque lo que importa es lo que la gente efectivamente contestó.
    preguntas: list[str] = []
    for a in filas:
        for r in a["respuestas"]:
            if r["pregunta"] and r["pregunta"] not in preguntas:
                preguntas.append(r["pregunta"])
    return {
        "agendas": filas,
        "preguntas": preguntas,
        "conEmail": sum(1 for a in filas if a["conEmail"]),
        "conLlamada": sum(1 for a in filas if a.get("llamadaAt")),
        "sinFormulario": sueltas,
        "agendadas": agendadas,
    }


@router.post("/{webinar_id}/traer-agendas")
def traer_agendas(webinar_id: int, user: dict = Depends(_puede_webinars)):
    """Lleva a la Fase 2 los dos números del CTA: cuántos completaron y cuántos reservaron."""
    from src.services import llamadas_services, typeform_services

    try:
        filas = typeform_services.agendas()
        desde = min((a["agendoAt"] or "9999") for a in filas) if filas else ""
        # Las agendas son todas las del calendario, no solo las que salieron del
        # formulario: el equipo saca agenda también por DM y por el link suelto, y todas
        # terminan en el mismo lado. El 28-09 eran ocho, y solo cinco venían del CTA.
        agendadas = llamadas_services.agendas_desde(desde) if desde else []
        return service.actualizar(webinar_id, {"metricas": {
            "ctaCompletado": len(filas),
            "booked": len(agendadas),
        }}, user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"No se pudieron traer las agendas: {e}") from e


@router.get("/zoom/disponibles")
def zoom_disponibles(user: dict = Depends(_puede_webinars)):
    """Los webinars que hay en la cuenta de Zoom, para elegir de una lista.

    Tiene que estar declarada antes que /{webinar_id}: si no, FastAPI lee "zoom" como
    un id de webinar y contesta 422.
    """
    from src.services import zoom_services

    try:
        pasados = zoom_services.listar_webinars("past")
        proximos = zoom_services.listar_webinars("upcoming")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"No se pudo leer Zoom: {e}") from e

    # Un mismo webinar puede figurar en las dos listas el día que se da. Se muestra una
    # sola vez, y como próximo, que es lo que importa para elegirlo.
    vistos = set()
    salida = []
    for cual, filas in (("proximo", proximos), ("pasado", pasados)):
        for w in filas:
            if w["id"] in vistos:
                continue
            vistos.add(w["id"])
            salida.append({**w, "cuando": cual})
    return {"webinars": salida}


@router.get("/{webinar_id}")
def obtener(webinar_id: int, user: dict = Depends(_puede_webinars)):
    try:
        return service.obtener(webinar_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo leer el webinar: {e}") from e


@router.post("")
def crear(body: schemas.WebinarCreate, user: dict = Depends(_puede_webinars)):
    try:
        return service.crear(body.model_dump(), user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo crear el webinar: {e}") from e


@router.patch("/{webinar_id}")
def actualizar(webinar_id: int, body: schemas.WebinarUpdate, user: dict = Depends(_puede_webinars)):
    try:
        datos = body.model_dump(exclude_unset=True)
        return service.actualizar(webinar_id, datos, user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo actualizar el webinar: {e}") from e


@router.get("/{webinar_id}/vivo")
def vivo(webinar_id: int, user: dict = Depends(_puede_webinars)):
    """Estado del webinar en curso, armado con los webhooks de Zoom."""
    try:
        return service.vivo(webinar_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo leer el vivo: {e}") from e


@router.post("/{webinar_id}/sincronizar-zoom")
def sincronizar_zoom(webinar_id: int, user: dict = Depends(_puede_webinars)):
    """Lee el reporte de asistencia de Zoom y llena los números del día."""
    try:
        return service.sincronizar_zoom(webinar_id, user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo sincronizar con Zoom: {e}") from e


@router.post("/{webinar_id}/duplicar")
def duplicar(webinar_id: int, body: schemas.WebinarDuplicar | None = Body(None),
             user: dict = Depends(_puede_webinars)):
    try:
        return service.duplicar(webinar_id, user, (body.model_dump(exclude_unset=True) if body else {}))
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo duplicar el webinar: {e}") from e


@router.delete("/{webinar_id}")
def borrar(webinar_id: int, user: dict = Depends(_puede_webinars)):
    try:
        return service.borrar(webinar_id, user)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo borrar el webinar: {e}") from e
