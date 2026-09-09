import { useMemo, useState } from 'react';
import Sparkline from '../charts/Sparkline.jsx';
import MetaMesAlineacion from './MetaMesAlineacion.jsx';
import ReporteSetter from './ReporteSetter.jsx';
import Bar from '../ui/Bar.jsx';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatFecha, formatFechaHora, formatValue } from '../../lib/format.js';

const ORIGEN = { ads: 'Ads', organico: 'Orgánico', referido: 'Referido', outbound: 'Outbound' };

const ESTADO_APP = {
  nueva: { tone: 'info', label: 'nueva' },
  en_revision: { tone: 'warn', label: 'en revisión' },
  agendada: { tone: 'ok', label: 'agendada' },
  no_califica: { tone: 'off', label: 'no califica' },
  perdida: { tone: 'alert', label: 'perdida' },
};

const FILTRO_ESTADO = [
  { value: 'todos', label: 'Todos' },
  { value: 'nueva', label: 'Nuevas' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'agendada', label: 'Agendadas' },
  { value: 'no_califica', label: 'No califica' },
  { value: 'perdida', label: 'Perdidas' },
];

/**
 * Dashboard personal del Setter (4 bloques).
 * @param {{
 *   data: object,
 *   onCompletarReporte?: (payload: object) => void | Promise<void>,
 * }} props
 */
export default function SetterVista({ data, onCompletarReporte }) {
  const [filtro, setFiltro] = useState('todos');
  const [modalReporte, setModalReporte] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const apps = useMemo(() => {
    const list = data.aplicaciones ?? [];
    if (filtro === 'todos') return list;
    return list.filter((a) => a.estado === filtro);
  }, [data.aplicaciones, filtro]);

  const eq = data.equipo;
  const reporte = data.reporte;
  const dia = data.dia;
  const payload = reporte?.payload;

  const guardarReporte = async (form) => {
    if (!onCompletarReporte || guardando) return;
    setGuardando(true);
    try {
      await onCompletarReporte(form);
      setModalReporte(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="setter-vista">
      <section className="setter-dia">
        <div className="kpi-grid setter-dia-kpis">
          {dia.kpis.map((k) => (
            <article key={k.id} className="kpi closer-kpi">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value-row">
                <span className="kpi-value num">{formatValue(k.value, k.format)}</span>
                <Pill tone={k.estado} dot>
                  {k.estado === 'ok' ? 'en meta' : k.estado === 'warn' ? 'atención' : 'crítico'}
                </Pill>
              </div>
              <Bar pct={k.pct} tone={k.estado === 'ok' ? 'ok' : k.estado === 'warn' ? 'warn' : 'alert'} />
              <div className="kpi-objetivo">
                <span>Meta {formatValue(k.meta, k.format)}</span>
                <span>{formatValue(k.pct, 'pct')}</span>
              </div>
            </article>
          ))}

          <article className={`kpi closer-kpi setter-reporte-card${reporte.completado ? ' ok' : ' pendiente'}`}>
            <div className="kpi-label">Reporte del día</div>
            <div className="kpi-value-row">
              <span className="kpi-value">{reporte.completado ? 'Completado' : 'Pendiente'}</span>
              <Pill tone={reporte.completado ? 'ok' : 'alert'} dot>
                {reporte.completado ? 'ok' : 'falta'}
              </Pill>
            </div>
            <div className="kpi-nota">
              {reporte.actualizadoAt
                ? `Última actualización · ${formatFechaHora(reporte.actualizadoAt)}`
                : 'Todavía no cargaste el reporte de hoy'}
            </div>
            {payload && (
              <div className="kpi-nota setter-reporte-resumen">
                {payload.conversaciones} conv · {payload.agendas} agendas · {payload.calendlysEnviados} Calendlys
                {payload.diaBuenoMalo
                  ? ` · ${payload.diaBuenoMalo.slice(0, 48)}${payload.diaBuenoMalo.length > 48 ? '…' : ''}`
                  : ''}
              </div>
            )}
            <button
              type="button"
              className={`btn${reporte.completado ? '' : ' primary'} setter-reporte-btn`}
              onClick={() => setModalReporte(true)}
              disabled={guardando}
            >
              {reporte.completado ? 'Ver / editar reporte' : 'Completar reporte'}
            </button>
          </article>
        </div>
      </section>

      <div className="kpi-grid closer-kpis">
        {data.kpisMes.map((k) => (
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
              <span>{formatValue(Math.min(k.pct, 100), 'pct')}</span>
            </div>
            {k.serie?.length > 1 && (
              <div className="kpi-spark">
                <Sparkline data={k.serie} />
              </div>
            )}
          </article>
        ))}
      </div>

      {data.metaMes ? (
        <MetaMesAlineacion
          titulo="Meta del mes · proyección"
          proyeccion={data.metaMes.proyeccion}
          contexto={data.contexto}
          cuotaLabel={`Tu cuota (÷ ${data.metaMes.headcount} setters)`}
          cuotaItems={[
            { label: 'Calendlys / mes', value: data.metaMes.cuotaMes.aplicaciones },
            { label: 'Agendas / mes', value: data.metaMes.cuotaMes.agendadas },
            { label: 'Calendlys / día', value: data.metaMes.cuotaDia.aplicaciones },
            { label: 'Agendas / día', value: data.metaMes.cuotaDia.agendadas },
          ]}
          equipo={{
            label: 'Meta Calendlys equipo',
            meta: eq.metaAplicaciones,
            actual: eq.actualAplicaciones,
            gap: eq.gap,
            format: 'count',
          }}
          ritmoEsperado={data.metaMes.ritmoEsperado}
          estado={eq.estado}
          insight={eq.insight}
        />
      ) : null}

      <Card
        title="Mis Calendlys enviados recientes"
        sub={`${apps.length} visibles`}
        actions={
          <select
            className="select sm"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            aria-label="Filtrar por estado"
          >
            {FILTRO_ESTADO.map((o) => (
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
                <th>Fecha envío</th>
                <th>Origen</th>
                <th>Estado</th>
                <th>Llamada</th>
                <th>Closer</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => {
                const est = ESTADO_APP[a.estado] ?? { tone: 'plain', label: a.estado };
                return (
                  <tr key={a.id}>
                    <td className="strong">{a.prospecto}</td>
                    <td className="dim">{formatFecha(a.fechaAplicacionAt)}</td>
                    <td className="dim">{ORIGEN[a.origen] ?? a.origen}</td>
                    <td>
                      <Pill tone={est.tone} dot>
                        {est.label}
                      </Pill>
                    </td>
                    <td className="dim">
                      {a.fechaLlamadaAt ? formatFechaHora(a.fechaLlamadaAt) : '—'}
                    </td>
                    <td className="dim">{a.closer || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ReporteSetter
        abierto={modalReporte}
        perfil={data.perfil}
        fechaDefault={data.contexto?.hoyIso ?? ''}
        initial={reporte}
        onCerrar={() => setModalReporte(false)}
        onGuardar={guardarReporte}
      />
    </div>
  );
}
