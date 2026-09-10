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


class UpdateConfirmado(db.Entity):
    """El texto del update tal como lo confirmó el CSM (editado a mano si hizo falta)."""

    _table_ = _tabla("updates_confirmados", "UpdateConfirmado")

    id = PrimaryKey(int, auto=True)
    texto = Required(str)
    confirmado_por = Required(str)
    confirmado_at = Required(datetime, default=datetime.utcnow)
    ronda_id = Optional(int)


class FichaCliente(db.Entity):
    """Ficha viva del cliente que mantiene Claude ronda a ronda: fase, en qué está,
    resultados, riesgo y próximos pasos. Las vistas leen esto en vez de releer transcripts."""

    _table_ = _tabla("fichas_clientes", "FichaCliente")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(str, unique=True)
    canal_id = Required(str)
    fase = Optional(str)
    fase_motivo = Optional(str)
    resumen = Optional(str)
    proximos_pasos = Optional(str)     # JSON list
    riesgo = Optional(str)             # bajo | medio | alto
    riesgo_motivo = Optional(str)
    intencion_baja = Required(bool, default=False)
    intencion_baja_extracto = Optional(str)
    wins = Optional(str)               # JSON list [{fecha, tipo, descripcion}]
    upsell = Required(bool, default=False)
    upsell_motivo = Optional(str)
    actualizado_at = Required(datetime)
    hasta = Required(int, default=0)


class DatosCliente(db.Entity):
    """Lo que el sistema NO puede deducir del canal: objetivo, ICP, contacto y
    la gente del equipo del cliente. Lo carga el CSM una vez y se corrige cuando cambia.
    El contrato y los pagos NO viven acá: son de ATV Clients."""

    _table_ = _tabla("datos_clientes", "DatosCliente")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(str, unique=True)
    canal_id = Required(str)
    # Objetivo
    objetivo = Optional(str)              # "50k USD en 90 días"
    objetivo_monto_usd = Optional(float)
    objetivo_plazo_dias = Optional(int)
    # ICP del cliente (a quién le vende él)
    nicho = Optional(str)
    ticket_promedio_usd = Optional(float)
    stage = Optional(str)                 # pre_lanzamiento | lanzando | escalando
    # Contacto
    nombre_completo = Optional(str)
    email = Optional(str)
    whatsapp = Optional(str)
    pais = Optional(str)
    zona_horaria = Optional(str)
    linkedin = Optional(str)
    # Equipo del cliente (setters, closers, editores): JSON [{nombre, rol, contacto}]
    equipo = Optional(str)
    notas = Optional(str)
    actualizado_por = Optional(str)
    actualizado_at = Required(datetime)


class EventoCliente(db.Entity):
    """Un hecho con fecha en la vida del cliente. Los escribe Claude en cada ronda
    (hitos, intenciones, cambios de fase, blockers, silencios) y el sistema en los
    cambios que calcula. Es el log que se consulta por tipo, tag, fecha o responsable."""

    _table_ = _tabla("eventos_clientes", "EventoCliente")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(str)
    canal_id = Required(str)
    fecha = Required(datetime)            # cuándo pasó (no cuándo se registró)
    tipo = Required(str)                  # hito | intencion | cambio_fase | blocker | silencio | riesgo
    titulo = Required(str)
    extracto = Optional(str)              # frase textual del canal
    responsable = Optional(str)
    tags = Optional(str)                  # JSON list del vocabulario del cerebro
    estado = Optional(str)                # abierto | resuelto (para blockers)
    resuelto_at = Optional(datetime)
    fase = Optional(str)                  # fase del cliente cuando pasó
    score = Optional(int)
    clave = Required(str)                 # dedupe: canal|fecha|tipo|titulo normalizado
    fuente = Required(str, default="claude")
    registrado_at = Required(datetime, default=datetime.utcnow)


class ReunionCrm(db.Entity):
    """La llamada de ventas, con lo que ATV Ops sabe de ella.

    Es la base propia: acá vive el resultado que carga el equipo, y manda sobre lo que
    diga el CRM de atv-mkt. Ese sistema pisa fechas y duplica leads en cada sync, así que
    si el resultado viviera solo allá se perdería. Se sigue escribiendo también en el CRM
    para que atv-mkt muestre lo mismo mientras dure la mudanza, pero lo que se lee en el
    tablero sale de acá.

    Guarda además qué llamada del CRM corresponde a qué reunión del Google Calendar.

    Hace falta porque el CRM guarda una sola fecha por lead y el sync de atv-mkt la
    pisa: una llamada cargada para la reunión del 3 amanece con la fecha del 11, y sin
    esta referencia la del 3 vuelve a verse como si no estuviera cargada y se duplica.
    La referencia vive acá, en la base de ATV Ops, así no se toca el esquema del CRM.
    """

    _table_ = _tabla("reuniones_crm", "ReunionCrm")

    id = PrimaryKey(int, auto=True)
    evento_id = Required(str, unique=True)   # id del evento en Google Calendar
    lead_id = Required(int, index=True, default=0)   # id en el CRM viejo; 0 = solo de acá
    prospecto = Optional(str)
    inicio_at = Optional(datetime)           # cuándo es la reunión, en hora de Argentina
    creado_por = Optional(str)
    creado_at = Required(datetime, default=datetime.utcnow)
    # Lo que cargó el equipo. Vacío = todavía no se cargó y manda lo que diga el CRM.
    resultado = Optional(str)
    closer = Optional(str)
    programa = Optional(str)
    cash_usd = Optional(float)
    saldo_usd = Optional(float)
    nota = Optional(str)
    descartada = Required(bool, default=False)
    actualizado_por = Optional(str)
    actualizado_at = Optional(datetime)


class Programa(db.Entity):
    """El catálogo de programas con su precio. Vive acá: el precio lo fija ops en ATV Ops
    y no tiene por qué depender del CRM viejo."""

    _table_ = _tabla("programas", "Programa")

    id = PrimaryKey(int, auto=True)
    nombre = Required(str, unique=True)
    precio_usd = Required(float, default=0.0)
    orden = Required(int, default=0)
    activo = Required(bool, default=True)
    actualizado_por = Optional(str)
    actualizado_at = Required(datetime, default=datetime.utcnow)


class ReporteDia(db.Entity):
    """El reporte diario que carga el setter o el closer. También vive acá."""

    _table_ = _tabla("reportes_dia", "ReporteDia")

    id = PrimaryKey(int, auto=True)
    persona = Required(str, index=True)      # nombre de quien lo carga
    rol = Required(str)                      # setter | closer
    fecha = Required(date, index=True)
    valores = Required(str, default="{}")    # JSON con las métricas del día
    nota = Optional(str)
    actualizado_por = Optional(str)
    actualizado_at = Required(datetime, default=datetime.utcnow)
