from datetime import date, datetime

from pony.orm import LongStr, Optional, PrimaryKey, Required, Set

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
    """Una llamada de ventas. Es el registro: existe acá, no se re-arma en cada carga.

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
    # La identidad de la llamada. Es el id del evento de Google Calendar cuando existe;
    # si la llamada solo vive en el CRM, `lead:<id>`; si se cargó a mano, `ops:<uuid>`.
    evento_id = Required(str, unique=True)
    lead_id = Required(int, index=True, default=0)   # id en el CRM viejo; 0 = solo de acá
    prospecto = Optional(str)
    inicio_at = Optional(datetime)           # cuándo es la reunión, en hora de Argentina
    creado_por = Optional(str)
    creado_at = Required(datetime, default=datetime.utcnow)

    # --- La ficha de la llamada, copiada acá por el sync ---------------------------
    # Antes se leía de las tres fuentes en cada carga de la vista y se apareaba de nuevo
    # cada vez, adivinando por nombre y cercanía. Ahora se resuelve una sola vez, al
    # sincronizar, y lo que queda escrito es lo que se muestra.
    email = Optional(str, nullable=True)
    telefono = Optional(str, nullable=True)
    ig = Optional(str, nullable=True)
    setter = Optional(str, nullable=True)
    origen = Optional(str, nullable=True)
    calificacion = Optional(str, nullable=True)
    # Segunda reunión con el mismo prospecto: cuenta como show pero no como agenda.
    segunda = Required(bool, default=False)
    titulo = Optional(str, nullable=True)            # el título del evento, como está en Google
    url = Optional(str, nullable=True)
    link_llamada = Optional(str, nullable=True)
    agendo_at = Optional(datetime, nullable=True)    # cuándo se agendó
    agendo_en = Optional(str, nullable=True)
    ingresos_rango = Optional(str, nullable=True)
    vino_de_ads = Required(bool, default=False)
    lead_creado_at = Optional(datetime, nullable=True)
    # calendario | crm | manual: de dónde salió la llamada la primera vez.
    fuente = Required(str, default="calendario")
    sincronizado_at = Optional(datetime, nullable=True)
    # Lo que cargó el equipo. Vacío = todavía no se cargó y manda lo que diga el CRM.
    resultado = Optional(str)
    # Una reunión interna (un 1a1, una weekly) no es de venta: se puede ocultar del
    # calendario pero no entra a ninguna métrica ni a la lista de llamadas.
    es_venta = Required(bool, default=True)
    closer = Optional(str)
    programa = Optional(str)
    cash_usd = Optional(float)
    saldo_usd = Optional(float)
    nota = Optional(str)
    descartada = Required(bool, default=False)
    actualizado_por = Optional(str)
    actualizado_at = Optional(datetime)
    # --- Lo que leyó Fathom -------------------------------------------------------
    # Va aparte del resultado que carga el equipo: la IA propone, no pisa. Si el closer
    # ya cargó la llamada, acá queda el reporte al lado para poder compararlos.
    fathom_url = Optional(str, nullable=True)
    reporte_ia = Optional(LongStr, nullable=True)      # el JSON de campos extraídos
    reporte_mensaje = Optional(LongStr, nullable=True)  # el texto listo para el grupo
    reporte_at = Optional(datetime, nullable=True)
    reporte_enviado_at = Optional(datetime, nullable=True)


class PitchSetting(db.Entity):
    """Cada link de agenda que manda el setter, con lo que pasó después.

    Es el registro que Cris llevaba en SetSystem. Vive acá para que cargue en un solo
    lugar: el pitch, si agendó, si vino, si cerró y cuánto entró.

    El estado del pitch y el de la llamada son dos cosas distintas a propósito. Un pitch
    puede quedar sin respuesta —ghosted— y ahí no hay llamada; y una llamada agendada
    puede terminar en show, en ausencia o en cierre. Mezclarlos en un solo campo obliga a
    inventar estados que no existen.
    """

    _table_ = _tabla("pitches_setting", "PitchSetting")

    id = PrimaryKey(int, auto=True)
    externo_id = Optional(str, unique=True, nullable=True)   # el id que traía de SetSystem
    prospecto = Required(str)
    pitch_at = Required(date, index=True)     # cuándo se mandó el link
    setter = Optional(str, index=True, nullable=True)

    canal = Required(str, default="dm")       # dm | phone | hibrido
    origen = Required(str, default="organico")  # organico | ads

    pitch_estado = Required(str, default="pendiente")  # pendiente | booked | ghosted | denied
    agendo_at = Optional(date)                # cuándo agendó
    llamada_at = Optional(date)               # para cuándo quedó la llamada
    reprogramada_at = Optional(date)
    reprogramaciones = Required(int, default=0)

    llamada_estado = Optional(str, index=True, nullable=True)  # scheduled | showed | no_show | cancelled | deposit | closed
    cierre_at = Optional(date)
    seguimientos = Required(int, default=0)
    llamadas = Required(int, default=0)

    valor_usd = Required(float, default=0)    # lo que se vendió
    cash_usd = Required(float, default=0)     # lo que efectivamente entró

    email = Optional(str, nullable=True)
    telefono = Optional(str, nullable=True)
    usuario_ig = Optional(str, nullable=True)
    nota = Optional(str, nullable=True)

    creado_at = Required(datetime, default=datetime.utcnow)
    actualizado_at = Required(datetime, default=datetime.utcnow)
    actualizado_por = Optional(str, nullable=True)
    # Borrar es esconder: un pitch que se borró por error tiene que poder volver.
    borrado_at = Optional(datetime)


class SesionNota(db.Entity):
    """Una llamada o una conversación del setter, grabada, transcripta y resumida.

    Es la Librería de Notes de SetSystem. El audio queda en disco (data/notas), y acá vive
    lo que se saca de él: la transcripción y las notas del prospecto que lee el closer
    antes de entrar a la llamada.

    `proceso` es lo que está pasando ahora con la sesión —transcribiendo, redactando— para
    que la pantalla lo muestre sin quedarse esperando una respuesta larga.
    """

    _table_ = _tabla("sesiones_notas", "SesionNota")

    id = PrimaryKey(int, auto=True)
    externo_id = Optional(str, unique=True, nullable=True)   # el id que traía de SetSystem
    setter = Optional(str, index=True, nullable=True)
    pitch_id = Optional(int, index=True)      # a qué pitch pertenece, si se asignó
    contacto = Optional(str, nullable=True)                  # nombre, mail o usuario del prospecto
    tipo = Required(str, default="call")      # call | dm
    fecha = Required(date, index=True)
    origen = Required(str, default="grabacion")  # grabacion | subida | texto

    audio_path = Optional(str, nullable=True)                # relativo a data/
    audio_mic_path = Optional(str, nullable=True)            # la pista del micrófono cuando se grabó en dos
    duracion_seg = Optional(int)

    transcripcion = Optional(LongStr, nullable=True)
    segmentos = Optional(LongStr, nullable=True)             # JSON [{inicio, fin, texto, hablante?}]
    diarizado = Optional(str, nullable=True)                 # no | pistas
    motor = Optional(str, nullable=True)                     # whisper | pegado
    resumen = Optional(LongStr, nullable=True)               # las notas del prospecto

    proceso = Optional(str, nullable=True)                   # transcribiendo | notas | error
    proceso_error = Optional(str, nullable=True)

    creado_at = Required(datetime, default=datetime.utcnow)
    actualizado_at = Required(datetime, default=datetime.utcnow)
    borrado_at = Optional(datetime)


class DecretoMes(db.Entity):
    """Las metas del mes, decretadas por dirección y válidas para todo el equipo.

    Vivían en el navegador de cada uno, así que lo que cargaba Franco no lo veía nadie: el
    closer y el setter miraban sus números contra metas en cero. Una meta que cada uno ve
    distinta no es una meta.
    """

    _table_ = _tabla("decretos", "DecretoMes")

    id = PrimaryKey(int, auto=True)
    mes = Required(str, unique=True)          # YYYY-MM
    valores = Required(str, default="{}")     # JSON con el decreto entero
    actualizado_por = Optional(str)
    actualizado_at = Required(datetime, default=datetime.utcnow)


class MiembroEquipo(db.Entity):
    """Quién vende: closers y setters, en la base de ATV Ops.

    Reemplaza al `teammember` del CRM viejo, que tiene marcados como activos a gente que
    ya no trabaja acá y cuentas de prueba.

    `alias` existe por un problema real: el mismo closer aparece en el histórico como
    "Nick Xanderz", "Nick Xanders" y "Nick", y sin juntarlos sus números salen partidos en
    tres. Son las grafías con las que se lo escribió, separadas por coma.
    """

    _table_ = _tabla("equipo", "MiembroEquipo")

    id = PrimaryKey(int, auto=True)
    nombre = Required(str, unique=True)
    rol = Required(str, index=True)           # closer | setter
    activo = Required(bool, default=True)
    alias = Optional(str)
    username = Optional(str)                  # su usuario de ATV Ops, si tiene
    creado_at = Required(datetime, default=datetime.utcnow)


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


class ConexionApi(db.Entity):
    """Las credenciales de las plataformas que ATV Ops consulta.

    Se copiaron una vez desde atv-mkt y desde acá se usan: Instagram, ManyChat, YouTube,
    Meta Ads, Google Calendar. Tenerlas propias es lo que permite construir cosas nuevas
    sin depender de que ese sistema siga vivo.
    """

    _table_ = _tabla("conexiones_api", "ConexionApi")

    id = PrimaryKey(int, auto=True)
    plataforma = Required(str, unique=True)
    credenciales = Required(str, default="{}")   # JSON
    origen = Optional(str)                       # de dónde salieron
    actualizado_por = Optional(str)
    actualizado_at = Required(datetime, default=datetime.utcnow)


class PublicacionIg(db.Entity):
    """Lo que se publicó en Instagram, traído de la cuenta con su propio token.

    Reels e historias en la misma tabla: comparten fecha, enlace y métricas, y lo que
    cambia entre uno y otro va en `metricas`. Las historias duran 24 horas en Instagram,
    así que la sincronización cada tres horas es lo que permite conservarlas: una vez
    guardadas acá, la secuencia entera queda.
    """

    _table_ = _tabla("publicaciones_ig", "PublicacionIg")

    id = PrimaryKey(int, auto=True)
    ig_id = Required(str, unique=True)
    tipo = Required(str, index=True)          # reel | historia
    publicado_at = Required(datetime, index=True)
    permalink = Optional(str)
    caption = Optional(str)
    thumbnail = Optional(str)
    keyword = Optional(str, index=True)       # la palabra que dispara el bot
    metricas = Required(str, default="{}")    # JSON: views, reach, replies, saved…
    visto_at = Required(datetime, default=datetime.utcnow)   # cuándo se trajo
    actualizado_at = Required(datetime, default=datetime.utcnow)


class ConversacionIg(db.Entity):
    """Cada vez que alguien abrió una conversación por Instagram, o que se le mandó el link.

    El bot de ManyChat es el que las abre: cuando alguien comenta la palabra de un reel o
    escribe la palabra de la bio, arranca el flujo. Ese flujo avisa acá, así que la
    conversación queda en la base de ATV Ops en el momento en que pasa, sin depender de
    que atv-mkt siga levantado.

    El mismo camino sirve para los links de Calendly que manda el flujo: no hay forma de
    leerlos de los mensajes —Instagram no deja— pero sí de anotar cada envío cuando ocurre.
    """

    _table_ = _tabla("conversaciones_ig", "ConversacionIg")

    id = PrimaryKey(int, auto=True)
    evento = Required(str, index=True)        # conversacion | calendly | respuesta
    at = Required(datetime, index=True)
    ig_usuario = Optional(str, index=True)
    nombre = Optional(str)
    keyword = Optional(str, index=True)
    content_url = Optional(str)
    contacto_id = Optional(str, index=True)
    fuente = Optional(str, index=True)        # instagram | manychat
    payload = Optional(str)                   # el aviso crudo, por si hay que revisarlo


class PublicacionYt(db.Entity):
    """Los videos del canal, traídos con la clave del canal.

    Misma idea que las publicaciones de Instagram y por el mismo motivo: que el mes de
    contenido se pueda mirar sin pedirle nada a atv-mkt. Un video sigue sumando vistas
    durante meses, así que cada pasada refresca las métricas de los que ya están.
    """

    _table_ = _tabla("publicaciones_yt", "PublicacionYt")

    id = PrimaryKey(int, auto=True)
    yt_id = Required(str, unique=True)
    publicado_at = Required(datetime, index=True)
    titulo = Optional(str)
    descripcion = Optional(str)
    url = Optional(str)
    thumbnail = Optional(str)
    duracion_seg = Required(int, default=0)
    metricas = Required(str, default="{}")    # JSON: vistas, likes, comentarios
    visto_at = Required(datetime, default=datetime.utcnow)
    actualizado_at = Required(datetime, default=datetime.utcnow)
