---
area: general
tipo: guia
siempre: true
tags: [cerebro, convenciones]
---
# Cerebro ATV

Este vault es la memoria compartida de ATV. Hay una carpeta por área: `fulfillment`, `ventas`,
`marketing`, `sistemas`, y `general` para lo que cruza áreas. ATV AI (el asistente de ATV Ops)
lee estas notas antes de responder, así que lo que está acá no hay que volver a explicarlo.

## Cómo escribir una nota
- Un archivo por tema, en markdown, con frontmatter `area`, `tipo` y `tags`.
- `siempre: true` en el frontmatter hace que la nota entre en todas las consultas de esa área. Usarlo solo
  para lo esencial (manuales, reglas): cada nota "siempre" cuesta tokens en cada pregunta.
- Las demás notas entran solo cuando la pregunta coincide con su título, tags o contenido.
- Escribir el estado actual, no el historial. Si algo cambió, se corrige la nota, no se agrega abajo.

## Qué escribe el sistema solo
- `fulfillment/pedidos/<canal>.md`: pedidos abiertos y resueltos de cada cliente, actualizados por Claude
  en las rondas de las 09, 13, 16 y 19 (hora Argentina). No editar a mano: se pisa en la próxima ronda.
- `fulfillment/updates/<fecha>.md`: el update del día para #updates, mismo formato que usa el equipo.

## Equipo
- Franco: operaciones y sistemas.
- Mauri: CSM (fulfillment, clientes).
- Juan Cruz / Lucas: marketing y ventas.
