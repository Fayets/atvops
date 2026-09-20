import Bars from '../charts/Bars.jsx';
import LineArea from '../charts/LineArea.jsx';
import Card from '../ui/Card.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * La foto del mes, arriba de todo: los números grandes y cómo se llegó a ellos.
 *
 * Cada número viene con la línea que dice qué es. Sin eso, un tablero obliga a
 * preguntarle a alguien qué mide cada cosa, y entonces no lo mira nadie.
 *
 * Los gráficos van abajo porque responden otra pregunta: el número dice dónde estás, la
 * serie dice cómo llegaste ahí —si el cash salió de un solo cierre, si los no shows se
 * amontonan siempre los mismos días.
 */

const n = (v, f = 'count') => formatValue(v ?? 0, f);
const pct = (v) => (v == null ? '—' : `${v}%`);

/** Un número con su definición debajo. El tono solo cuando el valor se juzga. */
function Kpi({ label, valor, nota, tono }) {
  return (
    <article className="ops-kpi">
      <span className="ops-kpi-label">{label}</span>
      <span className={`ops-kpi-valor num${tono ? ` zona-${tono}` : ''}`}>{valor}</span>
      <span className="ops-kpi-nota">{nota}</span>
    </article>
  );
}

/**
 * @param {{ data: object }} props — lo que devuelve `getVentas`, que envuelve el resumen
 *   del mes en `real`.
 */
export default function PanelOps({ data }) {
  const r = data?.real ?? {};
  const a = r.actual ?? {};
  const series = r.series ?? [];
  const semanas = r.semanas ?? [];
  const facturado = (a.cashUsd ?? 0) + (a.deudaUsd ?? 0);

  // El show rate se juzga contra su rango sano; las agendas no se juzgan, se cuentan.
  const tonoShow = a.showRate == null ? null : a.showRate >= 80 ? 'ok' : a.showRate >= 65 ? 'warn' : 'alert';
  const tonoClose = a.closeRate == null ? null : a.closeRate >= 25 ? 'ok' : a.closeRate >= 15 ? 'warn' : 'alert';

  return (
    <>
      <div className="ops-kpis">
        <Kpi label="Cobrado" valor={n(a.cashUsd, 'usd')} tono={a.cashUsd > 0 ? 'ok' : null}
          nota={`de ${n(a.ventas)} ${a.ventas === 1 ? 'venta' : 'ventas'} · lo que entró de verdad`} />
        <Kpi label="Facturado" valor={n(facturado, 'usd')}
          nota="vendido en el mes, cobrado o no" />
        <Kpi label="Por cobrar" valor={n(a.deudaUsd, 'usd')} tono={a.deudaUsd > 0 ? 'warn' : null}
          nota={facturado ? `${Math.round(((a.deudaUsd ?? 0) / facturado) * 100)} % de lo vendido sigue sin entrar` : 'nada pendiente'} />
        <Kpi label="Agendas del mes" valor={n(a.agendados)}
          nota={`la primera de cada prospecto · ${n(a.seguimientos)} seguimientos aparte`} />
        <Kpi label="Show rate" valor={pct(a.showRate)} tono={tonoShow}
          nota={a.shows + a.noShows > 0
            ? `${n(a.shows)} vinieron de ${n(a.shows + a.noShows)} llamadas resueltas`
            : 'todavía no hay llamadas resueltas este mes'} />
        <Kpi label="Sin cargar" valor={n(a.sinReportar)} tono={a.sinReportar > 0 ? 'warn' : null}
          nota="llamadas que ya pasaron y nadie dijo qué fue" />
      </div>

      <div className="ops-graficos">
        <Card
          title="Cuánto entró, día por día"
          sub="Cobrado de cada día y el acumulado del mes"
          foot="La barra es lo que se cobró ese día; la línea, cómo se va juntando el mes. Un escalón solo quiere decir que el mes depende de un cierre."
        >
          <Bars
            data={series} x={(d) => d.label} y={(d) => d.cashUsd} format="usd" label="Cobrado"
            color={() => 'var(--s5)'} height={190}
            linea={{ key: (d) => d.cashAcumuladoUsd, label: 'Acumulado', format: 'usd', escala: 'propia' }}
          />
        </Card>

        <Card
          title="Llamadas por día"
          sub="Cuántas hubo y cuántas terminaron en show"
          foot="La distancia entre la barra y la línea son los que no vinieron más los que nadie cargó todavía. Mientras esa distancia exista, el show rate del mes no es real."
        >
          <Bars
            data={series} x={(d) => d.label} y={(d) => d.agendas} format="count" label="Llamadas"
            color={() => 'var(--s3)'} height={190}
            linea={{ key: (d) => d.shows, label: 'Vinieron', format: 'count', escala: 'compartida' }}
          />
        </Card>

        <Card
          title="Lo que convirtió cada semana"
          sub="Show rate y close rate, semana a semana"
          foot="Una semana sola no dice nada; la serie sí. Dos semanas seguidas cayendo en la misma tasa ya es una tendencia."
        >
          <LineArea
            data={semanas} x={(d) => d.label} height={190} format="percent"
            series={[
              { key: (d) => d.showRate ?? 0, label: 'Show', color: 'var(--s2)' },
              { key: (d) => d.closeRate ?? 0, label: 'Close', color: 'var(--s1)' },
            ]}
          />
        </Card>

        <Card
          title="Agendas por semana"
          sub="Cuántas entraron y cuántas se cerraron"
          foot="La línea son los cierres. Si sube el volumen y la línea queda plana, el problema está en la llamada, no en la agenda."
          flush={false}
        >
          <Bars
            data={semanas} x={(d) => d.label} y={(d) => d.agendados} format="count" label="Agendas"
            color={() => 'var(--s4)'} height={190}
            linea={{ key: (d) => d.cierres, label: 'Cierres', format: 'count', escala: 'propia' }}
          />
        </Card>
      </div>

      <div className="ops-tasas-pie">
        <span>Close rate del mes <b className={`num zona-${tonoClose ?? ''}`}>{pct(a.closeRate)}</b> · {n(a.cierres)} de {n(a.shows)} shows</span>
        <span>Ticket promedio <b className="num">{n(a.averageSaleUsd, 'usd')}</b> · facturado sobre cierres</span>
      </div>
    </>
  );
}
