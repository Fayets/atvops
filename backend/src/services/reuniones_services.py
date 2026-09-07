from __future__ import annotations

from calendar import monthrange
from datetime import date

from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import Integrante, Reunion, Usuario
from src.services.integrantes_services import integrante_a_dict


def _reunion_a_dict(reunion: Reunion) -> dict:
    participantes = sorted(reunion.participantes, key=lambda i: i.nombre.lower())
    return {
        "id": reunion.id,
        "titulo": reunion.titulo,
        "fecha": reunion.fecha,
        "hora": reunion.hora or None,
        "notas": reunion.notas or None,
        "participantes": [integrante_a_dict(i) for i in participantes],
    }


class ReunionesServices:
    def listar_mes(self, anio: int, mes: int, usuario_id: int) -> dict:
        """Reuniones del mes DEL USUARIO. El calendario es personal: nadie ve el de otro."""
        if mes < 1 or mes > 12:
            raise HTTPException(status_code=400, detail="El mes tiene que estar entre 1 y 12.")
        inicio = date(anio, mes, 1)
        fin = date(anio, mes, monthrange(anio, mes)[1])
        with db_session:
            filas = [
                r for r in list(Reunion.select())
                if r.usuario is not None and r.usuario.id == usuario_id
                and r.fecha >= inicio and r.fecha <= fin
            ]
            filas = sorted(filas, key=lambda r: (r.fecha, r.hora or "", r.id))
            return {
                "anio": anio,
                "mes": mes,
                "reuniones": [_reunion_a_dict(r) for r in filas],
            }

    def crear(
        self,
        usuario_id: int,
        titulo: str,
        fecha: date,
        hora: str | None,
        notas: str | None,
        integrante_ids: list[int],
    ) -> dict:
        limpio = (titulo or "").strip()
        if not limpio:
            raise HTTPException(status_code=400, detail="La reunión necesita un título.")
        with db_session:
            dueno = Usuario.get(id=usuario_id)
            if dueno is None:
                raise HTTPException(status_code=401, detail="Sesión inválida.")
            reunion = Reunion(
                usuario=dueno,
                titulo=limpio,
                fecha=fecha,
                hora=(hora or "").strip(),
                notas=(notas or "").strip(),
            )
            ids = list(dict.fromkeys(integrante_ids or []))
            if ids:
                hallados = [i for i in list(Integrante.select()) if i.id in ids and i.activo]
                if len(hallados) != len(ids):
                    raise HTTPException(status_code=400, detail="Hay un integrante que no existe o está inactivo.")
                for integrante in hallados:
                    reunion.participantes.add(integrante)
            flush()
            return _reunion_a_dict(reunion)

    def borrar(self, reunion_id: int, usuario_id: int) -> dict:
        with db_session:
            reunion = Reunion.get(id=reunion_id)
            # Ajena = inexistente: no se revela que existe.
            if reunion is None or reunion.usuario is None or reunion.usuario.id != usuario_id:
                raise HTTPException(status_code=404, detail="No encontramos esa reunión.")
            data = _reunion_a_dict(reunion)
            reunion.delete()
            return data
