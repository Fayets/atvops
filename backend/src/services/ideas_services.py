"""Ideas de cada usuario: cada uno ve, crea y toca solo las suyas."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from pony.orm import db_session, desc, flush

from src.models import Idea, Usuario

ASIGNABLES = frozenset({"Ale", "Franco"})
ESTADOS = frozenset({"idea", "tarea", "hecha"})


def idea_a_dict(idea: Idea) -> dict:
    return {
        "id": idea.id,
        "texto": idea.texto,
        "quien": idea.quien,
        "fechaAt": idea.fecha_at.isoformat(),
        "asignada": idea.asignada,
        "estado": idea.estado,
    }


class IdeasServices:
    @staticmethod
    def _propia(idea: Idea | None, usuario_id: int) -> Idea:
        # Ajena = inexistente: no se revela que existe.
        if idea is None or idea.usuario is None or idea.usuario.id != usuario_id:
            raise HTTPException(status_code=404, detail="No existe esa idea.")
        return idea

    def listar(self, usuario_id: int) -> list[dict]:
        with db_session:
            filas = [i for i in Idea.select().order_by(desc(Idea.id)) if i.usuario is not None and i.usuario.id == usuario_id]
            return [idea_a_dict(i) for i in filas]

    def crear(self, usuario_id: int, texto: str, quien: str | None = None) -> dict:
        limpio = (texto or "").strip()
        if not limpio:
            raise HTTPException(status_code=400, detail="La idea no puede estar vacía.")
        autor = (quien or "").strip() or "Franco"
        with db_session:
            dueno = Usuario.get(id=usuario_id)
            if dueno is None:
                raise HTTPException(status_code=401, detail="Sesión inválida.")
            idea = Idea(
                usuario=dueno,
                texto=limpio,
                quien=autor,
                fecha_at=date.today(),
                estado="idea",
            )
            flush()
            return idea_a_dict(idea)

    def actualizar(
        self,
        idea_id: int,
        usuario_id: int,
        *,
        texto: str | None = None,
        asignada: str | None = None,
        estado: str | None = None,
        tocar_asignada: bool = False,
    ) -> dict:
        with db_session:
            idea = self._propia(Idea.get(id=idea_id), usuario_id)

            if texto is not None:
                limpio = texto.strip()
                if not limpio:
                    raise HTTPException(status_code=400, detail="La idea no puede estar vacía.")
                idea.texto = limpio

            if tocar_asignada:
                if asignada is None:
                    idea.asignada = None
                    if idea.estado != "hecha":
                        idea.estado = "idea"
                else:
                    if asignada not in ASIGNABLES:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Asignable inválido: {asignada}. Usá Ale o Franco.",
                        )
                    idea.asignada = asignada
                    if idea.estado != "hecha":
                        idea.estado = "tarea"

            if estado is not None:
                if estado not in ESTADOS:
                    raise HTTPException(status_code=400, detail=f"Estado inválido: {estado}.")
                idea.estado = estado
                if estado == "tarea" and not idea.asignada:
                    raise HTTPException(
                        status_code=400,
                        detail="Una tarea necesita estar asignada a Ale o Franco.",
                    )
                if estado == "idea":
                    idea.asignada = None

            return idea_a_dict(idea)

    def borrar(self, idea_id: int, usuario_id: int) -> dict:
        with db_session:
            idea = self._propia(Idea.get(id=idea_id), usuario_id)
            data = idea_a_dict(idea)
            idea.delete()
            return data
