import { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getAgendasWebinar } from '../data/api.js';

/**
 * Los dos números del CTA del webinar, cada uno con su lista.
 *
 * Son dos cosas distintas y entre medio se cae gente: completar el formulario es
 * levantar la mano, reservar la llamada es el paso que factura. Del 28-09-2026, 36
 * completaron y 8 reservaron.
 *
 * Se eligen de a uno en vez de mostrarse los dos juntos: son dos preguntas distintas
 * —"a quién llamo hoy" y "quién levantó la mano y no reservó"— y apiladas una arriba de
 * la otra no se lee ninguna.
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
  return limpio.length > 24 ? `${limpio.slice(0, 24)}…` : limpio;
};

function Numero({ label, valor, nota, elegido, onElegir }) {
  return (
    <button type="button" className={`agenda-numero${elegido ? ' elegido' : ''}`} onClick={onElegir}>
      <span className="agenda-numero-valor num">{valor}</span>
      <span className="agenda-numero-label">{label}</span>
      <span className="agenda-numero-nota">{nota}</span>
    </button>
  );
}

export default function WebinarAgendas() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [ver, setVer] = useState('agendas');

  useEffect(() => { getAgendasWebinar().then(setDatos).catch(setError); }, []);

  const filas = datos?.agendas ?? [];
  const agendadas = datos?.agendadas ?? [];
  const preguntas = datos?.preguntas ?? [];

  // Nombre y mail ya tienen su columna: repetirlos como respuesta es ruido.
  const extras = useMemo(() => preguntas.filter((p) => !/nombre|mail|email/i.test(p)), [preguntas]);

  const columnasCta = useMemo(() => {
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
        key: 'llamadaAt',
        label: 'Llamada',
        value: (a) => a.llamadaAt || '',
        render: (a) => (a.llamadaAt
          ? <span className="strong">{fechaYhora(a.llamadaAt)}</span>
          : <span className="zona-warn">sin reservar</span>),
      },
    ];
  }, [extras]);

  const columnasAgendas = useMemo(() => [
    { key: 'nombre', label: 'Quién', render: (a) => <span className="strong">{a.nombre}</span> },
    { key: 'email', label: 'Email', render: (a) => <span className="dim">{a.email}</span> },
    {
      key: 'delFormulario',
      label: 'De dónde salió',
      value: (a) => (a.delFormulario ? 1 : 0),
      render: (a) => (a.delFormulario
        ? <span className="dim">completó el CTA</span>
        : <span className="zona-warn">no pasó por el formulario</span>),
    },
    { key: 'llamadaAt', label: 'Llamada', render: (a) => <span>{fechaYhora(a.llamadaAt)}</span> },
  ], []);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const sinReservar = filas.length - (datos?.conLlamada ?? 0);

  return (
    <div className="page page-ancha">
      <PageHeader
        title="Agendas"
        desc="El CTA del webinar: quién levantó la mano y quién reservó"
        actions={datos ? <Pill tone="plain">se actualiza solo</Pill> : null}
      />

      {!datos ? <SkeletonBlock height={320} /> : null}

      {datos ? (
        <div className="agenda-numeros">
          <Numero
            label="Agendas" valor={agendadas.length}
            nota="reservaron llamada · tocá para ver quiénes"
            elegido={ver === 'agendas'} onElegir={() => setVer('agendas')}
          />
          <Numero
            label="Completaron el CTA" valor={filas.length}
            nota={`${sinReservar} todavía sin reservar · tocá para ver qué contestaron`}
            elegido={ver === 'cta'} onElegir={() => setVer('cta')}
          />
        </div>
      ) : null}

      {datos && ver === 'agendas' ? (
        <Card
          title="Quiénes agendaron"
          sub={`${agendadas.length} personas · quien reprogramó cuenta una vez`}
          flush
          foot="Todas las del calendario de consults. Las que dicen “no pasó por el formulario” llegaron por DM o por el link suelto: cuentan igual."
        >
          <DataTable columns={columnasAgendas} rows={agendadas} rowKey={(a) => a.email} porPagina={20} />
        </Card>
      ) : null}

      {datos && ver === 'cta' ? (
        <Card
          title="Qué contestó cada uno"
          sub={`${filas.length} completaron el formulario · ${sinReservar} todavía no reservaron`}
          flush
          foot="Ordenable por cualquier columna. Lo que dijeron sobre presupuesto y urgencia es lo que decide a quién llamar primero."
        >
          <DataTable columns={columnasCta} rows={filas} rowKey={(a) => a.id} porPagina={20} />
        </Card>
      ) : null}
    </div>
  );
}
