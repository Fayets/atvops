---
area: fulfillment
tipo: guia
siempre: true
tags: [fulfillment, csm, clientes]
---
# Fulfillment

Fulfillment es la entrega del programa: que cada cliente implemente, tenga su primer resultado y se quede.
Corre sobre los canales de Discord (un canal por cliente) que el bot de ATV Clients transcribe en vivo.

## Rutina del CSM
- 4 rondas por día (09, 13, 16, 19): Claude lee lo nuevo de cada canal y propone el update (vista "Updates").
  Nada queda guardado hasta que el CSM lo revisa, lo edita si hace falta y lo confirma.
- Publicar el update en #updates con el formato del equipo (⚠️ pendiente, 🔲 en proceso, ✅ resuelto).
- Un pedido está resuelto cuando el equipo entregó o respondió completo, no cuando alguien dijo "dale".
- La ficha viva de cada cliente (fase, riesgo, resultados) se actualiza en la misma ronda y alimenta
  Clientes, Retención, Resultados y la ficha. Las fases se definen en `fases.md`.

## Definiciones
- Activación: primer resultado tangible reportado por el cliente (venta, cobro, cliente nuevo).
- Silencio: días desde el último mensaje del cliente. 7 días ya es alerta; tres semanas apagadas es churn anunciado.
- Score de salud 0–100: verde ≥ 75, amarillo 50–74, rojo < 50.

## Programas
Boost, Advantage, Avanzados, Principiantes. Cada uno es una categoría de Discord.
