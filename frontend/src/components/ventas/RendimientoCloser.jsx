import { useMemo } from 'react';
import Bars from '../charts/Bars.jsx';
import Card from '../ui/Card.jsx';
import { formatValue, inicioSemanaIso } from '../../lib/format.js';

/**
 * Cómo viene el mes del closer, en gráficos.
 *
 * Va donde estaba el calendario. El calendario mostraba las mismas llamadas que la lista
 * pero repartidas en una grilla, y para cargar un resultado había que ir a buscar el día:
 * acá se lee el mes de un vistazo y los resultados se cargan en la lista.
 */

// Cómo terminó cada llamada, agrupado. El color es el juicio sobre la llamada, no una
// serie: verde vendió, ámbar sigue viva, rojo se cayó, gris todavía no se cargó.
const GRUPOS = [
  { id: 'cierre', label: 'ventas', color: 'var(--ok)', estados: ['cierre'] },
  { id: 'viva', label: 'con show', color: 'var(--warn)', estados: ['show'] },
  { id: 'caida', label: 'se cayeron', color: 'var(--alert)', estados: ['no_show', 'cancelada', 'reprogramada'] },
  { id: 'falta', label: 'sin cargar', color: 'var(--text-3)', estados: ['sin_reportar'] },
  // Reunión que está en el calendario y el CRM no tiene: se dice aparte porque el KPI
  // "Sin cargar" tampoco la cuenta, y verla sumada ahí hacía que los dos números se
  // contradijeran en la misma pantalla.
  { id: 'sincrm', label: 'solo en el calendario', color: 'var(--text-3)', estados: ['sin_crm'] },
  { id: 'porvenir', label: 'por venir', color: 'var(--info)', estados: ['agendado'] },
];

const ETAPAS = [
  { id: 'agendas', label: 'Agendas', color: 'var(--set-agendas)' },
  { id: 'shows', label: 'Shows', color: 'var(--set-shows)' },
  { id: 'cierres', label: 'Cierres', color: 'var(--set-closes)' },
];

const dm = (d) => `${d.getDate()}/${d.getMonth() + 1}`;

/** Las llamadas del mes repartidas por semana, con el cash que entró en cada una. */
function porSemana(llamadas) {
  const mapa = new Map();
  llamadas.forEach((l) => {
    if (!l.fechaAt) return;
    const lunes = inicioSemanaIso(new Date(l.fechaAt));
    const clave = lunes.toISOString().slice(0, 10);
    if (!mapa.has(clave)) mapa.set(clave, { clave, desde: lunes, label: dm(lunes), n: 0, cash: 0, cierres: 0 });
    const s = mapa.get(clave);
    s.n += 1;
    // El cash de la semana es el de las llamadas que cerraron en ella. Las señas de
    // otros meses no entran: su plata es del mes, no de esta semana.
    if (l.estado === 'cierre') { s.cash += l.cashUsd ?? 0; s.cierres += 1; }
  });
  return [...mapa.values()].sort((a, b) => a.desde - b.desde);
}

export default function RendimientoCloser({ llamadas = [], mes = {} }) {
  const semanas = useMemo(() => porSemana(llamadas), [llamadas]);

  const reparto = useMemo(() => GRUPOS.map((g) => ({
    ...g, n: llamadas.filter((l) => g.estados.includes(l.estado)).length,
  })).filter((g) => g.n > 0), [llamadas]);

  const hayCash = semanas.some((s) => s.cash > 0);
  const agendas = mes.agendadas ?? llamadas.length;
  const shows = mes.shows ?? llamadas.filter((l) => ['show', 'cierre', 'cancelada'].includes(l.estado)).length;
  const cierres = mes.cierres ?? llamadas.filter((l) => l.estado === 'cierre').length;
  const etapas = { agendas, shows, cierres };
  const tope = Math.max(agendas, 1);
  const sinCargar = mes.sinReportar ?? llamadas.filter((l) => l.estado === 'sin_reportar').length;

  return (
    <Card
      title="Cómo venís este mes"
      sub={`${agendas} reuniones${sinCargar ? ` · ${sinCargar} sin cargar` : ''}`}
      className="rend-closer"
    >
      <div className="rend-grid">
        <section className="rend-bloque">
          <h4 className="bloque-titulo">Llamadas por semana</h4>
          <Bars data={semanas} x={(s) => s.label} y={(s) => s.n} format="count" height={190} label="Llamadas" />
          {reparto.length > 0 && (
            <ul className="rend-reparto">
              {reparto.map((g) => (
                <li key={g.id}>
                  <i style={{ background: g.color }} />
                  <b className="num">{g.n}</b> {g.label}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rend-bloque">
          <h4 className="bloque-titulo">Cash cobrado por semana</h4>
          {/* Un mes sin cash dibujaba un eje en fracciones de dólar: mejor decirlo. */}
          {hayCash ? (
            <Bars
              data={semanas} x={(s) => s.label} y={(s) => s.cash} format="usd" height={190} label="Cash"
              color={() => 'var(--ok)'}
            />
          ) : (
            <div className="chart-wrap empty" style={{ height: 190 }}>Todavía no entró cash este mes.</div>
          )}
          <ul className="rend-reparto">
            <li><i style={{ background: 'var(--ok)' }} /><b className="num">{formatValue(mes.cashUsd ?? 0, 'usd')}</b> en el mes</li>
            {mes.facturacionUsd > 0 && (
              <li><i style={{ background: 'var(--set-closes)' }} /><b className="num">{formatValue(mes.facturacionUsd, 'usd')}</b> facturado</li>
            )}
            {mes.saldoUsd > 0 && (
              <li><i style={{ background: 'var(--text-3)' }} /><b className="num">{formatValue(mes.saldoUsd, 'usd')}</b> por cobrar</li>
            )}
          </ul>
        </section>
      </div>

      <div className="embudo-barras">
        <h4 className="bloque-titulo">Del agendado al cierre</h4>
        {ETAPAS.map((e, i) => {
          const n = etapas[e.id];
          const antes = i ? etapas[ETAPAS[i - 1].id] : 0;
          return (
            <div key={e.id} className="barra-fila">
              <span className="barra-label">{e.label}</span>
              <span className="barra-pista">
                <span className="barra-relleno" style={{ width: `${(n / tope) * 100}%`, background: e.color }} />
              </span>
              <span className="barra-valor num">{n}</span>
              <span className="barra-paso dim num">{i && antes ? `${Math.round((n / antes) * 100)}%` : ''}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
