# ATV Ops — dashboard: arquitectura de datos

Este documento explica cómo está armado el tablero y, sobre todo, **cómo se
reemplaza un dato mock por un dato real sin tocar la interfaz**.

## 1. Para qué existe

El dashboard no genera revenue: hace que lo que genera revenue no dependa de que
alguien esté disponible para responder preguntas. Dos consecuencias de diseño:

1. **Cualquiera del equipo tiene que poder responder "¿cuántos clientes activos
   tenemos?" en cinco segundos**, sin abrir cinco herramientas ni preguntar.
2. **Un número que se carga a mano tiene que verse distinto de uno que llega
   solo.** Si eso no se ve, el tablero miente por omisión.

De ahí salen dos elementos que no son decorativos:

- La **etiqueta de procedencia** (`SourceTag`) debajo de cada métrica: de qué
  fuente sale, en qué estado está esa fuente y hace cuánto se actualizó.
- El **panel de grietas** en la home: discrepancias entre lo que muestra el
  tablero y lo que dice la fuente real (el tablero dice 12 clientes, el CRM dice 14).

## 2. Las cuatro áreas

```text
Home          North star: los cuatro números que definen si el sistema funciona.
Fulfillment   Que el cliente gane. Es el área más grande y tiene siete pantallas.
Marketing     Tablero de Juan Cruz.
Ventas        Tablero de Lucas.
Sistemas      QA de datos, integraciones y onboarding de staff.
```

El onboarding de cliente vive en Fulfillment (es el camino a la activación); el
de staff vive en Sistemas, porque mide capacidad operativa: cuánto tarda ATV en
poder sostener un cliente más.

## 3. Fulfillment: seis pilares sobre los transcripts

La ventaja de ATV es que **cada cliente tiene un canal de Discord con su coach y
un bot que trae los transcripts**. Eso es un registro automático de toda la
relación, y es lo que permite que el tablero no dependa de que alguien complete
un formulario — que es exactamente el error que hace que estos tableros mueran a
las dos semanas.

| Pilar | Pantalla | Qué mide |
| --- | --- | --- |
| 1 · Activación | `/fulfillment/activacion` | Primer resultado tangible antes del día 30, mediana de días, quiénes no y por qué |
| 2 · Engagement | `/fulfillment/engagement` | Mensajes por semana, respuesta del coach, mix de conversación, silencios |
| 3 · Retención | `/fulfillment/retencion` | NRR con puente de revenue, churn, MRR en riesgo |
| 4 · Coaches | `/fulfillment/coaches` | Delta entre el mejor y el peor coach, y de qué está hecho |
| 5 · Outcomes | `/fulfillment/outcomes` | Si el cliente está creciendo: facturación y audiencia |
| 6 · Expansión | `/fulfillment/outcomes` | Upsells, movimientos de tier, revenue de expansión |

### El score de salud

`src/lib/scoring.js` calcula un score de 0 a 100 por cliente, solo con señales
del canal. Los pesos:

| Factor | Puntos | De dónde sale |
| --- | --- | --- |
| Activación | 30 | ¿Hubo primer resultado antes del día 30? |
| Ritmo del cliente | 25 | Mensajes por semana, tendencia y días de silencio |
| Respuesta del coach | 15 | Mediana de tiempo de respuesta |
| Mix de conversación | 20 | Implementación y celebración suman; queja resta |
| Outcome | 10 | Cuánto factura hoy respecto de su entrada |

Verde desde 75, atención desde 50, rojo abajo. Dos **reglas duras** se imponen al
puntaje: siete días de silencio, y no haber activado pasada la ventana de 30 días.

El desglose se muestra completo en la ficha de cada cliente a propósito: si el
equipo no puede auditar el score, no lo va a usar para decidir.

## 4. Las capas

```text
pages/*.jsx           Componen secciones. No conocen los mocks.
   ↓ useResource()
data/api.js           FRONTERA. Hoy lee mocks y deriva métricas. Mañana hace fetch.
   ↓
data/mock/*.js        Datos de ejemplo, uno por dominio.
data/sources.js       Registro de fuentes + inventario de campos.
data/types.js         Contrato JSDoc: la forma de todo.
lib/scoring.js        Motor del score de salud. Puro, testeable, sin React.
```

Regla: **ningún componente importa un mock**. Todo entra por `data/api.js`.

## 5. Cómo se conecta una fuente real

Ejemplo: se conectan los webhooks del payment processor.

1. En `backend/`, agregar el dominio siguiendo `convenciones-backend-pony.md`:
   `src/services/pagos_services.py` + `src/controllers/pagos_controller.py`.
2. En `frontend/src/data/api.js`, cambiar **solo el cuerpo** de la función:

   ```js
   export async function getVentas() {
     const r = await fetch('/api/ventas');
     if (!r.ok) throw new Error('No se pudo leer ventas');
     return r.json(); // mismo shape que devolvía el mock
   }
   ```

3. En `frontend/src/data/sources.js`, poner `status: 'conectada'` en `payments` y
   apuntar los campos correspondientes a esa fuente.
4. Listo. El KPI de "% de datos automatizados" **sube solo**: se calcula sobre
   `DATA_FIELDS`, no está escrito a mano en ningún lado.

## 6. Los KPIs del sistema

| KPI | Dónde vive | Cómo se calcula hoy |
| --- | --- | --- |
| Onboarding de cliente (pago → primer entregable) | Fulfillment · Activación | Promedio de `ProcesoOnboarding` cerrados de tipo `cliente` |
| Onboarding de staff (contrato → primer día productivo) | Sistemas | Ídem, tipo `staff` |
| % de datos automatizados | Home, Sistemas | `coberturaAutomatizacion()` sobre `DATA_FIELDS` |
| Pedidos de datos por semana | Home | Contador manual, persistido en `localStorage` |

El contador de pedidos es el único dato que se carga a mano **a propósito**: es
la medición de cuánto falta para que el tablero reemplace a una persona como
fuente de verdad. Objetivo: cero.

## 7. Decisiones visuales

- Paleta de marca: **rojo sobre negro**. El rojo se reserva para marca, serie
  principal de los gráficos, navegación activa y alertas; nunca para decorar.
- Tipografía: **Poppins** en todo. El contraste se hace con peso y tamaño.
- Verde = está bien, ámbar = requiere atención, gris = sin conectar. Un dato
  manual se ve ámbar en toda la aplicación.
- Los gráficos son SVG propios (`components/charts/`), sin librería externa:
  área, barras, barras horizontales, sparkline, anillo, puente de revenue, mapa
  de calor y barra apilada.

## 8. La primera fuente real: transcripts de Discord

`/fulfillment/transcripts` **no es mock**. Lee los `.txt` que ya escribe el bot
de Discord de ATV Clients, sin abrir una segunda conexión a Discord y sin tocar
ese repo.

```text
bot de ATV Clients  →  <base>/<categoria>/<canal>/<canal>.txt
                              ↓  (solo lectura)
atv-ops/backend  src/services/transcripts_services.py
                 GET /api/transcripts                       → todos los canales
                 GET /api/transcripts/{categoria}/{canal}    → un canal completo
                              ↓
frontend  data/api.js → getTranscripts() / getTranscriptCanal()
```

El directorio se resuelve en `src/transcripts_source.py`: `TRANSCRIPTS_BASE_PATH`
si está seteada, si no `/opt/atv-clients/transcripts`, si no la copia local del
repo de atv-clients. El servicio cachea por `mtime` + tamaño, así que se
refresca solo cuando el bot escribe.

Dos cosas que el parser hace explícitas porque el origen no las da:

- Los timestamps del `.txt` son **UTC sin tzinfo**; se interpretan como UTC y se
  exponen en hora de Argentina.
- **No hay distinción staff / cliente.** El bot guarda `display_name`, no el rol
  ni el id de usuario. Los colores por autor identifican personas dentro de un
  canal, no roles.

## 9. Estado del resto

Las demás secciones corren con datos mock coherentes entre sí (los totales
cierran: 12 clientes activos suman los 168.400 de MRR; el gasto por campaña suma
el gasto por canal; el puente de revenue de agosto cierra en el MRR del mes).
Cobertura de automatización de arranque: **38%** (12 de 32 campos).

Las dos palancas más grandes, en orden:

1. **El clasificador de transcripts** — 6 campos esperando (activación, mix de
   conversación, blockers, outcomes). Los conteos ya salen solos; falta el paso
   que convierte el texto en categorías.
2. **El payment processor** — 7 campos. Sin él, el MRR y el cash collected son
   estimaciones cargadas a mano.

## 10. La home es un cuadro de mando que prescribe

`/` ya no es un resumen: es el tablero de la semana. Seis bloques (Fulfillment,
Marketing, Ventas, Sistemas, Cobranza, Ideas) y, arriba de todos, la lista de
**qué hacer esta semana**.

```text
data/mock/metas.js      metas del mes por área + palancas (secuencias, embudo)
lib/pacing.js           ritmo(): esperado a hoy, gap, necesario/semana, proyección, estado
lib/acciones.js         convierte cada ritmo en una orden con la cuenta adentro
data/api.js getHome()   compone todo; los transcripts reales entran si el backend responde
```

Reglas del módulo:

- **Ninguna acción sin "porqué".** Si el sistema no puede mostrar la cuenta que
  justifica la orden, no la da. Ejemplo real del mock: "Lanzar 2 secuencias:
  Testimonio Nacho (500) + Caso España (400)" sale de 840/2.000 a día 14 →
  faltan 1.160 en 16 días → 508 por semana → una sola secuencia no alcanza.
- El estado de una meta es actual ÷ esperado-a-hoy: ≥1,05 adelantado, ≥0,95 en
  ritmo, ≥0,75 atrasado, menos crítico (`CORTES_RITMO`).
- El reloj mock está en el **lunes 14 de septiembre de 2026** (`AHORA`), a mitad
  de mes, para que el ritmo tenga algo que decir. Los transcripts usan el reloj
  real. Al conectar fuentes reales, `AHORA` pasa a `new Date()`.
- Ideas es carga manual a propósito y vive en localStorage hasta que haya
  backend. Cobranza espera a la conexión con ATV Clients (`atv_clients`).

Referencias de diseño: health de proyectos de Linear (on track / at risk /
off track), widgets de pacing de Geckoboard y Databox (meta, esperado a hoy,
ritmo necesario), burn-up charts, y el lenguaje prescriptivo de Basecamp.
