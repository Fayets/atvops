from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src import schemas
from src.services.auth_services import AuthServices, renovar_token

router = APIRouter()
service = AuthServices()
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    response: Response,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="No autenticado.")
    usuario = service.usuario_desde_token(creds.credentials)
    # Si al token le queda poco, la respuesta se lleva uno nuevo y el navegador lo guarda
    # solo: mientras alguien usa Ops la sesión no se le vence nunca.
    nuevo = renovar_token(creds.credentials)
    if nuevo:
        response.headers["X-Token-Nuevo"] = nuevo
    return usuario


def solo_interno(user: dict = Depends(get_current_user)) -> dict:
    """Cierra por API lo que la navegación ya le esconde a marketing.

    Esconder un menú no es proteger un dato: sin esto, cualquiera con la sesión de un
    usuario de marketing lee cobranza y ventas con un curl. Importa desde que existe la
    cuenta que usa el revisor de Meta, que es de afuera de la empresa.
    """
    if user.get("rol") == "marketing":
        raise HTTPException(status_code=403, detail="El área de marketing no ve estos datos.")
    return user


@router.post("/login", response_model=schemas.LoginResponse)
def login(body: schemas.LoginRequest):
    try:
        return service.login(body.username, body.password)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al iniciar sesión.")


@router.get("/me", response_model=schemas.UsuarioResponse)
def me(current_user: dict = Depends(get_current_user)):
    try:
        return current_user
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error inesperado al leer el usuario.")


@router.get("/config")
def config_login():
    """Lo público que necesita la pantalla de login: el client id de Google no es secreto."""
    from src.services.auth_services import google_client_id

    return {"google_client_id": google_client_id() or None}


@router.post("/google", response_model=schemas.LoginResponse)
def login_google(body: schemas.GoogleLoginRequest):
    return service.login_google(body.credencial)


@router.post("/entrar-como", response_model=schemas.LoginResponse)
def entrar_como(body: schemas.EntrarComoRequest, current_user: dict = Depends(get_current_user)):
    return service.entrar_como(current_user, body.username)
