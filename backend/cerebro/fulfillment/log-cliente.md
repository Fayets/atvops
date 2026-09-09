---
area: fulfillment
tipo: definicion
siempre: true
tags: [log, eventos, historial, tags]
---
# Log de cliente

Cada cliente tiene un log de hechos con fecha. Lo escribe Claude en la misma ronda en que lee el canal
(no cuesta lecturas extra) y se consulta por tipo, tag, responsable o fecha. Vive en la base y se
publica en la nota del cliente, en `clientes/<canal>.md`.

## Tipos de evento
- id: hito · Hito · Resultado tangible, cierre, cobro, entrega grande, milestone del programa.
- id: intencion · Intención · El cliente anuncia algo: reembolso, baja, escalar, "vendo mañana", contratar equipo.
- id: cambio_fase · Cambio de fase · Pasó de una fase a otra (ver `fases.md`). Lo detecta el sistema.
- id: blocker · Blocker · Algo lo frena. Se abre y se cierra: queda `abierto` hasta que hay evidencia de resuelto.
- id: silencio · Silencio · Tres días o más sin mensajes del cliente. Lo detecta el sistema.
- id: riesgo · Riesgo · Queja, expectativa desalineada, tensión con el equipo, sin llegar a intención de baja.

## Tags (vocabulario cerrado)
Claude elige de esta lista; no inventa tags. Para agregar uno, sumar la línea acá.
- tag: problema_tecnico · Pixel, dominios, integraciones, plataforma, accesos, API.
- tag: bajo_engagement · Casi no escribe, no aparece en las llamadas, no entrega.
- tag: ready_to_scale · Resultados consistentes, pide más, techo del plan actual.
- tag: falta_oferta · Todavía no tiene oferta clara, avatar o mecanismo definido.
- tag: falta_trafico · No tiene volumen: no publica, no prospecta, ads apagados.
- tag: problema_ventas · Agenda pero no cierra, show rate bajo, guion flojo.
- tag: problema_entrega · Le cuesta entregar a sus clientes, se le cae la operación.
- tag: espera_equipo · Está frenado esperando algo de ATV.
- tag: espera_cliente · ATV está frenado esperando algo de él.
- tag: dinero · Cobro, venta, facturación, precio, reembolso.
- tag: equipo · Contrata, entrena o pierde gente (setter, closer, editor).
- tag: personal · Salud, viaje, mudanza, familia: afecta el ritmo.

## Reglas
- Un evento es un hecho con fecha, no un estado. El estado vive en la ficha.
- La frase textual del cliente vale más que el resumen: guardarla en `extracto`.
- Un blocker abierto que ya no aparece por dos semanas y el cliente siguió avanzando se cierra solo.
- Lo que el equipo debe entregar NO es un evento: eso es un pedido (ver el registro de pedidos).

## Qué se guarda a mano y qué se calcula solo
Del propuesto original quedó afuera todo lo que el sistema ya sabe. La regla es no cargar a mano nada
que se pueda deducir del canal.

- **Lo carga el CSM** (ficha del cliente → "Datos del cliente"): objetivo y plazo, ICP (nicho, ticket
  promedio, stage), contacto (nombre, email, WhatsApp, país, zona horaria, LinkedIn), la gente del
  equipo del cliente (setters, closers, editores) y notas.
- **Lo calcula el sistema**: canal, programa, coach, fecha de entrada, score, tendencia, días sin
  mensaje, semáforo.
- **Lo mantiene Claude**: fase, resumen, próximos pasos, riesgo, intención de baja, resultados, upsell
  (ficha viva) y este log de eventos.
- **Vive en ATV Clients, no acá**: plan, precio, fechas de pago, estado de pago, reembolsos y cambios
  de plan. Duplicar el contrato en dos sistemas termina en dos verdades distintas.
- **No se duplica el estado de tareas**: lo que el equipo debe entregar ya tiene su ciclo completo en el
  registro de pedidos (esperando al equipo → en proceso → esperando al cliente → resuelto).

## Cómo se consulta
Desde ATV AI, en lenguaje normal: "clientes con blocker técnico sin cerrar hace más de 7 días",
"quién tuvo hitos de dinero este mes", "qué pasó con #premia2 en agosto". La vista Clientes filtra
por fase y la ficha de cada cliente muestra su línea de tiempo.
