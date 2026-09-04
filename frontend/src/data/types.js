/**
 * ATV Ops — contrato de datos.
 *
 * Este archivo es la única definición de forma de los datos del dashboard.
 * Los mocks de `src/data/mock/` cumplen estos tipos y `src/data/api.js` es la
 * frontera: cuando una fuente se automatiza, se reemplaza el `import` del mock
 * por un `fetch` al backend y **ningún componente cambia**.
 *
 * Regla: todo número que se muestra en pantalla declara de qué fuente viene
 * (`sourceId`) y cuándo se actualizó (`updatedAt`). Eso alimenta el KPI de
 * "% de datos automatizados" y hace que un dato a mano sea visible, no invisible.
 */

/**
 * Identificador de fuente de datos. Agregar una fuente = agregar un id acá
 * y una entrada en `src/data/sources.js`.
 * @typedef {'discord_transcripts' | 'atv_clients' | 'discord_crm' | 'ads_manager' | 'calendly' | 'payments' | 'manual'} SourceId
 */

/**
 * Estado de conexión de una fuente.
 * - `conectada`: sincroniza sola, sin intervención humana.
 * - `manual`: alguien la carga a mano (formulario, planilla, copiar y pegar).
 * - `sin_conectar`: el dato no existe en el dashboard todavía.
 * @typedef {'conectada' | 'manual' | 'sin_conectar'} SourceStatus
 */

/**
 * @typedef {Object} DataSource
 * @property {SourceId} id
 * @property {string} nombre            Nombre de la herramienta real.
 * @property {string} descripcion       Qué dato aporta al dashboard.
 * @property {SourceStatus} status
 * @property {string | null} lastSyncAt ISO. `null` si nunca sincronizó.
 * @property {string} responsable       Quién la sostiene hoy.
 * @property {string | null} metodo     Cómo entra el dato (API, webhook, planilla…).
 * @property {string} [proximoPaso]     Qué falta para automatizarla.
 */

/**
 * Un campo concreto que el dashboard muestra, atado a su fuente.
 * El KPI "% automatizado" se calcula sobre esta lista: no es un número escrito
 * a mano, es la consecuencia de qué campos están conectados.
 * @typedef {Object} DataField
 * @property {string} id
 * @property {string} nombre
 * @property {Seccion} seccion
 * @property {SourceId} sourceId          De dónde sale el dato hoy.
 * @property {SourceId | null} objetivo   De dónde debería salir automatizado.
 */

/** @typedef {'home' | 'fulfillment' | 'ventas' | 'marketing' | 'sistemas' | 'cobranza'} Seccion */

/** Formato de presentación de una métrica. @typedef {'usd' | 'count' | 'pct' | 'days' | 'hs' | 'ratio' | 'x'} MetricFormat */

/**
 * Métrica atómica. Es la unidad que renderiza `<KpiCard>`.
 * @typedef {Object} Metric
 * @property {string} id
 * @property {string} label
 * @property {number} value
 * @property {MetricFormat} format
 * @property {number | null} previous     Mismo período anterior; `null` = sin comparación.
 * @property {SourceId} sourceId
 * @property {string} updatedAt           ISO.
 * @property {'up' | 'down' | 'neutral'} [good]  Qué dirección es buena (default: 'up').
 * @property {string} [nota]              Contexto corto, se muestra al pie.
 * @property {number | null} [objetivo]   Meta explícita, si la métrica tiene una.
 * @property {number[]} [serie]           Puntos para la sparkline, del más viejo al más nuevo.
 */

/**
 * Discrepancia entre lo que dice el dashboard y lo que dice la fuente real.
 * Es el panel de "grietas": el dashboard se audita a sí mismo.
 * @typedef {Object} Grieta
 * @property {string} id
 * @property {string} metrica              Qué número está en discusión.
 * @property {number} valorDashboard
 * @property {number} valorFuente
 * @property {MetricFormat} format
 * @property {SourceId} sourceId           Fuente que contradice al dashboard.
 * @property {'alta' | 'media' | 'baja'} severidad
 * @property {string} detectadaAt          ISO.
 * @property {string} causa                Hipótesis en una línea.
 * @property {Seccion} seccion
 */

/** @typedef {'AR' | 'CL' | 'ES'} Pais */

/**
 * Caja 1 = cliente nuevo (primera compra). Caja 2 = upsell / renovación.
 * @typedef {'caja_1' | 'caja_2'} Caja
 */

/**
 * @typedef {Object} Cliente
 * @property {string} id
 * @property {string} nombre
 * @property {Pais} pais
 * @property {string} entradaAt              ISO. Fecha de pago.
 * @property {Caja} caja
 * @property {'activo' | 'pausado' | 'churned'} estado
 * @property {number} mrrUsd
 * @property {string} ultimaActividadAt      ISO. Último movimiento en Discord/CRM.
 * @property {number | null} onboardingDias  Pago → primer entregable. `null` si sigue en curso.
 * @property {string} coachId                Coach detectado en el canal.
 * @property {Tier} tier
 * @property {string | null} churnAt         ISO si churneó.
 * @property {string} [motivoChurn]
 * @property {Activacion} activacion
 * @property {Engagement} engagement
 * @property {Outcome} outcome
 * @property {Expansion} expansion
 */

/**
 * Escalón de precio. El upsell de tier es la palanca más barata de revenue:
 * no tiene CAC.
 * @typedef {'starter' | 'growth' | 'scale'} Tier
 */

/**
 * Activación = el cliente obtuvo su primer resultado tangible. No importa el
 * tamaño de la victoria: importa que haya sentido que la cosa funciona, y que
 * haya pasado dentro de los primeros 30 días. Sin eso, el churn viene después.
 *
 * @typedef {Object} Activacion
 * @property {boolean} activado
 * @property {number | null} diasHastaResultado  Pago → primer resultado. `null` si todavía no pasó.
 * @property {string | null} primerResultadoAt   ISO.
 * @property {string | null} descripcion         El win, en una línea, tal como salió del canal.
 * @property {string | null} evidenciaMensajeId  Mensaje de Discord donde se detectó.
 * @property {BlockerId | null} blocker          Por qué no se activó (si aplica).
 */

/**
 * Causas de no-activación detectadas en los transcripts. Son las categorías que
 * el clasificador tiene que poder distinguir.
 * @typedef {'sin_accesos' | 'no_implementa' | 'coach_lento' | 'expectativa_desalineada' | 'problema_tecnico' | 'cliente_ausente'} BlockerId
 */

/**
 * Todo esto sale de los transcritos del canal del cliente. Nadie llena nada.
 * @typedef {Object} Engagement
 * @property {number} mensajesClienteSemana      Promedio de las últimas 4 semanas.
 * @property {number} mensajesCoachSemana
 * @property {number} interaccionesSemana        Idas y vueltas completas (no mensajes sueltos).
 * @property {number} respuestaCoachHs           Mediana de tiempo de respuesta del coach.
 * @property {number} diasSinMensaje             Días desde el último mensaje del cliente.
 * @property {MixConversacion} mix               Cómo se reparte lo que habla el cliente.
 * @property {number} tendencia                  Variación % de mensajes vs las 4 semanas previas.
 */

/**
 * Clasificación de lo que el cliente escribe. Un cliente que pregunta cómo
 * implementar está comprometido; uno que escribe sobre reembolsos ya se está
 * yendo. Los cuatro valores suman 100.
 * @typedef {Object} MixConversacion
 * @property {number} implementacion
 * @property {number} soporte
 * @property {number} queja
 * @property {number} celebracion
 */

/**
 * Cierra el ciclo: ¿el cliente está creciendo? Si no crece, el engagement no lo
 * salva. Si crece, refiere y compra upsells.
 * @typedef {Object} Outcome
 * @property {number} revenueInicialUsd     Facturación del cliente al entrar.
 * @property {number} revenueActualUsd
 * @property {number} audienciaInicial      Seguidores / lista al entrar.
 * @property {number} audienciaActual
 * @property {string | null} ultimoHitoAt   ISO del último resultado reportado.
 * @property {string | null} ultimoHito
 */

/**
 * @typedef {Object} Expansion
 * @property {Tier} tierInicial
 * @property {number} upsells                Cantidad de upsells comprados.
 * @property {number} revenueExpansionUsd    MRR sumado sobre el precio de entrada.
 * @property {string | null} ultimoUpsellAt
 * @property {boolean} candidatoUpsell       Señales de que está listo para subir de tier.
 */

/**
 * Coach de fulfillment. Las métricas se derivan de sus clientes, no se cargan.
 * @typedef {Object} Coach
 * @property {string} id
 * @property {string} nombre
 * @property {string} desde                  ISO. Fecha de entrada al equipo.
 * @property {number} capacidad              Máximo de clientes que puede sostener.
 */

/**
 * Actividad semanal de un cliente, reconstruida de los transcripts.
 * @typedef {Object} ActividadSemana
 * @property {string} clienteId
 * @property {string} semana                 'S31'
 * @property {number} mensajesCliente
 * @property {number} mensajesCoach
 * @property {number} respuestaCoachHs
 */

/**
 * Señal detectada en un transcript: el hecho crudo del que salen las métricas.
 * Sirve para auditar el score — si un cliente está en rojo, se puede ver por qué.
 * @typedef {Object} SenalTranscript
 * @property {string} id
 * @property {string} clienteId
 * @property {string} fechaAt                ISO.
 * @property {TipoSenal} tipo
 * @property {string} extracto               Fragmento del canal.
 * @property {'positiva' | 'neutra' | 'negativa'} peso
 */

/** @typedef {'primer_resultado' | 'implementacion' | 'queja' | 'riesgo_churn' | 'senal_upsell' | 'silencio' | 'soporte' | 'hito'} TipoSenal */

/**
 * Puente de revenue de un mes. NRR = (MRR inicial + expansión − contracción −
 * churn) / MRR inicial. Es lo que hace que el negocio componga sin traer
 * clientes nuevos todos los meses.
 * @typedef {Object} NrrMes
 * @property {string} mes                    'YYYY-MM'
 * @property {number} mrrInicialUsd
 * @property {number} expansionUsd
 * @property {number} contraccionUsd
 * @property {number} churnUsd
 * @property {number} nuevoUsd               Clientes nuevos (NO entra en el NRR).
 * @property {number} nrr                    En %, ya calculado sobre la base inicial.
 */

/**
 * Resultado del scoring de salud de un cliente. Ver `lib/scoring.js`.
 * @typedef {Object} Salud
 * @property {number} score                  0 a 100.
 * @property {'verde' | 'amarillo' | 'rojo'} semaforo
 * @property {{ nombre: string, puntos: number, max: number, detalle: string }[]} factores
 * @property {string[]} alertas              Reglas duras que se dispararon.
 */

/**
 * Punto mensual de la evolución de cartera.
 * @typedef {Object} PuntoCartera
 * @property {string} mes      'YYYY-MM'
 * @property {number} activos
 * @property {number} altas
 * @property {number} bajas
 * @property {number} mrrUsd
 */

/** @typedef {'agendado' | 'show' | 'no_show' | 'cerrado' | 'perdido'} EstadoLlamado */

/**
 * @typedef {Object} Llamado
 * @property {string} id
 * @property {string} prospecto
 * @property {Pais} pais
 * @property {string} fechaAt                ISO.
 * @property {'ads' | 'organico' | 'referido' | 'outbound'} origen
 * @property {EstadoLlamado} estado
 * @property {string} closer
 * @property {number | null} montoUsd        Cash collected; `null` si no cerró.
 * @property {string} oferta
 */

/**
 * @typedef {Object} SemanaVentas
 * @property {string} semana     Etiqueta corta, ej. 'S31'.
 * @property {string} desdeAt    ISO. Lunes de esa semana.
 * @property {number} agendados
 * @property {number} shows
 * @property {number} cierres
 * @property {number} cashUsd
 */

/**
 * @typedef {Object} Campania
 * @property {string} id
 * @property {string} nombre
 * @property {'meta' | 'youtube' | 'google' | 'tiktok'} canal
 * @property {'trafico' | 'ventas' | 'leads'} objetivo
 * @property {'activa' | 'pausada'} estado
 * @property {number} gastoUsd            Gasto del período.
 * @property {number} leads
 * @property {number} cplUsd
 * @property {number} roas
 * @property {number} frecuencia          Impresiones ÷ alcance. Máx 1.4; en 1.6 el creativo está quemado.
 * @property {string} ultimaSyncAt        ISO.
 */

/**
 * @typedef {Object} GastoCanal
 * @property {string} canal
 * @property {number} gastoUsd
 * @property {number} leads
 * @property {number} roas
 */

/** @typedef {'completado' | 'en_curso' | 'pendiente' | 'bloqueado'} EstadoPaso */

/**
 * @typedef {Object} PasoOnboarding
 * @property {string} id
 * @property {string} nombre
 * @property {EstadoPaso} estado
 * @property {string} responsable
 * @property {number} diaObjetivo             Día del proceso en que debería estar hecho.
 * @property {string | null} completadoAt     ISO.
 * @property {string} [detalle]
 */

/**
 * Una instancia de onboarding en curso o cerrada.
 * @typedef {Object} ProcesoOnboarding
 * @property {string} id
 * @property {'cliente' | 'staff'} tipo
 * @property {string} sujeto                  Nombre del cliente o de la persona.
 * @property {string} rol                     Plan contratado, o puesto.
 * @property {string} inicioAt                ISO. Pago, o firma de contrato.
 * @property {number} slaDias                 Objetivo del proceso, en días.
 * @property {number} diasTranscurridos
 * @property {PasoOnboarding[]} pasos
 * @property {string | null} cerradoAt        ISO cuando llegó al final.
 */

/**
 * Pedido de un dato que debería haber estado en el tablero.
 * Es el KPI que mide si el dashboard reemplaza a Franco como fuente de verdad.
 * Objetivo: cero.
 * @typedef {Object} PedidoDato
 * @property {string} id
 * @property {string} quien           'Juan Cruz' | 'Lucas' | …
 * @property {string} fechaAt         ISO.
 * @property {string} pregunta        El dato que pidió, tal cual.
 * @property {Seccion} seccion        Dónde debería haber estado.
 * @property {boolean} yaEstaEnTablero Si ya se cubrió en el dashboard.
 */

/**
 * Resumen de un área para la home: el titular y el link a la sección completa.
 * @typedef {Object} ResumenArea
 * @property {Seccion} seccion
 * @property {string} titulo
 * @property {string} dueno
 * @property {string} href
 * @property {Metric[]} metricas
 */

export {};

/* ------------------------------------------------------- cuadro de mando */

/**
 * Una palanca es algo que el área puede ejecutar y que produce unidades de la
 * meta: una secuencia de historias produce chats, una campaña produce leads.
 * @typedef {Object} Palanca
 * @property {string} id
 * @property {string} nombre
 * @property {'secuencia' | 'campania' | 'accion'} tipo
 * @property {number} rendimiento          Unidades que produce cada corrida.
 * @property {number} duracionDias
 * @property {string | null} ultimaVezAt   ISO. `null` si nunca se corrió.
 * @property {'lista' | 'nueva' | 'floja' | 'quemada'} estado
 * @property {string} [nota]
 */

/**
 * Meta mensual de un área. El motor de ritmo (`lib/pacing.js`) la convierte en
 * "qué hacer esta semana".
 * @typedef {Object} Meta
 * @property {string} id
 * @property {'marketing' | 'ventas' | 'fulfillment' | 'cobranza'} area
 * @property {string} nombre
 * @property {number} meta
 * @property {MetricFormat} format
 * @property {string} mes                'YYYY-MM'
 * @property {string} dueno
 * @property {SourceId} sourceId
 * @property {number[]} acumulado        Valor acumulado por día, índice 0 = día 1, hasta hoy.
 * @property {Palanca[]} [palancas]
 * @property {boolean} [principal]       La meta que manda en el área.
 */

/**
 * Acción que el sistema prescribe para esta semana.
 * @typedef {Object} Accion
 * @property {string} id
 * @property {'marketing' | 'ventas' | 'fulfillment' | 'cobranza' | 'sistemas'} area
 * @property {string} titulo             Imperativo, con el número adentro.
 * @property {string} porque             La cuenta que lo justifica, en una línea.
 * @property {string} dueno
 * @property {'alta' | 'media'} prioridad
 * @property {string} href
 */

/**
 * @typedef {Object} Cuota
 * @property {string} id
 * @property {string} cliente
 * @property {string} plan
 * @property {number} montoUsd
 * @property {string} venceAt            ISO fecha.
 * @property {'pagada' | 'pendiente' | 'vencida'} estado
 * @property {string | null} pagadaAt
 */

/**
 * @typedef {Object} Idea
 * @property {number} id
 * @property {string} texto
 * @property {string} quien
 * @property {string} fechaAt
 * @property {'Ale' | 'Franco' | null} asignada
 * @property {'idea' | 'tarea' | 'hecha'} estado
 */
