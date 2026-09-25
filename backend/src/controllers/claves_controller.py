"""Las claves de las plataformas que ATV Ops consulta.

Solo dirección las ve. Nunca sale un secreto entero por acá: la lectura devuelve los
últimos cuatro caracteres y el largo, que alcanza para reconocer cuál está cargada sin
convertir la pantalla en un lugar de donde copiar tokens.
"""

from fastapi import APIRouter, Depends, HTTPException

from src.controllers.auth_controller import get_current_user
from src.services import conexiones_services as conexiones

router = APIRouter()

ROLES = frozenset({"admin", "founder", "operaciones"})


def _puede(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") not in ROLES:
        raise HTTPException(status_code=403, detail="Las claves API las maneja dirección.")
    return user


@router.get("")
def listar(user: dict = Depends(_puede)):
    try:
        return {"plataformas": conexiones.para_la_vista()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudieron leer las claves: {e}") from e


@router.put("/{plataforma}")
def actualizar(plataforma: str, body: dict, user: dict = Depends(_puede)):
    """Guarda los campos que vinieron con algo. Vacío = no tocar; BORRAR = vaciar."""
    try:
        r = conexiones.actualizar(plataforma, body or {}, user.get("username") or "")
        return {**r, "plataformas": conexiones.para_la_vista()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo guardar: {e}") from e


@router.post("/{plataforma}/probar")
def probar(plataforma: str, user: dict = Depends(_puede)):
    """Usa la credencial contra la plataforma de verdad.

    Una clave que no se puede probar es una clave en la que nadie confía: pegar un token
    y no saber si sirve hasta que un tablero aparezca vacío tres días después es peor que
    no tener la pantalla.
    """
    try:
        if plataforma == "meta_ads":
            from src.services.meta_services import MetaServices

            r = MetaServices().ads_resumen()
            n = len(r.get("campanias") or [])
            return {"ok": True, "detalle": f"{n} campaña(s) leídas del Ads Manager."}

        if plataforma == "youtube":
            from src.services import youtube_services

            r = youtube_services.sincronizar()
            leidos = r.get("leidos") if isinstance(r, dict) else None
            return {"ok": True,
                    "detalle": f"Canal leído ({leidos} video(s))." if leidos is not None
                    else "El canal respondió."}

        return {"ok": None, "detalle": "Esta plataforma todavía no tiene prueba automática."}
    except HTTPException as e:
        return {"ok": False, "detalle": str(e.detail)[:300]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "detalle": str(e)[:300]}
