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
- `fulfillment/clientes/<canal>.md`: la ficha viva de cada cliente (fase, en qué está, próximos pasos,
  riesgo, resultados) más sus pedidos abiertos y resueltos. Claude la actualiza en las rondas de las
  09, 13, 16 y 19 (hora Argentina) leyendo solo los mensajes nuevos. No editar a mano: se pisa.
- `fulfillment/updates/<fecha-hora>.md`: cada update confirmado por el CSM. `borrador.md` es la propuesta
  de la última ronda todavía sin confirmar.
- Las notas que trae el sistema (README, manual, fases) se actualizan solas con cada deploy mientras
  nadie las edite; si el equipo las edita, quedan como las dejó.

## Equipo
- Franco: operaciones y sistemas.
- Mauri: CSM (fulfillment, clientes).
- Juan Cruz / Lucas: marketing y ventas.
