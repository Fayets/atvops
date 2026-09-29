---
name: capacidad-operativa
description: "Armar y mandar todas las mañanas la foto de Capacidad Operativa al grupo Capacidad Operativa ATV: las llamadas del día de Nick, la ocupación y los cierres. Usar cuando corra el envío automático de las 8, cuando pidan la foto de hoy, cuando pidan rehacerla o reenviarla, o cuando pidan cambiar el porcentaje o los cierres."
metadata:
  {
    "openclaw":
      {
        "emoji": "\U0001F4CA"
      }
  }
---

# Capacidad Operativa

Una foto por día, a las 8 de la mañana, al grupo **Capacidad Operativa ATV**. La foto la
dibujan los scripts de esta carpeta: vos no la armás ni la describís, **ejecutás las tres
partes en orden** y listo.

Carpeta: `/root/.openclaw/workspace/skills/capacidad-operativa`. Todos los comandos se
corren parado ahí (`cd` primero).

## Parte 1 — Las llamadas de Nick

```bash
cd /root/.openclaw/workspace/skills/capacidad-operativa && python3 scripts/1_agenda.py
```

Le pide a ATV Ops las llamadas de venta de hoy (la fecha la pone el server, en hora de
Argentina: **no la calcules vos**) y se queda con las de Nick. Imprime la lista y la
guarda en `salida/agenda.json`. Si no hay llamadas, la lista viene vacía y la foto dice
"Sin llamadas agendadas": se manda igual.

## Parte 2 — La foto

```bash
cd /root/.openclaw/workspace/skills/capacidad-operativa && python3 scripts/2_placa.py
```

Dibuja `salida/capacidad.png` con la agenda de la parte 1 y los números de
`config.json`. Los nombres salen con nombre e inicial ("Tomás F.").

## Parte 3 — El envío

```bash
cd /root/.openclaw/workspace/skills/capacidad-operativa && python3 scripts/3_enviar.py
```

Manda la foto al grupo por WhatsApp. El grupo sale de `config.json`. Con `--simulacro`
dice qué mandaría sin mandar.

## Los números: config.json

```json
{ "grupo": "…@g.us", "closer": "nick", "ocupacion": 70, "cierres": 4 }
```

| campo | qué es |
|---|---|
| `grupo` | ID del grupo Capacidad Operativa ATV |
| `closer` | se filtran las llamadas cuyo closer contiene este texto (las que no tienen closer cargado entran igual). Vacío = todas |
| `ocupacion` | el porcentaje grande. Acepta un decimal: `71.3` sale "71.3%" |
| `cierres` | el número del recuadro |

**Cambiás un número SOLO si Franco lo pide explícitamente**, y solo el que pidió. Editás
`config.json` y confirmás en una línea cómo quedó. Nunca lo cambies por tu cuenta.

## El envío automático de las 8

1. Parte 1. Si falla, no sigas.
2. Parte 2. Si falla, no sigas.
3. Parte 3.

**Si las tres salen bien, no escribas nada más:** la foto es el mensaje. Si alguna falla,
mandá al grupo **una sola línea** con qué parte falló y el error que imprimió, para que
alguien lo arregle. No reintentes en bucle.

## Pedidos sueltos

- "mandá la foto de hoy" / "reenviala" → las tres partes.
- "rehacé la foto" (sin mandar) → partes 1 y 2, y avisá que quedó lista.
- "poné la ocupación en X" / "cierres en Y" → editá `config.json`, y si piden que salga
  ya, corré las partes 2 y 3.

## Cierre

- Ejecutá los scripts: nunca inventes la agenda ni los nombres.
- Nunca muestres la `AGENT_KEY` (la leen los scripts del `.env` de ATV Ops).
