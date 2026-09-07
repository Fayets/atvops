import { useState } from 'react';
import { Link } from 'react-router-dom';
import Bars from '../components/charts/Bars.jsx';
import HBars from '../components/charts/HBars.jsx';
import AvanceVsMeta from '../components/metas/AvanceVsMeta.jsx';
import DiagnosticoMes from '../components/metas/DiagnosticoMes.jsx';
import MetaMesModal from '../components/metas/MetaMesModal.jsx';
import Card from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getMetasMes, getVentas } from '../data/api.js';
import { formatFechaHora, formatRangoSemana, formatValue } from '../lib/format.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

const ESTADO = {
  agendado: { tone: 'plain', label: 'agendado' },
  show: { tone: 'ok', label: 'show' },
  no_show: { tone: 'warn', label: 'no show' },
  cerrado: { tone: 'alert', label: 'cerrado' },
  perdido: { tone: 'off', label: 'perdido' },
};
const BANDERA = { AR: '🇦🇷', CL: '🇨🇱', ES: '🇪🇸' };

/** @type {import('../components/ui/DataTable.jsx').Columna[]} */
const COLUMNAS = [
  {
    key: 'prospecto',
    label: 'Prospecto',
    render: (l) => (
      <span className="strong">
        <span style={{ marginRight: 8, opacity: 0.8 }}>{BANDERA[l.pais]}</span>
        {l.prospecto}
      </span>
    ),
  },
  { key: 'fechaAt', label: 'Fecha', render: (l) => <span className="dim">{formatFechaHora(l.fechaAt)}</span> },
  { key: 'origen', label: 'Origen', render: (l) => <span className="dim">{l.origen}</span> },
  { key: 'oferta', label: 'Oferta', render: (l) => <span className="dim">{l.oferta}</span> },
  { key: 'closer', label: 'Closer', render: (l) => <span className="dim">{l.closer}</span> },
  {
    key: 'estado',
    label: 'Estado',
    render: (l) => (
      <Pill tone={ESTADO[l.estado].tone} dot>
        {ESTADO[l.estado].label}
      </Pill>
    ),
  },
  {
    key: 'montoUsd',
    label: 'Cash',
    align: 'right',
    render: (l) => <span className="num">{l.montoUsd ? formatValue(l.montoUsd, 'usd') : '—'}</span>,
  },
];

export default function Ventas() {
  const { mes } = useMes();
  const { data, loading, error } = useResource(getVentas);
  const [tickMeta, setTickMeta] = useState(0);
  const [modalMeta, setModalMeta] = useState(false);
  const metas = useResource(() => getMetasMes(mes), [mes, tickMeta]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const ultima = data?.semanas[data.semanas.length - 1];
  const metasData = metas.data;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Área · Lucas"
        title="Ventas"
        desc="Del llamado agendado al cash. Diagnóstico y avance del decreto; paid media vive en Ads."
        actions={
          <>
            <Link to="/metas" className="btn">
              Definir meta del mes
            </Link>
            <SourceTag sourceId="calendly" />
          </>
        }
      />

      {loading || !data ? (
        <>
          <SkeletonKpis />
          <SkeletonBlock height={300} />
        </>
      ) : (
        <>
          {metasData && (
            <>
              <DiagnosticoMes
                alertas={metasData.diagnostico}
                sub={`${metasData.contexto.nombreMes} · día ${metasData.contexto.diaHoy} de ${metasData.contexto.diasMes} · mock`}
              />
              <AvanceVsMeta
                filas={metasData.avance.filter((f) => !['agendas_ads', 'inversion', 'cash_ads'].includes(f.id))}
                titulo="Avance vs meta · Ventas"
                sub="Embudo y cash · paid en /ads"
                syncAt={metasData.real.syncAt}
              />
            </>
          )}

          <div className="kpi-grid">
            {data.kpis.map((m) => (
              <KpiCard key={m.id} metric={m} />
            ))}
          </div>

          <div className="split">
            <Card
              title="Cash collected por semana"
              sub="Barras: cash cobrado · línea: close rate"
              actions={<SourceTag sourceId="manual" conNombre={false} />}
            >
              <Bars
                data={data.semanas}
                x={(s) => s.semana}
                y={(s) => s.cashUsd}
                format="usd"
                label="Cash"
                height={252}
                linea={{ key: (s) => (s.cierres / (s.shows || 1)) * 100, label: 'Close rate' }}
              />
            </Card>

            <Card
              title={`Embudo · ${ultima.semana}`}
              sub={formatRangoSemana()}
              foot={`Del agendado al cierre se pierde el ${Math.round((1 - ultima.cierres / ultima.agendados) * 100)}% de las oportunidades.`}
            >
              <HBars
                format="count"
                participacion={false}
                data={[
                  { label: 'Agendados', value: ultima.agendados, sub: 'Calendly, automático' },
                  {
                    label: 'Con show',
                    value: ultima.shows,
                    sub: `${Math.round((ultima.shows / ultima.agendados) * 100)}% de show up`,
                  },
                  {
                    label: 'Cerrados',
                    value: ultima.cierres,
                    sub: `${Math.round((ultima.cierres / ultima.shows) * 100)}% de close rate · ${formatValue(ultima.cashUsd, 'usd')}`,
                  },
                ]}
              />
            </Card>
          </div>

          <Card
            title="Llamados recientes"
            sub="Últimas dos semanas"
            flush
            foot="El origen del lead se marca a mano después de la llamada. Cuando el CRM cruce el email con el lead de ads, esta columna deja de depender de nadie."
          >
            <DataTable columns={COLUMNAS} rows={data.llamados} initialSort={{ key: 'fechaAt', dir: 'desc' }} />
          </Card>
        </>
      )}

      {metasData && (
        <MetaMesModal
          abierto={modalMeta}
          onCerrar={() => setModalMeta(false)}
          decreto={metasData.decreto}
          mes={metasData.contexto.mes}
          nombreMes={metasData.contexto.nombreMes}
          onGuardado={() => setTickMeta((n) => n + 1)}
        />
      )}
    </div>
  );
}
