import { useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { getProximosAVencer } from '../data/api.js';
import { formatValue } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';

/**
 * Los clientes cuyo acceso vence pronto, para salir a renovarlos.
 *
 * El vencimiento manda sobre todo lo demás: el día que vence, el cliente pierde el
 * Classroom. Por eso la lista se ordena por urgencia y no por nombre ni por plan, y por
 * eso sale en papel: la conversación de renovación se prepara con la hoja al lado.
 */

const VENTANAS = [
  { dias: 30, label: '30 días' },
  { dias: 60, label: '60 días' },
  { dias: 90, label: '90 días' },
  { dias: 180, label: '6 meses' },
];

const usd = (n) => formatValue(n || 0, 'usd');
const fecha = (iso) => (iso
  ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  : '—');

/** Un cliente que no está vigente es el que hay que mirar antes de que venza. */
const flojo = (estado) => ['inactivo', 'pausa', 'baja'].includes((estado || '').toLowerCase());

export default function ProximosAVencer() {
  const [dias, setDias] = useState(90);
  const { data, error, loading } = useResource(() => getProximosAVencer(dias), [dias]);

  if (loading && !data) return <div className="page"><SkeletonBlock /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  const r = data?.resumen ?? {};
  const grupos = data?.grupos ?? [];

  return (
    <div className="page rp-page">
      <PageHeader
        eyebrow="Cobranza"
        title="Próximos a vencer"
        actions={
          <div className="pv-acciones">
            <div className="tabs sm">
              {VENTANAS.map((v) => (
                <button key={v.dias} type="button"
                  className={`tab${dias === v.dias ? ' active' : ''}`}
                  onClick={() => setDias(v.dias)}>{v.label}</button>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => window.print()}>
              Descargar PDF
            </button>
          </div>
        }
      />

      <div className="rp-doc pv-doc">
        <header className="doc-head">
          <img src="/atv-logo.png" alt="ATV" width={38} height={38} />
          <div>
            <div className="eyebrow">ATV · Cobranza</div>
            <h1>Próximos a vencer</h1>
          </div>
          <div className="doc-per">
            {new Date(`${data?.hoy}T12:00:00`).toLocaleDateString('es-AR',
              { day: 'numeric', month: 'long', year: 'numeric' })}
            <span>próximos {dias} días</span>
          </div>
        </header>

        <div className="doc-resumen">
          <div><div className="l">Vencen</div><div className="v">{r.total ?? 0}</div></div>
          <div><div className="l">Con deuda</div>
            <div className={`v${r.conDeuda ? ' mal' : ''}`}>{r.conDeuda ?? 0}</div></div>
          <div><div className="l">Deuda</div>
            <div className={`v${r.deudaUsd ? ' mal' : ''}`}>{usd(r.deudaUsd)}</div></div>
          <div><div className="l">No vigentes</div>
            <div className={`v${r.inactivos ? ' mal' : ''}`}>{r.inactivos ?? 0}</div></div>
        </div>

        {grupos.length === 0 ? (
          <p className="dim">Ningún cliente vence en los próximos {dias} días.</p>
        ) : grupos.map((g) => (
          <section key={g.clave} className="doc-bloque pv-bloque">
            <h2>{g.titulo}
              <span>
                {g.clientes.length} {g.clientes.length === 1 ? 'cliente' : 'clientes'}
                {g.deudaUsd ? ` · ${usd(g.deudaUsd)} de deuda` : ''}
              </span>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Vence</th><th className="c">En</th><th>Cliente</th><th>Plan</th>
                  <th>Estado</th><th>Responsable</th><th className="der">Debe</th>
                </tr>
              </thead>
              <tbody>
                {g.clientes.map((c) => (
                  <tr key={`${c.nombre}-${c.venceAt}`}>
                    <td className="num">{fecha(c.venceAt)}</td>
                    <td className="c num">{c.dias}d</td>
                    <td className="nom">{c.nombre}</td>
                    <td>{c.plan || '—'}</td>
                    <td className={flojo(c.estado) ? 'mal' : ''}>{c.estado || '—'}</td>
                    <td>{c.responsable || '—'}</td>
                    <td className={`der num${c.adeudadoUsd ? ' mal' : ''}`}>
                      {c.adeudadoUsd ? usd(c.adeudadoUsd) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <p className="pv-pie dim">
          Sale de ATV Clients. El día del vencimiento el cliente pierde el acceso al
          Classroom, así que la fecha es el plazo real para tener la conversación.
        </p>
      </div>
    </div>
  );
}
