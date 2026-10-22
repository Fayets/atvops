"""
Las notas y los ajustes de la línea de pagos, guardados en la base de ATV Ops.

En el archivo original vivían en el navegador de quien los cargaba (o en la base del
artifact). Acá son del equipo: lo que anota Mauri lo ve dirección y al revés.
"""

from __future__ import annotations

import json
from datetime import datetime

COLECCIONES = ("notes", "ajustes")
MAX_BYTES = 200_000   # una nota es texto: esto alcanza de sobra y frena un pegado accidental


def _validar(coleccion: str, doc_id: str) -> None:
    if coleccion not in COLECCIONES:
        raise ValueError("Colección desconocida.")
    if not doc_id or len(doc_id) > 40:
        raise ValueError("Documento inválido.")


def listar(coleccion: str) -> list[dict]:
    from pony.orm import db_session

    from src.models import LineaPagosDoc

    _validar(coleccion, "x")
    with db_session:
        filas = [x for x in list(LineaPagosDoc.select()) if x.coleccion == coleccion]
        return [{"id": x.doc_id, "data": json.loads(x.datos)} for x in filas]


def guardar(coleccion: str, doc_id: str, datos: dict, quien: str | None) -> None:
    from pony.orm import db_session

    from src.models import LineaPagosDoc

    _validar(coleccion, doc_id)
    texto = json.dumps(datos, ensure_ascii=False)
    if len(texto.encode()) > MAX_BYTES:
        raise ValueError("Demasiado grande.")
    with db_session:
        fila = LineaPagosDoc.get(coleccion=coleccion, doc_id=doc_id)
        if fila is None:
            LineaPagosDoc(coleccion=coleccion, doc_id=doc_id, datos=texto, actualizado_por=quien)
        else:
            fila.datos, fila.actualizado_por, fila.actualizado_at = texto, quien, datetime.utcnow()


def borrar(coleccion: str, doc_id: str) -> None:
    from pony.orm import db_session

    from src.models import LineaPagosDoc

    _validar(coleccion, doc_id)
    with db_session:
        fila = LineaPagosDoc.get(coleccion=coleccion, doc_id=doc_id)
        if fila is not None:
            fila.delete()
