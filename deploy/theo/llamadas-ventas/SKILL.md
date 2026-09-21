---
name: llamadas-ventas
description: "Reporte de las llamadas de venta del día para el grupo de Ventas: por cada llamada, el lead, en qué quedó (cerrado, seña, seguimiento, no show), qué plan y cuánto entró, sacado de la grabación de Fathom. Usar cuando corra el reporte automático de llamadas, cuando pidan cómo vinieron las llamadas de hoy, en qué quedó una llamada puntual, o qué llamadas quedaron sin reportar."
metadata:
  {
    "openclaw":
      {
        "emoji": "\U0001F4DE"
      }
  }
---

# Llamadas de Ventas

Tenés acceso REAL a las llamadas vía el comando de abajo. Ejecutalo SIEMPRE antes de
responder. Nunca inventes el estado de una llamada ni el monto: si el dato no viene,
decí que no está.

## De dónde sale

ATV Ops guarda cada llamada de venta como un registro propio. Cuando Nick la graba con
Fathom, el sistema lee la transcripción al terminar y completa el reporte solo. Por eso
los resúmenes **ya están hechos** cuando corrés: no tenés que leer ninguna grabación.

Una llamada puede venir sin resumen (`"grabada": false`). Eso NO es un error del
sistema: significa que no hay grabación de Fathom para esa llamada, así que nadie la va
a poder reportar solo. **Es lo más accionable del reporte — siempre nombralas.**

## Autenticación

Header `X-Agent-Key` en todos. Key: la misma que MKT y Clients. Nunca la muestres.
ATV Ops: `http://localhost:8012`

## Comando

Fecha: NO la calcules vos (el server está en UTC y de noche da mal). El endpoint ya usa
hora de Argentina solo. Pasá `fecha=AAAA-MM-DD` únicamente si te piden otro día.

```bash
curl --fail --silent --show-error --max-time 25 \
  -H "X-Agent-Key: $ATV_AGENT_KEY" \
  "http://localhost:8012/api/webhooks/fathom/dia"
```

Devuelve `fecha`, `sinGrabacion` (cuántas quedaron sin grabar) y `llamadas[]`, cada una con:

| campo | qué es |
|---|---|
| `hora` | HH:MM, hora de Argentina |
| `prospecto` | el lead |
| `closer` | quién la tomó |
| `estado` | Cerrado · Seña · Seguimiento · No show · Descalificado · Cancelada · Re-agenda · Descartada, o `null` |
| `plan` | el programa que se ofreció, o `null` |
| `cashUsd` | lo que entró o se comprometió en la llamada |
| `proximoPaso` | qué se comprometió cada parte y para cuándo |
| `objecion` | la objeción que quedó sin resolver |
| `grabada` | `false` = sin grabación de Fathom |

`estado` en `null` con `grabada: true` significa que la llamada se grabó pero no se pudo
determinar en qué quedó. Decilo así, no lo completes por tu cuenta.

## Reporte de llamadas (automático o "cómo vinieron las llamadas")

Ejecutá el comando y armá el mensaje. Títulos en *negrita*, respetá las líneas en
blanco, NO uses triple backtick. Va al **grupo de Ventas**.

*LLAMADAS DEL DÍA {DD/MM}*

*{hora} · {prospecto}* ({closer})
{estado} · {plan} · ${cashUsd}
↳ {proximoPaso}
⚠️ {objecion}

_{n} llamadas · {cerradas} cerradas · ${total} en la mesa_
_{sinGrabacion} sin grabar en Fathom: {lista de prospectos}_

Reglas del reporte:

- **Una llamada, un bloque de 2 a 4 líneas.** Es para leer en el celular parado.
- La línea del medio solo lleva lo que exista. Sin plan ni cash, queda solo el estado.
- `↳` y `⚠️` solo si hay próximo paso u objeción. No pongas la flecha vacía.
- Si `grabada` es `false`, el bloque es una sola línea:
  *{hora} · {prospecto}* ({closer}) — _sin grabación_
- El total de la última línea es la suma de `cashUsd`, nada más. No sumes proyecciones
  ni seguimientos.
- Números con punto de miles.
- Si no hubo llamadas, decilo en una línea y listo. No armes el cuadro vacío.

## Preguntas sueltas

- "¿cómo vinieron las llamadas?" / "¿qué pasó hoy?" → el reporte completo.
- "¿en qué quedó la de {nombre}?" → buscá ese prospecto y contá su bloque, con el
  próximo paso y la objeción. Si tiene `fathomUrl`, pasá el link.
- "¿qué llamadas faltan reportar?" → solo las de `grabada: false`, más las que tienen
  `grabada: true` y `estado: null`.
- "¿cuánto entró hoy en llamadas?" → la suma de `cashUsd`. **Aclarale que eso es lo
  comprometido en la llamada, no lo cobrado**: el cash cobrado lo da `caja-diaria`
  desde Clients, y son números distintos. No los mezcles nunca.

## Cierre

- Ejecutá el comando antes de responder. Los campos ya vienen calculados.
- Nunca expongas la key.
- Lo accionable va primero: las llamadas sin grabar y las que quedaron sin estado.
