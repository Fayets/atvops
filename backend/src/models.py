from datetime import date, datetime

from pony.orm import Optional, PrimaryKey, Required, Set

from src.db import db


class Usuario(db.Entity):
    id = PrimaryKey(int, auto=True)
    username = Required(str, unique=True)
    password_hash = Required(str)
    nombre = Optional(str)
    creado_at = Required(datetime, default=datetime.utcnow)


class Integrante(db.Entity):
    id = PrimaryKey(int, auto=True)
    nombre = Required(str)
    foto = Optional(str)
    activo = Required(bool, default=True)
    reuniones = Set("Reunion")


class Reunion(db.Entity):
    id = PrimaryKey(int, auto=True)
    titulo = Required(str)
    fecha = Required(date)
    hora = Optional(str, default="")
    notas = Optional(str, default="")
    participantes = Set(Integrante)


class Idea(db.Entity):
    id = PrimaryKey(int, auto=True)
    texto = Required(str)
    quien = Required(str)
    fecha_at = Required(date)
    asignada = Optional(str, nullable=True)  # 'Ale' | 'Franco' | None
    estado = Required(str, default="idea")  # idea | tarea | hecha
    creado_at = Required(datetime, default=datetime.utcnow)
