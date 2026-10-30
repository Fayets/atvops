import logging

from fastapi import APIRouter, Body, Depends, HTTPException

from src.controllers.auth_controller import get_current_user, solo_interno
from src.services import cartera_services as cartera
from src.services import instagram_services as instagram
from src.services import youtube_services as youtube
from src.services import conversaciones_services as conversaciones
from src.services import metas_services as metas
from src.services import marketing_services as marketing
from src.services import onboarding_services as onboarding
from src.services import reporte_semanal_services as reporte
from src.services import llamadas_services as llamadas
from src.services import lab_closing_services as lab_closing
from src.services import ventas_services as ventas

router = APIRouter()
logger = logging.getLogger("atv_ops.ventas")
log = logging.getLogger("atv_ops.ventas")


@router.get("")
def resumen(_user: dict = Depends(solo_interno), mes: str | None = None, refrescar: bool = False):
    """Métricas reales de ventas desde el CRM de Marketing."""
    try:
        return ventas.resumen(mes=mes, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló calcular las métricas de ventas")
        raise HTTPException(status_code=500, detail=f"Error al calcular ventas: {str(e)[:180]}")


@router.get("/estado")
def estado(_user: dict = Depends(get_current_user)):
    return ventas.estado()


@router.get("/programas")
def programas(_user: dict = Depends(solo_interno)):
    """Catálogo de programas con su precio: la facturación de cada venta."""
    try:
        return {"programas": ventas.programas()}
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer los programas.")


@router.put("/programas")
def guardar_programa(user: dict = Depends(solo_interno), payload: dict = Body(...)):
    try:
        return {"programas": ventas.guardar_programa(payload, user)}
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al guardar el programa.")


@router.delete("/programas/{programa_id}")
def borrar_programa(programa_id: int, user: dict = Depends(solo_interno)):
    try:
        return {"programas": ventas.borrar_programa(programa_id, user)}
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al borrar el programa.")


@router.get("/lab-closing")
def lab_closing_llamadas(user: dict = Depends(solo_interno), mes: str | None = None):
    """Las llamadas grabadas por Fathom con lo que la IA sacó de cada una."""
    try:
        return lab_closing.listar(user, mes=mes)
    except HTTPException as e:
        raise e
    except Exception:
        log.exception("No se pudo armar el laboratorio de closing")
        raise HTTPException(status_code=500, detail="No se pudo armar el laboratorio de closing.")


@router.post("/lab-closing/analizar")
def lab_closing_analizar(user: dict = Depends(solo_interno), payload: dict = Body(...)):
    """Pega un link de Fathom a una llamada y la analiza con la IA."""
    try:
        return lab_closing.analizar((payload or {}).get("llamadaId"), (payload or {}).get("url") or "", user)
    except HTTPException as e:
        raise e
    except Exception:
        log.exception("No se pudo analizar la grabación")
        raise HTTPException(status_code=500, detail="No se pudo analizar la grabación.")


@router.get("/mis-llamadas")
def mis_llamadas(user: dict = Depends(solo_interno), closer: str | None = None, mes: str | None = None):
    """Las llamadas del closer logueado: lo que viene y lo que le falta reportar."""
    try:
        return ventas.mis_llamadas(user, closer=closer, mes=mes)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer tus llamadas.")


@router.get("/mi-embudo")
def mi_embudo(user: dict = Depends(solo_interno), mes: str | None = None):
    """El embudo del director con las llamadas del closer logueado."""
    try:
        return ventas.embudo_closer(user, mes=mes)
    except HTTPException as e:
        raise e
    except Exception:
        log.exception("Falló armar el embudo del closer")
        raise HTTPException(status_code=500, detail="Error inesperado al armar tu embudo.")


@router.get("/llamadas-del-mes")
def llamadas_del_mes(user: dict = Depends(solo_interno), mes: str | None = None):
    """Todas las llamadas del mes, de todos los closers: la lista del director."""
    try:
        return ventas.llamadas_del_mes(user, mes=mes)
    except HTTPException as e:
        raise e
    except Exception:
        log.exception("Falló leer las llamadas del mes")
        raise HTTPException(status_code=500, detail="Error inesperado al leer las llamadas del mes.")


@router.get("/mis-reportes")
def mis_reportes(user: dict = Depends(solo_interno), mes: str | None = None, rol: str = "setter"):
    """Los días del mes con y sin reporte cargado."""
    try:
        return ventas.mis_reportes(user, mes=mes, rol=rol if rol in ("setter", "closer") else "setter")
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer tus reportes.")


@router.post("/mis-reportes/{fecha}")
def guardar_reporte(fecha: str, user: dict = Depends(solo_interno), payload: dict = Body(...), rol: str = "setter"):
    """Carga o corrige el reporte de un día."""
    try:
        return ventas.guardar_reporte(fecha, payload, user, rol=rol if rol in ("setter", "closer") else "setter")
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al guardar el reporte.")


@router.post("/llamadas/{lead_id}/resultado")
def registrar_resultado(lead_id: str, user: dict = Depends(solo_interno), payload: dict = Body(...),
                        mes: str | None = None, lista: bool = True):
    """El closer marca cómo salió la llamada, qué programa compró y cuánto cash dejó."""
    try:
        return ventas.registrar_resultado(lead_id, payload, user, mes=mes, con_lista=lista)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        # Con el motivo a la vista se puede arreglar; el mensaje genérico no decía nada.
        log.exception("Falló guardar el resultado de la llamada %s", lead_id)
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el resultado: {str(e)[:180]}")


@router.post("/llamadas/{lead_id}/closer")
def asignar_closer(lead_id: str, user: dict = Depends(solo_interno), payload: dict = Body(...),
                   mes: str | None = None, lista: bool = True):
    """Quién tomó la llamada, sin tener que cargarle el resultado. Vacío la deja sin dueño."""
    try:
        return ventas.asignar_closer(lead_id, payload.get("closer") or "", user, mes=mes, con_lista=lista)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló asignar el closer de la llamada %s", lead_id)
        raise HTTPException(status_code=500, detail=f"No se pudo asignar la llamada: {str(e)[:180]}")


@router.post("/llamadas/{lead_id}/programa-ofrecido")
def ofrecer_programa(lead_id: str, user: dict = Depends(solo_interno), payload: dict = Body(...),
                     mes: str | None = None, lista: bool = True):
    """Qué programa se ofreció en la llamada, sin cargarle el resultado."""
    try:
        return ventas.ofrecer_programa(lead_id, payload.get("programa") or "", user, mes=mes, con_lista=lista)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló anotar el programa ofrecido de la llamada %s", lead_id)
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el programa: {str(e)[:180]}")


@router.post("/llamadas/{lead_id}/fathom")
def guardar_fathom(lead_id: str, user: dict = Depends(solo_interno), payload: dict = Body(...),
                   mes: str | None = None, lista: bool = True):
    """El link de Fathom de la llamada, pegado a mano."""
    try:
        return ventas.guardar_fathom(lead_id, payload.get("url") or "", user, mes=mes, con_lista=lista)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló guardar el link de Fathom de la llamada %s", lead_id)
        raise HTTPException(status_code=500, detail=f"No se pudo guardar el link: {str(e)[:180]}")


@router.post("/llamadas/{lead_id}/cerrar")
def cerrar_sena(lead_id: str, user: dict = Depends(solo_interno), payload: dict = Body(...),
                mes: str | None = None, lista: bool = True):
    """Una seña que terminó de cerrar: el cash se anota en el mes en que entró.

    La llamada no se toca. `abrir: true` deshace el cierre.
    """
    try:
        if (payload or {}).get("abrir"):
            return ventas.abrir_sena(lead_id, user, mes=mes, con_lista=lista)
        return ventas.cerrar_sena(lead_id, payload, user, mes=mes, con_lista=lista)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló cerrar la seña de la llamada %s", lead_id)
        raise HTTPException(status_code=500, detail=f"No se pudo cerrar la llamada: {str(e)[:180]}")


@router.post("/llamadas/{lead_id}/descartar")
def descartar_llamada(lead_id: str, user: dict = Depends(solo_interno), recuperar: bool = False,
                      mes: str | None = None, lista: bool = True):
    """Saca la llamada de la lista y de las métricas, o la devuelve con `recuperar=true`."""
    try:
        return ventas.descartar_llamada(lead_id, user, recuperar=recuperar, mes=mes, con_lista=lista)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló borrar la llamada %s", lead_id)
        raise HTTPException(status_code=500, detail=f"No se pudo borrar la llamada: {str(e)[:180]}")


@router.post("/llamadas")
def crear_llamada(user: dict = Depends(solo_interno), payload: dict = Body(...)):
    """Cargar a mano una reunión que nunca pasó por el calendario (un referido, un chat)."""
    try:
        return ventas.crear_llamada_manual(payload, user)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló crear la llamada a mano")
        raise HTTPException(status_code=500, detail=f"No se pudo crear la llamada: {str(e)[:180]}")


@router.get("/instagram")
def instagram_contenido(_user: dict = Depends(get_current_user), mes: str | None = None):
    """Reels y secuencias de historias del mes, con lo que midió Instagram."""
    from datetime import date as _date

    try:
        hoy = _date.today()
        mes = mes or hoy.strftime("%Y-%m")
        anio, m = int(mes[:4]), int(mes[5:7])
        inicio = _date(anio, m, 1)
        fin = _date(anio + (m == 12), (m % 12) + 1, 1)
        return {"mes": mes, **instagram.contenido(inicio, fin), "estado": instagram.estado()}
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló leer el contenido de Instagram")
        raise HTTPException(status_code=500, detail=f"No se pudo leer Instagram: {str(e)[:180]}")


@router.get("/metas")
def metas_listar(_user: dict = Depends(get_current_user)):
    """Los decretos de todos los meses. Valen para el equipo entero, así que los ve todo el equipo."""
    try:
        return {"decretos": metas.listar()}
    except Exception as e:  # noqa: BLE001
        log.exception("Falló leer las metas")
        raise HTTPException(status_code=500, detail=f"No se pudieron leer las metas: {str(e)[:180]}")


@router.put("/metas/{mes}")
def metas_guardar(mes: str, user: dict = Depends(get_current_user), payload: dict = Body(...)):
    """Decreta las metas de un mes. Solo dirección."""
    try:
        return metas.guardar(mes, payload, user)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló guardar las metas")
        raise HTTPException(status_code=500, detail=f"No se pudieron guardar: {str(e)[:180]}")


@router.get("/setting")
def setting_embudo(_user: dict = Depends(solo_interno), mes: str | None = None):
    """El embudo del setter: chats, pitches, agendas y shows, con lo que convierte cada paso."""
    from datetime import date as _date

    try:
        hoy = _date.today()
        mes = mes or hoy.strftime("%Y-%m")
        anio, m = int(mes[:4]), int(mes[5:7])
        inicio = _date(anio, m, 1)
        fin = _date(anio + (m == 12), (m % 12) + 1, 1)
        # Las dos últimas etapas viven en ventas: son reuniones, no conversaciones.
        v = ventas.resumen(mes).get("actual", {})
        # Cada etapa, de donde de verdad sale: el pitch lo reporta quien lo manda, la
        # agenda es un Calendly completado y el show es la reunión que ocurrió.
        pitches, fuente_pitches = ventas.pitches_del_mes(mes)
        agendas = ventas.agendas_del_calendario(mes)
        shows = ventas.reuniones_del_mes(mes).get("shows", [])
        return {"mes": mes,
                # De cuál de los dos registros salió el número, para que la vista lo diga
                # en vez de dejar al que mira adivinando por qué cambió.
                "pitchesFuente": fuente_pitches,
                # El show rate sale de ventas: shows sobre las que ya pasaron, no sobre
                # todas las agendas del mes. Dividir por las futuras da un rojo falso.
                "showRate": v.get("showRate"),
                "cierres": v.get("cierres", 0),
                "semanas": ventas.semanas_de_setting(mes),
                **conversaciones.embudo(
                    inicio, fin,
                    pitches=sum(p["cuantos"] for p in pitches),
                    agendas=len(agendas), shows=len(shows),
                    detalle_reuniones={"pitches": pitches, "agendas": agendas, "shows": shows})}
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló leer el embudo de setting")
        raise HTTPException(status_code=500, detail=f"No se pudo leer el embudo: {str(e)[:180]}")


@router.post("/setting/pitch")
def setting_pitch(user: dict = Depends(solo_interno), payload: dict = Body(...)):
    """El setter marca que mandó el link de agenda por un canal que no se lee solo."""
    if user.get("rol") not in ventas.ROLES_CARGAN_LLAMADAS:
        raise HTTPException(status_code=403, detail="Tu rol no puede marcar pitches.")
    try:
        return conversaciones.marcar_pitch(payload, user)
    except Exception as e:  # noqa: BLE001
        log.exception("Falló marcar el pitch")
        raise HTTPException(status_code=500, detail=f"No se pudo marcar: {str(e)[:180]}")


@router.get("/conversaciones")
def conversaciones_del_mes(_user: dict = Depends(get_current_user), mes: str | None = None):
    """Las conversaciones que abrió Instagram y los Calendly que se mandaron, del mes."""
    from datetime import date as _date

    try:
        hoy = _date.today()
        mes = mes or hoy.strftime("%Y-%m")
        anio, m = int(mes[:4]), int(mes[5:7])
        inicio = _date(anio, m, 1)
        fin = _date(anio + (m == 12), (m % 12) + 1, 1)
        return {"mes": mes, **conversaciones.resumen(inicio, fin)}
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló leer las conversaciones")
        raise HTTPException(status_code=500, detail=f"No se pudieron leer: {str(e)[:180]}")


@router.get("/youtube")
def youtube_contenido(_user: dict = Depends(get_current_user), mes: str | None = None):
    """Los videos del canal publicados en el mes, con lo que mide YouTube."""
    from datetime import date as _date

    try:
        hoy = _date.today()
        mes = mes or hoy.strftime("%Y-%m")
        anio, m = int(mes[:4]), int(mes[5:7])
        inicio = _date(anio, m, 1)
        fin = _date(anio + (m == 12), (m % 12) + 1, 1)
        return {"mes": mes, **youtube.contenido(inicio, fin), "estado": youtube.estado()}
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló leer el contenido de YouTube")
        raise HTTPException(status_code=500, detail=f"No se pudo leer YouTube: {str(e)[:180]}")


@router.post("/youtube/sincronizar")
def youtube_sincronizar(user: dict = Depends(get_current_user)):
    """Trae ahora lo último del canal, sin esperar la pasada de cada tres horas."""
    if user.get("rol") not in {"admin", "operaciones", "founder", "marketing"}:
        raise HTTPException(status_code=403, detail="Tu rol no puede sincronizar YouTube.")
    try:
        return youtube.sincronizar()
    except Exception as e:  # noqa: BLE001
        log.exception("Falló sincronizar YouTube")
        raise HTTPException(status_code=500, detail=f"No se pudo sincronizar: {str(e)[:180]}")


@router.post("/instagram/sincronizar")
def instagram_sincronizar(user: dict = Depends(get_current_user)):
    """Trae ahora lo último de Instagram, sin esperar la pasada de cada tres horas."""
    if user.get("rol") not in {"admin", "operaciones", "founder", "marketing"}:
        raise HTTPException(status_code=403, detail="Tu rol no puede sincronizar Instagram.")
    try:
        return instagram.sincronizar()
    except Exception as e:  # noqa: BLE001
        log.exception("Falló sincronizar Instagram")
        raise HTTPException(status_code=500, detail=f"No se pudo sincronizar: {str(e)[:180]}")


@router.post("/instagram/cta")
def instagram_marcar_cta(user: dict = Depends(get_current_user), payload: dict = Body(...)):
    """Marca si un día de historias tenía CTA. Solo las marcadas suman chats al embudo."""
    if user.get("rol") not in {"admin", "operaciones", "founder", "marketing", "ventas"}:
        raise HTTPException(status_code=403, detail="Tu rol no puede marcar el CTA de una secuencia.")
    try:
        return instagram.marcar_cta(
            str((payload or {}).get("fecha") or ""),
            bool((payload or {}).get("cta")),
            quien=str(user.get("nombre") or user.get("username") or ""),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        log.exception("Falló marcar el CTA de la secuencia")
        raise HTTPException(status_code=500, detail=f"No se pudo marcar: {str(e)[:180]}")


@router.post("/instagram/reels/chats")
def instagram_marcar_reel_chats(user: dict = Depends(get_current_user), payload: dict = Body(...)):
    """Marca si un reel suma chats al contador manual, y cuántos."""
    if user.get("rol") not in {"admin", "operaciones", "founder", "marketing", "ventas"}:
        raise HTTPException(status_code=403, detail="Tu rol no puede marcar los chats de un reel.")
    try:
        chats = (payload or {}).get("chats")
        return instagram.marcar_reel_chats(
            str((payload or {}).get("mediaId") or (payload or {}).get("id") or ""),
            bool((payload or {}).get("sumaChats", (payload or {}).get("suma", True))),
            chats=None if chats is None else int(chats),
            quien=str(user.get("nombre") or user.get("username") or ""),
        )
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        log.exception("Falló marcar los chats del reel")
        raise HTTPException(status_code=500, detail=f"No se pudo marcar: {str(e)[:180]}")


@router.put("/instagram/reels/cta")
def instagram_corregir_cta(user: dict = Depends(get_current_user), payload: dict = Body(...)):
    """Corrige si un reel tiene CTA: {mediaId, esCta: true|false|null, palabra}. null = automático."""
    if user.get("rol") not in {"admin", "operaciones", "founder", "marketing", "ventas"}:
        raise HTTPException(status_code=403, detail="Tu rol no puede corregir el CTA de un reel.")
    from src.services import chats_reels_services

    es_cta = (payload or {}).get("esCta")
    if es_cta is not None and not isinstance(es_cta, bool):
        raise HTTPException(status_code=400, detail="esCta es true, false o null.")
    palabra = str((payload or {}).get("palabra") or "").strip() or None
    if es_cta is True and palabra and len(palabra) > 60:
        raise HTTPException(status_code=400, detail="La palabra es demasiado larga.")
    return chats_reels_services.corregir(
        str((payload or {}).get("mediaId") or ""), es_cta, palabra,
        str(user.get("nombre") or user.get("username") or ""))


@router.post("/youtube/videos/chats")
def youtube_marcar_video_chats(user: dict = Depends(get_current_user), payload: dict = Body(...)):
    """Marca si un video de YouTube suma chats al contador manual, y cuántos."""
    if user.get("rol") not in {"admin", "operaciones", "founder", "marketing", "ventas"}:
        raise HTTPException(status_code=403, detail="Tu rol no puede marcar los chats de un video.")
    try:
        chats = (payload or {}).get("chats")
        return youtube.marcar_video_chats(
            str((payload or {}).get("videoId") or (payload or {}).get("id") or ""),
            bool((payload or {}).get("sumaChats", (payload or {}).get("suma", True))),
            chats=None if chats is None else int(chats),
            quien=str(user.get("nombre") or user.get("username") or ""),
        )
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        log.exception("Falló marcar los chats del video")
        raise HTTPException(status_code=500, detail=f"No se pudo marcar: {str(e)[:180]}")


@router.post("/reuniones/{evento_id}/mover")
def mover_reunion(evento_id: str, user: dict = Depends(solo_interno),
                  payload: dict = Body(default={})):
    """Deja la llamada en otro día dentro de ATV Ops. No toca Google Calendar."""
    try:
        return ventas.mover_llamada(evento_id, (payload or {}).get("fecha") or "", user)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló mover la reunión %s", evento_id)
        raise HTTPException(status_code=500, detail=f"No se pudo mover la llamada: {str(e)[:180]}")


@router.post("/reuniones/{evento_id}/ocultar")
def ocultar_reunion(evento_id: str, user: dict = Depends(solo_interno),
                    payload: dict = Body(default={}), mostrar: bool = False):
    """Saca del calendario una reunión que no es de venta, o la vuelve a mostrar."""
    try:
        return ventas.ocultar_evento(evento_id, payload or {}, user, mostrar=mostrar)
    except HTTPException as e:
        raise e
    except Exception as e:  # noqa: BLE001
        log.exception("Falló ocultar la reunión %s", evento_id)
        raise HTTPException(status_code=500, detail=f"No se pudo ocultar la reunión: {str(e)[:180]}")


@router.get("/reuniones")
def reuniones(user: dict = Depends(solo_interno), desde: str | None = None, hasta: str | None = None):
    """Estado de cada reunión del calendario, para pintarlo y editarlo desde el calendario."""
    from datetime import date as _date, timedelta as _td

    try:
        hoy = _date.today()
        d0 = _date.fromisoformat(desde) if desde else hoy - _td(days=7)
        d1 = _date.fromisoformat(hasta) if hasta else hoy + _td(days=21)
        if d1 < d0:
            d0, d1 = d1, d0
        return ventas.estado_de_las_reuniones(d0, min(d1 + _td(days=1), d0 + _td(days=120)), user)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer las reuniones.")


@router.post("/llamadas/sincronizar")
def sincronizar_llamadas(user: dict = Depends(solo_interno)):
    """Vuelve a mirar el calendario y el CRM ahora mismo, sin esperar al reloj."""
    if user.get("rol") not in ventas.ROLES_CARGAN_LLAMADAS:
        raise HTTPException(status_code=403, detail="Tu rol no puede sincronizar las llamadas.")
    try:
        return llamadas.sincronizar()
    except Exception as e:  # noqa: BLE001
        log.exception("Falló sincronizar las llamadas")
        raise HTTPException(status_code=500, detail=f"No se pudo sincronizar: {str(e)[:180]}")


@router.get("/mi-setting")
def mi_setting(user: dict = Depends(solo_interno), mes: str | None = None):
    """Los números del setter: hoy, el mes y las llamadas que agendó."""
    try:
        return ventas.mi_setting(user, mes=mes)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer tu setting.")


@router.get("/marketing")
def marketing_real(_user: dict = Depends(get_current_user), mes: str | None = None, refrescar: bool = False):
    """Ads, contenido, historias y setting del mes, del CRM de Marketing."""
    try:
        return marketing.resumen(mes=mes, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer marketing.")


@router.get("/cobranza")
def cobranza_real(_user: dict = Depends(solo_interno), mes: str | None = None, refrescar: bool = False):
    """Cuotas y deuda de la cartera, del esquema clients."""
    try:
        return cartera.resumen(mes=mes, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer cobranza.")


@router.get("/cartera-ops")
def cartera_ops(_user: dict = Depends(solo_interno), mes: str | None = None):
    """Altas, bajas, vencimientos y plata de la cartera para la vista OPS."""
    try:
        return cartera.ops(mes=mes)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer la cartera.")


@router.get("/reporte-semanal")
def reporte_semanal(_user: dict = Depends(solo_interno), semana: str | None = None, refrescar: bool = False):
    """Todo lo que pasó en una semana: marketing, ventas, cartera y ads."""
    try:
        return reporte.reporte(semana=semana, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al armar el reporte semanal.")


@router.get("/onboarding")
def onboarding_real(_user: dict = Depends(solo_interno), mes: str | None = None, refrescar: bool = False):
    """Los onboardings que llegaron por ATV Onboarding."""
    try:
        return onboarding.resumen(mes=mes, refrescar=refrescar)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer los onboardings.")


@router.get("/fuentes")
def fuentes(_user: dict = Depends(get_current_user)):
    """Qué fuentes están conectadas: lo que no lo esté, se muestra en cero."""
    return {"crm": ventas.estado(), "marketing": marketing.estado(), "cobranza": cartera.estado(),
            "onboarding": onboarding.estado()}


# ------------------------------------------------------------------ equipo de ventas

ROLES_DIRIGEN_VENTAS = frozenset({"ventas", "admin", "founder", "operaciones"})


def _dirige_ventas(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ROLES_DIRIGEN_VENTAS:
        raise HTTPException(status_code=403, detail="Solo el director de ventas asigna roles.")
    return user


@router.get("/equipo-roles")
def equipo_roles(_user: dict = Depends(_dirige_ventas)):
    from src.services import equipo_services

    return {"personas": equipo_services.personas(), "roles": list(equipo_services.ROLES)}


@router.put("/equipo-roles/{username}")
def equipo_roles_asignar(username: str, user: dict = Depends(_dirige_ventas), payload: dict = Body(...)):
    from src.services import equipo_services

    try:
        equipo_services.asignar(username, payload.get("roles") or [])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    logger.info("%s asignó roles de ventas a %s: %s", user.get("username"), username, payload.get("roles"))
    ventas._olvidar_meses()
    return {"personas": equipo_services.personas()}


@router.get("/director")
def director(_user: dict = Depends(solo_interno), desde: str = "", hasta: str = "",
             programa: str | None = None, closer: str | None = None):
    """El home del director para cualquier período, programa y closer."""
    from datetime import date

    try:
        d, h = date.fromisoformat(desde), date.fromisoformat(hasta)
    except ValueError:
        raise HTTPException(status_code=400, detail="desde y hasta van como AAAA-MM-DD.") from None
    if h < d or (h - d).days > 400:
        raise HTTPException(status_code=400, detail="El rango tiene que ir de una fecha a otra posterior, hasta un año.")
    return ventas.director(d, h, programa or None, closer or None)
