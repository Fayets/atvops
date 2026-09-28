import { useEffect, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getAgendasWebinar } from '../data/api.js';
import { formatFecha } from '../lib/format.js';

/**
 * Quién agendó la llamada en el Typeform del CTA.
 *
 * Es el último escalón del embudo del webinar y el único que hoy se cargaba a mano.
 * Va como pantalla del área y no adentro de un webinar: el formulario es uno solo, y
 * las respuestas siguen llegando días después del vivo.
 */

const hora = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
};

export default function WebinarAgendas() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAgendasWebinar().then(setDatos).catch(setError);
  }, []);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const filas = datos?.agendas ?? [];
  const sinEmail = filas.length - (datos?.conEmail ?? 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Webinars"
        title="Agendas"
        desc="Quién completó el formulario del CTA"
        actions={filas.length ? <Pill tone="ok" dot>{filas.length} agendas</Pill> : null}
      />

      {!datos ? <SkeletonBlock height={280} /> : null}

      {datos && sinEmail ? (
        <Card title="Faltan emails">
          <p className="dim">
            {sinEmail} de {filas.length} respuestas llegaron sin email, así que a esas no
            se las puede cruzar contra el asistente ni contra el lead. Se arregla en el
            link del CTA: agregale un campo oculto <code>email</code> al Typeform y mandá
            el link como <code>…/to/xJN2o6Ms?email=&#123;mail del lead&#125;</code>.
          </p>
        </Card>
      ) : null}

      {datos && !filas.length ? (
        <Card title="Todavía nadie agendó">
          <p className="dim">
            Cuando alguien complete el formulario aparece acá, con sus respuestas.
          </p>
        </Card>
      ) : null}

      {filas.length ? (
        <Card title="Agendaron" sub={`${filas.length} personas · la última primero`} flush>
          <div className="vivo-gente">
            {filas.map((a) => (
              <div key={a.id} className="vivo-persona">
                <span className="strong">{a.nombre}</span>
                <span className="dim">{a.email || 'sin email'}</span>
                <span className="dim">{formatFecha(a.agendoAt)}</span>
                <span className="num">{hora(a.agendoAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
