---
name: llamadas-ventas
description: "Avisar al grupo de Ventas en qué quedó cada llamada apenas termina: el lead, el estado (cerrado, seña, seguimiento, no show), el plan y cuánto entró, sacado de la grabación de Fathom. Usar cuando corra el chequeo automático de llamadas nuevas, cuando pidan cómo vinieron las llamadas de hoy, en qué quedó una llamada puntual, o qué llamadas quedaron sin reportar."
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

## Comandos

Fecha: NO la calcules vos (el server está en UTC y de noche da mal). Los endpoints ya
usan hora de Argentina solos.

### 1. Llamadas nuevas para avisar (el chequeo automático)

```bash
curl --fail --silent --show-error --max-time 25 \
  -H "X-Agent-Key: $ATV_AGENT_KEY" \
  "http://localhost:8012/api/webhooks/fathom/pendientes"
```

Devuelve `reportes[]`, cada uno con `eventoId`, `prospecto`, `closer`, `hora` y
**`mensaje`: el texto ya armado**. Lista vacía = no hay nada nuevo.

### 2. Avisar qué mandaste (OBLIGATORIO después de mandar)

```bash
curl --fail --silent --show-error --max-time 25 -X POST \
  -H "X-Agent-Key: $ATV_AGENT_KEY" -H "Content-Type: application/json" \
  -d '{"eventoIds":["ID1","ID2"]}' \
  "http://localhost:8012/api/webhooks/fathom/enviados"
```

### 3. Todas las llamadas del día (para preguntas, no para el aviso)

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

## El aviso por llamada (el chequeo automático)

Este es el trabajo principal de la skill y corre solo, seguido.

1. Ejecutá el comando 1.
2. **Si `reportes` viene vacío, no mandes NADA y terminá ahí.** No avises que no hay
   novedades, no saludes, no expliques que chequeaste. El grupo se usa para trabajar:
   un mensaje cada diez minutos diciendo "sin novedades" hace que dejen de leerlo.
3. Si hay reportes, mandá el campo `mensaje` de cada uno **tal cual viene**. Ya está
   armado y con el formato correcto: no lo reescribas ni lo resumas. Si hay varios,
   van como mensajes separados.

   **El mensaje empieza en el nombre del prospecto y termina en el link.** Nada antes,
   nada después: ni "va el aviso al grupo", ni "marcado como enviado", ni un comentario
   tuyo sobre lo que hiciste. El grupo lee el reporte, no lo que hace el bot — un
   renglón de relleno arriba de cada llamada convierte el canal en ruido. Lo que hiciste
   con la cola es asunto tuyo y no se anuncia.
4. Ejecutá el comando 2 con TODOS los `eventoId` que mandaste. Si te lo saltás, los
   mismos reportes vuelven a salir en la próxima corrida.

Si el comando 2 falla, decilo en el grupo en una línea: los reportes van a repetirse
hasta que alguien lo arregle, y es mejor que se sepa.

## Preguntas sueltas (van con el comando 3)

Acá sí armás el texto vos. Títulos en *negrita*, sin triple backtick. Una llamada es un
bloque de 2 a 4 líneas — se lee en el celular parado:

*{hora} · {prospecto}* ({closer})
{estado} · {plan} · ${cashUsd}
↳ {proximoPaso}
⚠️ {objecion}

La línea del medio lleva solo lo que exista; sin plan ni cash queda el estado solo. `↳`
y `⚠️` únicamente si hay algo que poner. Si `grabada` es `false`, una sola línea:
*{hora} · {prospecto}* ({closer}) — _sin grabación_. Números con punto de miles.

- "¿cómo vinieron las llamadas?" / "¿qué pasó hoy?" → todas las del día, y al pie
  cuántas quedaron sin grabar y quiénes.
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
