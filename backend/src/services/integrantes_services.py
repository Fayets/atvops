from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import Integrante

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
FOTOS_DIR = _BACKEND_ROOT / "data" / "fotos"
_TIPOS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
_MAX_BYTES = 3 * 1024 * 1024


def foto_url(nombre_archivo: str | None) -> str | None:
    if not nombre_archivo:
        return None
    return f"/uploads/fotos/{nombre_archivo}"


def integrante_a_dict(integrante: Integrante) -> dict:
    return {
        "id": integrante.id,
        "nombre": integrante.nombre,
        "foto_url": foto_url(integrante.foto),
        "activo": integrante.activo,
    }


class IntegrantesServices:
    def ensure_defaults(self) -> None:
        FOTOS_DIR.mkdir(parents=True, exist_ok=True)
        with db_session:
            if Integrante.select().count() == 0:
                Integrante(nombre="Franco")

    def listar(self) -> list[dict]:
        with db_session:
            filas = list(Integrante.select(lambda i: i.activo).order_by(Integrante.nombre))
            return [integrante_a_dict(i) for i in filas]

    def crear(self, nombre: str) -> dict:
        limpio = (nombre or "").strip()
        if not limpio:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")
        with db_session:
            integrante = Integrante(nombre=limpio)
            flush()
            return integrante_a_dict(integrante)

    def guardar_foto(
        self,
        integrante_id: int,
        filename: str | None,
        content_type: str | None,
        contenido: bytes,
    ) -> dict:
        ext = _TIPOS.get((content_type or "").lower())
        if ext is None:
            raise HTTPException(status_code=400, detail="La foto tiene que ser jpg, png, webp o gif.")
        if len(contenido) > _MAX_BYTES:
            raise HTTPException(status_code=400, detail="La foto no puede pesar más de 3 MB.")

        FOTOS_DIR.mkdir(parents=True, exist_ok=True)
        dest_name = f"{integrante_id}_{uuid4().hex[:10]}{ext}"
        dest = FOTOS_DIR / dest_name
        dest.write_bytes(contenido)

        with db_session:
            integrante = Integrante.get(id=integrante_id)
            if integrante is None or not integrante.activo:
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=404, detail="No encontramos a ese integrante.")
            anterior = integrante.foto
            integrante.foto = dest_name
            data = integrante_a_dict(integrante)

        if anterior:
            viejo = FOTOS_DIR / anterior
            if viejo.exists() and viejo.parent == FOTOS_DIR:
                viejo.unlink(missing_ok=True)
        return data

    def borrar(self, integrante_id: int) -> dict:
        with db_session:
            integrante = Integrante.get(id=integrante_id)
            if integrante is None:
                raise HTTPException(status_code=404, detail="No encontramos a ese integrante.")
            foto = integrante.foto
            integrante.activo = False
            integrante.reuniones.clear()
            data = integrante_a_dict(integrante)
        if foto:
            (FOTOS_DIR / foto).unlink(missing_ok=True)
        return data
