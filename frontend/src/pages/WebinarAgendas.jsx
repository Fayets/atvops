import { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getAgendasWebinar } from '../data/api.js';

/**
 * Quién completó el formulario del CTA y qué contestó.
 *
 * Es el último escalón del embudo del webinar. Las respuestas son la mitad del valor:
 * "cuánto estás dispuesto a invertir" y "qué tan pronto lo querés resolver" deciden a
 * quién llama primero el closer. Por eso van como columnas y no escondidas detrás de
 * un clic: la pantalla existe para ordenar una cola de llamadas, no para listar mails.
 */

const fechaYhora = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** El encabezado corto. La pregunta entera queda en el title, al pasar el mouse. */
const corto = (p) => {
  const limpio = p.replace(/[¿?]/g, '').trim();
  return limpio.length > 26 ? `${limpio.slice(0, 26)}…` : limpio;
};

export default function WebinarAgendas() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { getAgendasWebinar().then(setDatos).catch(setError); }, []);

  const filas = datos?.agendas ?? [];
  const preguntas = datos?.preguntas ?? [];

  // Nombre y mail ya tienen su columna: repetirlos como respuesta es ruido.
  const extras = useMemo(
    () => preguntas.filter((p) => !/nombre|mail|email/i.test(p)),
    [preguntas],
  );

  const columnas = useMemo(() => {
    const valor = (a, pregunta) =>
      (a.respuestas.find((r) => r.pregunta === pregunta)?.valor || '').trim();
    return [
      { key: 'nombre', label: 'Quién', render: (a) => <span className="strong">{a.nombre}</span> },
      { key: 'email', label: 'Email', render: (a) => <span className="dim">{a.email || '—'}</span> },
      ...extras.map((p) => ({
        key: p,
        label: corto(p),
        value: (a) => valor(a, p),
        render: (a) => <span className="dim" title={`${p}: ${valor(a, p)}`}>{valor(a, p) || '—'}</span>,
      })),
      {
        key: 'agendoAt',
        label: 'Completó',
        render: (a) => <span className="dim">{fechaYhora(a.agendoAt)}</span>,
      },
      {
        key: 'llamadaAt',
        label: 'Llamada',
        value: (a) => a.llamadaAt || '',
        render: (a) => (a.llamadaAt
          ? <span className="strong">{fechaYhora(a.llamadaAt)}</span>
          : <span className="zona-warn">sin reservar</span>),
      },
    ];
  }, [extras]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const sinEmail = filas.length - (datos?.conEmail ?? 0);

  return (
    <div className="page page-ancha">
      <PageHeader
        eyebrow="Webinars"
        title="Agendas"
        desc="Quién completó el formulario del CTA y qué contestó"
        actions={filas.length ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Pill tone="ok" dot>{datos?.conLlamada ?? 0} reservaron</Pill>
            <Pill tone="plain">{filas.length} completaron</Pill>
          </div>
        ) : null}
      />

      {!datos ? <SkeletonBlock height={320} /> : null}

      {datos && filas.length && (datos.conLlamada ?? 0) < filas.length ? (
        <Card title={`${filas.length - (datos.conLlamada ?? 0)} completaron el formulario y no reservaron llamada`}>
          <p className="dim">
            Completar el formulario del CTA y reservar la llamada son dos pasos. Los que
            quedaron en el medio están en la tabla con <strong>“sin reservar”</strong>:
            son los que hay que empujar hoy, porque ya levantaron la mano.
          </p>
        </Card>
      ) : null}

      {datos && sinEmail ? (
        <Card title="Faltan emails">
          <p className="dim">
            {sinEmail} de {filas.length} respuestas llegaron sin email, así que a esas no
            se las puede cruzar contra el asistente ni contra el lead.
          </p>
        </Card>
      ) : null}

      {datos && !filas.length ? (
        <Card title="Todavía nadie agendó">
          <p className="dim">Cuando alguien complete el formulario aparece acá, con sus respuestas.</p>
        </Card>
      ) : null}

      {filas.length ? (
        <Card
          title="Agendaron"
          sub={`${filas.length} personas · la última primero`}
          flush
          foot="Se puede ordenar por cualquier columna. Lo que dijeron sobre presupuesto y urgencia es lo que decide a quién llamar primero."
        >
          <DataTable
            columns={columnas}
            rows={filas}
            rowKey={(a) => a.id}
            porPagina={20}
          />
        </Card>
      ) : null}
    </div>
  );
}
