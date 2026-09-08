from datetime import date, datetime

from pony.orm import Optional, PrimaryKey, Required, Set

from src.db import DB_SCHEMA, ES_POSTGRES, db


def _tabla(postgres: str, sqlite: str):
    """En Postgres cada tabla vive en el esquema del sistema; en SQLite local se
    conservan los nombres con los que ya existe la base."""
    return (DB_SCHEMA, postgres) if ES_POSTGRES else sqlite


# Tabla intermedia reunión↔integrante: en SQLite deja el nombre por defecto de Pony.
_TABLA_REUNION_INTEGRANTE = {"table": (DB_SCHEMA, "reunion_integrante")} if ES_POSTGRES else {}


class Usuario(db.Entity):
    _table_ = _tabla("usuarios", "Usuario")

    id = PrimaryKey(int, auto=True)
    username = Required(str, unique=True)
    password_hash = Required(str)
    nombre = Optional(str)
    # closer | setter | operaciones | ventas | marketing | founder | admin
    rol = Required(str, default="operaciones")
    creado_at = Required(datetime, default=datetime.utcnow)
    reuniones = Set("Reunion")
    ideas = Set("Idea")


class Integrante(db.Entity):
    _table_ = _tabla("integrantes", "Integrante")

    id = PrimaryKey(int, auto=True)
    nombre = Required(str)
    foto = Optional(str)
    activo = Required(bool, default=True)
    reuniones = Set("Reunion")


class Reunion(db.Entity):
    _table_ = _tabla("reuniones", "Reunion")

    id = PrimaryKey(int, auto=True)
    titulo = Required(str)
    fecha = Required(date)
    hora = Optional(str, default="")
    notas = Optional(str, default="")
    participantes = Set(Integrante, **_TABLA_REUNION_INTEGRANTE)
    # El calendario es de cada usuario: una reunión pertenece a quien la creó.
    usuario = Optional(Usuario)


class Idea(db.Entity):
    _table_ = _tabla("ideas", "Idea")

    id = PrimaryKey(int, auto=True)
    texto = Required(str)
    quien = Required(str)
    fecha_at = Required(date)
    asignada = Optional(str, nullable=True)  # 'Ale' | 'Franco' | None
    estado = Required(str, default="idea")  # idea | tarea | hecha
    creado_at = Required(datetime, default=datetime.utcnow)
    # Las ideas son de cada usuario: nadie ve las de otro.
    usuario = Optional(Usuario)
