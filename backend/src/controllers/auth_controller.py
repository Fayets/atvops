from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src import schemas
from src.services.auth_services import AuthServices

router = APIRouter()
service = AuthServices()
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="No autenticado.")
    return service.usuario_desde_token(creds.credentials)


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
