---
area: fulfillment
tipo: manual
siempre: true
tags: [manual, vistas]
---
# ATV Ops — cómo funciona cada vista

ATV Ops es el tablero interno de operaciones de ATV. Fulfillment (lo que ve el CSM) se construye
sobre los transcripts de Discord: el bot de ATV Clients escribe cada mensaje de cada canal de cliente
en tiempo real, y ATV Ops los lee. Un canal de Discord en una categoría de cliente = un cliente.
Categorías (programas): Boost, Advantage, Avanzados, Principiantes. #updates es el canal interno del equipo.

## Fulfillment · Resumen
Tarjetas: Canales de cliente (clientes activos = canales que hoy están en una categoría de cliente),
Clientes en verde (% con score de salud ≥ 75), Silencio ≥ 7 días (clientes sin escribir 7 días o más),
Mensajes del cliente por semana (promedio de la cartera, últimas 4 semanas).
Semáforo: verde ≥ 75, amarillo 50–74, rojo < 50, según el score de salud.
Pulso de la cartera: mapa de calor con una fila por cliente y una columna por semana (etiquetada con
la fecha del lunes); muestra las semanas del mes elegido arriba y las 4 previas atenuadas. Color = mensajes.
Clic en una tarjeta = lista de los canales que componen ese número, con link a la ficha y al chat.

## Score de salud (0–100)
Combina: mensajes del cliente por semana, respuesta del equipo, días sin mensaje, tendencia de actividad
(últimas 4 semanas vs las 4 anteriores), mix de conversación (implementación / soporte / queja / celebración)
y activación. Reglas duras que bajan a rojo: intención de baja detectada, silencio largo.

## Fulfillment · Clientes
Lista de clientes activos con búsqueda por nombre o #canal y pestañas por programa. Cada tarjeta:
score, semáforo, coach (el miembro del equipo que más escribe en ese canal), días sin mensaje, mensajes/semana.
Clic = ficha del cliente.

## Ficha de cliente
Score y factores, últimos 30 días (una celda por día: color = mensajes del cliente, punto = el equipo respondió),
actividad semanal cliente vs equipo, mix de conversación, primer resultado (frase textual), blocker si no se
activó, señales recientes, y botón "Abrir chat en vivo".

## Fulfillment · Activación
Activación = el cliente reportó su PRIMER resultado tangible (venta, cobro, cliente nuevo, métrica concreta)
ya ocurrido. Entrada = primer mensaje del canal (todavía no es la fecha de pago).
Tarjetas: Activados en 30 días (% de elegibles: los que ya se activaron o ya pasaron los 30 días),
Mediana de días hasta el primer resultado, Sin activar.
Dos fuentes: heurística (frases como "vendí", "cobré", "primer cliente") y Claude Code, que analiza
los transcripts a las 08:00 y 18:00 y devuelve activación con frase textual, blocker en palabras del
cliente e intención de baja. Cuando hay análisis de Claude, manda sobre la heurística y la vista lo indica.
Blockers: cliente ausente (casi no escribe), no implementa (pasó la ventana sin win), bloqueo técnico,
expectativa desalineada, esperando al equipo.
Cohortes: por mes de entrada, % activados a 30 días.

## Fulfillment · Engagement
Mapa de calor semana a semana (misma ventana por mes que el pulso), mix de conversación de la cartera,
velocidad de respuesta del equipo (mediana de horas entre mensaje del cliente y respuesta), tendencia.
"Tres semanas apagadas = churn anunciado."

## Fulfillment · Retención y riesgo
Clientes fuera de verde, silencio, sin activar fuera de ventana, intención de baja (frases de reembolso,
cancelar, irse). Ordenados por score, peor primero. MRR/NRR en plata NO están conectados todavía
(vendrían de pagos / ATV Clients).

## Fulfillment · Resultados
Wins recientes (últimos 30 días), momentum positivo (tendencia ≥ +20%), candidatos a upsell (señales de
"techo" o siguiente nivel en el canal), caída fuerte de actividad (≤ −30%).

## Fulfillment · Chats en vivo
Los transcripts reales: lista de canales con el último mensaje, conversación completa que arranca desde el
final, se relee cada 15 segundos, menciones con nombre e imágenes visibles. Pestañas: Activos, Boost,
Advantage, Avanzados, Principiantes, Updates. Buscador por canal, autor o texto.

## Calendario e Ideas
Son personales: cada usuario ve y maneja solo sus reuniones y sus ideas. Una idea pasa a tarea al asignarla.

## Cobranza, Marketing, Ventas, Metas, Sistemas
Áreas de Franco / Juan Cruz / Lucas. Sistemas muestra el estado de las fuentes y del análisis de Claude
(corridas, tokens, costo). El CSM no las ve.

## Roles
admin y founder ven todo; csm (Mauri) ve Fulfillment, Calendario e Ideas; operaciones, ventas, marketing,
closer y setter ven su área.
