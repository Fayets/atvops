import { useMemo, useState } from 'react';
import Bars from '../charts/Bars.jsx';
import Sparkline from '../charts/Sparkline.jsx';
import CloserCalendario from './CloserCalendario.jsx';
import MetaMesAlineacion from './MetaMesAlineacion.jsx';
import Bar from '../ui/Bar.jsx';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { ESTADO_LLAMADA } from '../../lib/dispositions.js';
import { formatFecha, formatValue } from '../../lib/format.js';

const DISP_FILTRO = [
  { value: 'todos', label: 'Todos' },
  { value: 'cerrado', label: 'Cerrados' },
  { value: 'show_calificado', label: 'Show calificado' },
  { value: 'show_descalificado', label: 'Show descalificado' },
  { value: 'no_show', label: 'No show' },
  { value: 'reagendado', label: 'Reagendados' },
  { value: 'cancelado', label: 'Cancelados' },
];

function urgencia(dias) {
  if (dias < 3) return 'ok';
  if (dias <= 7) return 'warn';
  return 'alert';
}

/**
 * Dashboard personal del Closer (5 bloques).
 */
export default function CloserVista({
  data,
  flashId,
  onContactado,
  onGuardarDisposition,
  onSimularDisposition,
}) {
  const [filtroDisp, setFiltroDisp] = useState('todos');
  const [followIds, setFollowIds] = useState(() => new Set());

  const dispositions = useMemo(() => {
    const list = data.dispositions ?? [];
    if (filtroDisp === 'todos') return list;
    return list.filter((d) => d.disposition === filtroDisp);
  }, [data.dispositions, filtroDisp]);

  const followUps = (data.followUps ?? []).filter((f) => !followIds.has(f.id));

  const marcarContactado = (id) => {
    setFollowIds((prev) => new Set(prev).add(id));
    onContactado?.(id);
  };

  const eq = data.equipo;
  const hoyIso = data.contexto?.hoyIso ?? data.hoy?.iso ?? '2026-09-09';

  return (
    <div className="closer-vista">
      <Card
        title="Mi calendario"
        sub="Disposition al click · se actualiza en vivo"
        flush
      >
        <CloserCalendario
          llamadas={data.agenda ?? data.hoy?.llamadas ?? []}
          hoyIso={hoyIso}
          flashId={flashId}
          onGuardarDisposition={onGuardarDisposition}
          onSimular={onSimularDisposition}
        />
      </Card>

      <div className="kpi-grid closer-kpis">
        {data.kpis.map((k) => (
          <article key={k.id} className="kpi closer-kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value-row">
              <span className="kpi-value num">{formatValue(k.value, k.format)}</span>
              <Pill tone={k.estado} dot>
                {k.estado === 'ok' ? 'en meta' : k.estado === 'warn' ? 'atención' : 'crítico'}
              </Pill>
            </div>
            {k.extra && <div className="kpi-nota">{k.extra}</div>}
            <div className="kpi-nota closer-var">
              Varianza{' '}
              <span className={k.varianza >= 0 ? 'good' : 'bad'}>
                {k.varianza >= 0 ? '+' : ''}
                {formatValue(k.varianza, k.format)}
              </span>{' '}
              vs meta
            </div>
            <Bar pct={k.pct} tone={k.estado === 'ok' ? 'ok' : k.estado === 'warn' ? 'warn' : 'alert'} />
            <div className="kpi-objetivo">
              <span>Meta {formatValue(k.meta, k.format)}</span>
              <span>{formatValue(k.pct, 'pct')}</span>
            </div>
            {k.serie?.length > 1 && (
              <div className="kpi-spark">
                <Sparkline data={k.serie} />
              </div>
            )}
          </article>
        ))}
      </div>

      {data.metaMes && (
        <MetaMesAlineacion
          titulo="Meta del mes · proyección"
          proyeccion={data.metaMes.proyeccion}
          contexto={data.contexto}
          cuotaLabel={`Tu cuota (÷ ${data.metaMes.headcount} closers)`}
          cuotaItems={[
            { label: 'Llamadas', value: data.metaMes.cuota.llamadas },
            { label: 'Shows', value: data.metaMes.cuota.shows },
            { label: 'Cierres', value: data.metaMes.cuota.cierres },
            { label: 'Cash', value: data.metaMes.cuota.cashUsd, format: 'usd' },
          ]}
          equipo={{
            label: 'Meta cash equipo',
            meta: eq.metaUsd,
            actual: eq.actualUsd,
            gap: eq.gapUsd,
            format: 'usd',
          }}
          ritmoEsperado={data.metaMes.ritmoEsperado}
          estado={eq.estado}
          insight={eq.insight}
        />
      )}

      {eq.porSemana?.length > 0 && (
        <Card title="Cash del equipo por semana" sub="Agregado · sin breakdown por closer">
          <Bars
            data={eq.porSemana}
            x={(s) => s.label}
            y={(s) => s.usd}
            format="usd"
            label="Cash equipo"
            height={160}
          />
        </Card>
      )}

      <Card
        title="Mis follow-ups"
        sub={`${followUps.length} pendientes · urgencia por días sin contacto`}
        flush
      >
        {followUps.length === 0 ? (
          <div className="empty">Sin follow-ups pendientes.</div>
        ) : (
          followUps.map((f) => (
            <div key={f.id} className="lista-item closer-follow">
              <Pill tone={urgencia(f.diasSinContacto)} dot>
                {f.diasSinContacto}d
              </Pill>
              <span className="who">{f.prospecto}</span>
              <span className="q">
                {f.disposition} · {f.proximoPaso} · último {formatFecha(f.ultimoContactoAt)}
              </span>
              <span className="right">
                <button type="button" className="btn sm" onClick={() => marcarContactado(f.id)}>
                  Contactado
                </button>
              </span>
            </div>
          ))
        )}
      </Card>

      <Card
        title="Mis dispositions recientes"
        sub="Últimas llamadas tomadas"
        actions={
          <select
            className="select sm"
            value={filtroDisp}
            onChange={(e) => setFiltroDisp(e.target.value)}
            aria-label="Filtrar disposition"
          >
            {DISP_FILTRO.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
        flush
      >
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Prospecto</th>
                <th>Fecha</th>
                <th>Disposition</th>
                <th>Offer</th>
                <th className="right">Cash</th>
                <th>Notas</th>
                <th>Objection</th>
              </tr>
            </thead>
            <tbody>
              {dispositions.map((d) => {
                const est = ESTADO_LLAMADA[d.disposition] ?? { tone: 'plain', label: d.disposition };
                return (
                  <tr key={d.id}>
                    <td className="strong">{d.prospecto}</td>
                    <td className="dim">{formatFecha(d.fechaAt)}</td>
                    <td>
                      <Pill tone={est.tone} dot>
                        {est.label}
                      </Pill>
                    </td>
                    <td className="dim">{d.offerTier}</td>
                    <td className="right num">
                      {d.cashUsd != null ? formatValue(d.cashUsd, 'usd') : '—'}
                    </td>
                    <td className="dim">{d.notas || '—'}</td>
                    <td className="dim">{d.objection || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
