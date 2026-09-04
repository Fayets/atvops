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
