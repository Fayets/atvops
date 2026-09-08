---
area: sistemas
tipo: guia
siempre: true
tags: [sistemas, infra, deploy]
---
# Sistemas

## Qué corre dónde
- ATV Ops (este sistema): `https://ops.atvos.io`, VPS Hostinger, `/opt/atv-ops`, backend puerto 8012, frontend 8092,
  base de datos Postgres en Neon (schema `ops`). Deploy: `git pull` + `docker compose up -d --build`.
- ATV Clients (bot de Discord): `/opt/atv-clients`. Escribe los transcripts en `/opt/atv-clients/transcripts`; ATV Ops solo los lee.
- Claude Code CLI (suscripción, modelo Haiku): análisis de activación 08:00 y 18:00, rondas de pedidos 09/13/16/19, y ATV AI.
- Cerebro: este vault. El servidor lo escribe en `CEREBRO_DIR` y se sincroniza a Google Drive con rclone.

## Roles en ATV Ops
admin y founder ven todo; csm ve Fulfillment, ATV AI, Calendario e Ideas; el resto ve su área.
