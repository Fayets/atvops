import { formatValue } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import Direccional from './Direccional.jsx';

const ZONA = { ok: ['ok', 'cumple'], alert: ['alert', 'abajo'], off: ['off', 'sin meta'], vacio: ['off', 'sin muestra'] };

/** Cumple o no contra la meta. Sin meta o sin dato no hay juicio: queda neutro, nunca en rojo. */
function zona(real, meta, mejorEsMenor = false) {
  if (meta == null) return 'off';
  if (real == null) return 'vacio';
  return (mejorEsMenor ? real <= meta : real >= meta) ? 'ok' : 'alert';
}

const signo = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatValue(Math.abs(n), 'count')}`;

/**
 * Las metas de una campaña de seguidores (FM). Una campaña FM produce audiencia, no agendas:
 * se mide por cuánto cuesta traer gente al perfil, si la cuenta crece en neto y si los que
 * llegan califican. El rojo sale solo de acá, nunca por no traer agendas.
 */
export default function MetasAudiencia({ datos, decreto }) {
  const cal = datos.calificacion?.campania;
  const base = datos.calificacion?.base;
  const filas = [
    {
      id: 'costo',
      label: <>Costo por visita al perfil <Direccional /></>,
      real: datos.costoVisitaUsd,
      meta: decreto?.costoVisitaMetaUsd,
      fmt: (v) => formatValue(v, 'usd'),
      z: zona(datos.costoVisitaUsd, decreto?.costoVisitaMetaUsd, true),
      sub: null,
    },
    {
      id: 'neto',
      label: 'Neto de seguidores · 7 días',
      real: datos.netoSemana?.valor ?? null,
      meta: decreto?.netoSeguidoresSemanaMeta,
      fmt: signo,
      z: zona(datos.netoSemana?.valor ?? null, decreto?.netoSeguidoresSemanaMeta),
      sub: datos.netoSemana ? `${formatFecha(datos.netoSemana.desde)} al ${formatFecha(datos.netoSemana.hasta)}` : null,
    },
    {
      id: 'calificados',
      label: 'Calificados',
      real: cal?.pct ?? null,
      meta: decreto?.pctCalificadosMeta,
      fmt: (v) => formatValue(v, 'pct'),
      z: zona(cal?.pct ?? null, decreto?.pctCalificadosMeta),
      sub: [
        cal?.analizados ? `${cal.calificados} de ${cal.analizados} analizados` : 'nadie analizado todavía',
        base?.pct != null ? `orgánico antes: ${formatValue(base.pct, 'pct')} (${base.analizados})` : null,
      ].filter(Boolean).join(' · '),
    },
  ];

  return (
    <Card title="Metas de audiencia" sub="campaña de seguidores">
      <div className="meta-avance-grid">
        {filas.map((f) => (
          <div key={f.id} className={`meta-avance-fila zona-${f.z === 'alert' ? 'alert' : f.z === 'ok' ? 'ok' : 'neutra'}`}>
            <div className="meta-avance-top">
              <span className="meta-avance-label">{f.label}</span>
              <Pill tone={ZONA[f.z][0]} dot>{ZONA[f.z][1]}</Pill>
            </div>
            <div className="meta-avance-nums">
              <span className="num meta-avance-real">{f.real == null ? '—' : f.fmt(f.real)}</span>
              <span className="dim">{f.meta == null ? '/ sin meta' : `/ meta ${f.fmt(f.meta)}`}</span>
            </div>
            {f.sub && <div className="dim meta-avance-sub">{f.sub}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function formatFecha(iso) {
  const [, m, d] = String(iso).split('-');
  return `${Number(d)}/${Number(m)}`;
}

/** Las metas de agendas y cash cuando no corre ninguna campaña de respuesta directa: en pausa, no en rojo. */
export function MetasConversionEnPausa() {
  return (
    <Card title="Metas de conversión" actions={<Pill tone="off" dot>en pausa</Pill>}>
      <p className="dim" style={{ margin: 0 }}>Sin campaña DR activa, metas de conversión en pausa</p>
    </Card>
  );
}
