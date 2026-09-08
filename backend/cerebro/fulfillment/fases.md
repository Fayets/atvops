---
area: fulfillment
tipo: definicion
siempre: true
tags: [fases, clientes, roadmap]
---
# Fases del cliente

Claude asigna una fase a cada cliente en cada ronda, leyendo esta lista. Para cambiar los criterios
o agregar fases, editar esta nota: el sistema toma los ids de las líneas que empiezan con `- id:`.

- id: onboarding · Onboarding · Entró hace poco: accesos, primera llamada, diagnóstico, todavía no construye nada.
- id: implementacion · Implementación · Está construyendo: oferta, avatar, VSL, embudo, contenido, roadmap. Todavía no vende con el sistema nuevo.
- id: lanzamiento · Lanzamiento · Ya salió al mercado: publica, agenda llamadas, primeras ventas o cobros con lo nuevo.
- id: escalando · Escalando · Resultados consistentes; optimiza y escala (ads, equipo, upsell, siguiente nivel).
- id: estancado · Estancado · Sin avances visibles en dos semanas o más, aunque escriba; o dejó de implementar.
- id: en_riesgo · En riesgo · Quejas, intención de baja o reembolso, silencio largo, expectativa desalineada.

## Reglas
- La fase describe dónde está HOY, no dónde debería estar por fecha de entrada.
- Un cliente puede pasar de lanzamiento a estancado si dejó de mover. No es lineal.
- "En riesgo" pisa a cualquier otra fase cuando hay intención de baja.
