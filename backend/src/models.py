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


class AnalisisActivacion(db.Entity):
    """Último análisis de Claude Code sobre un cliente: activación, blocker e
    intención de baja. Una fila por cliente, se actualiza en cada corrida."""

    _table_ = _tabla("analisis_activacion", "AnalisisActivacion")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(str, unique=True)
    canal_id = Required(str)
    resultado = Required(str)  # JSON del clasificador
    analizado_hasta = Required(int, default=0)  # cantidad de mensajes que vio
    analizado_at = Required(datetime, default=datetime.utcnow)
    modelo = Optional(str)
    tokens_entrada = Required(int, default=0)
    tokens_salida = Required(int, default=0)
    costo_usd = Required(float, default=0.0)
    error = Optional(str, nullable=True)


class AnalisisCorrida(db.Entity):
    """Registro de cada corrida (programada o manual): cuántos clientes,
    cuánto costó, cuánto tardó. Es lo que se mira al mes para decidir."""

    _table_ = _tabla("analisis_corridas", "AnalisisCorrida")

    id = PrimaryKey(int, auto=True)
    ejecutado_at = Required(datetime, default=datetime.utcnow)
    origen = Required(str, default="programado")  # programado | manual
    clientes_analizados = Required(int, default=0)
    clientes_omitidos = Required(int, default=0)
    errores = Required(int, default=0)
    tokens_entrada = Required(int, default=0)
    tokens_salida = Required(int, default=0)
    costo_usd = Required(float, default=0.0)
    duracion_s = Required(float, default=0.0)
    detalle = Optional(str, nullable=True)


class RondaPendientes(db.Entity):
    """Una ronda de revisión (09, 13, 16, 19 AR): la foto de quién debía
    respuesta, con etiquetas de Claude, y qué se resolvió desde la anterior."""

    _table_ = _tabla("rondas_pendientes", "RondaPendientes")

    id = PrimaryKey(int, auto=True)
    ejecutado_at = Required(datetime, default=datetime.utcnow)
    origen = Required(str, default="programada")  # programada | manual
    pendientes = Required(str)  # JSON
    resueltos = Required(str, default="[]")  # JSON
    etiquetados = Required(int, default=0)
    tokens_entrada = Required(int, default=0)
    tokens_salida = Required(int, default=0)
    costo_usd = Required(float, default=0.0)
    error = Optional(str, nullable=True)


class PedidoAbierto(db.Entity):
    """Un pedido del cliente (consulta, entregable, agenda…) desde que lo pide
    hasta que se resuelve de verdad. Lo mantiene Claude ronda a ronda leyendo
    solo los mensajes nuevos de cada canal."""

    _table_ = _tabla("pedidos_abiertos", "PedidoAbierto")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(str)
    canal_id = Required(str)
    tipo = Required(str)          # consulta | entregable | agenda | feedback | seguimiento | problema
    tema = Required(str)
    estado = Required(str, default="esperando_equipo")  # esperando_equipo | en_proceso | esperando_cliente | resuelto
    responsable = Optional(str)
    creado_at = Required(datetime)          # fecha del mensaje del cliente que lo abrió
    actualizado_at = Required(datetime)
    resuelto_at = Optional(datetime)
    nota = Optional(str)
    clave_ia = Optional(str)      # id que usa Claude entre rondas para el mismo pedido


class LedgerCanal(db.Entity):
    """Hasta qué mensaje de cada canal se leyó para el registro de pedidos."""

    _table_ = _tabla("ledger_canales", "LedgerCanal")

    id = PrimaryKey(int, auto=True)
    canal_id = Required(str, unique=True)
    analizado_hasta = Required(int, default=0)
    actualizado_at = Required(datetime)
