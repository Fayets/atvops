import { useState } from 'react';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * El embudo de setting, en cuatro etapas.
 *
 * Son cuatro y no cinco porque acá el pitch y la aplicación son la misma acción: mandar
 * el link de agenda. Separarlas sería inventar un paso que nadie hace.
 *
 * El pitch es el número que define el mes del setter. Lo que sale por Instagram se
 * detecta leyendo el mensaje; lo que se manda por WhatsApp o por audio lo marca el setter
 * con el botón, porque no hay forma de leerlo.
 */

const n = (v, f = 'count') => formatValue(v ?? 0, f);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** Los rangos sanos de cada paso. Fuera de rango no es un adorno: es dónde mirar. */
const BENCHMARKS = {
  pitches: { verde: 30, amarillo: 20, texto: '30-40% sano' },
  agendas: { verde: 25, amarillo: 15, texto: '25-40% sano' },
  shows: { verde: 80, amarillo: 65, texto: '80% o más' },
};

const zonaDe = (valor, b) => {
  if (valor == null || !b) return null;
  if (valor >= b.verde) return 'ok';
  if (valor >= b.amarillo) return 'warn';
  return 'alert';
};

const ETIQUETA = { ok: 'en rango', warn: 'precaución', alert: 'problema' };

/** Una etapa: el número y, si hay meta, cuánto lleva de ella. */
function Etapa({ label, valor, meta }) {
  const avance = meta ? Math.min(Math.round((valor / meta) * 100), 999) : null;
  return (
    <article className="etapa">
      <span className="etapa-label">{label}</span>
      <span className="etapa-valor num">{n(valor)}</span>
      {meta > 0 ? (
        <>
          <span className="etapa-meta dim">{`${avance}% de ${n(meta)}`}</span>
          <span className="barra"><span style={{ width: `${Math.min(avance, 100)}%` }} /></span>
        </>
      ) : <span className="etapa-meta dim">sin meta</span>}
    </article>
  );
}

/** Lo que convierte de una etapa a la siguiente, entre las dos. */
function Paso({ conversion, benchmark }) {
  const zona = zonaDe(conversion, benchmark);
  return (
    <div className="embudo-paso" title={`Rango sano: ${benchmark.texto}`}>
      <span className={`embudo-pct num zona-${zona}`}>{conversion == null ? '—' : `${conversion}%`}</span>
      {zona && <Pill tone={zona} dot>{ETIQUETA[zona]}</Pill>}
    </div>
  );
}

/** El tiempo hasta la primera respuesta: lo que decide si la conversación sigue viva. */
function Respuesta({ minutos, medidas, canal }) {
  const zona = minutos == null ? null : minutos < 5 ? 'ok' : minutos <= 30 ? 'warn' : 'alert';
  const texto = minutos == null
    ? '—'
    : minutos < 60 ? `${minutos} min` : `${Math.round(minutos / 6) / 10} h`;
  return (
    <div className="resp-canal">
      <div className="resp-cab">
        <span className="strong">{canal}</span>
        {zona && <Pill tone={zona} dot>{zona === 'ok' ? 'rápido' : zona === 'warn' ? 'lento' : 'muy lento'}</Pill>}
      </div>
      <div className={`resp-valor num zona-${zona}`}>{texto}</div>
      <div className="dim">{medidas ? `${n(medidas)} ${medidas === 1 ? 'conversación medida' : 'conversaciones medidas'}` : 'sin datos'}</div>
    </div>
  );
}

/**
 * @param {{ embudo: object, decreto: object, onPitch?: (datos: object) => Promise<void> }} props
 */
export default function EmbudoSetting({ embudo, decreto = {}, onPitch }) {
  const [marcando, setMarcando] = useState(false);
  const [prospecto, setProspecto] = useState('');
  const [canal, setCanal] = useState('whatsapp');
  const [guardando, setGuardando] = useState(false);

  const e = embudo ?? {};
  const metaChats = decreto.chats ?? 0;
  const metaPitches = decreto.conversaciones ?? 0;
  const metaAgendas = decreto.agendas ?? 0;
  // El decreto no fija shows: sale de las agendas por el show rate que se decretó.
  const metaShows = metaAgendas && decreto.showUpRate
    ? Math.round((metaAgendas * decreto.showUpRate) / 100)
    : 0;

  const marcar = async (ev) => {
    ev.preventDefault();
    setGuardando(true);
    try {
      await onPitch?.({ prospecto: prospecto.trim(), canal });
      setProspecto('');
      setMarcando(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Card
        title="Embudo de setting"
        sub="Cuatro etapas: el pitch y la aplicación son la misma acción, mandar el link de agenda"
        actions={onPitch && (
          <button className="btn primary" onClick={() => setMarcando((v) => !v)}>
            {marcando ? 'Cancelar' : '+ Marcar pitch'}
          </button>
        )}
        foot={e.conectado === false
          ? 'Chats y pitches todavía no tienen fuente conectada: llegan del webhook de Instagram y de ManyChat. Agendas y shows sí salen de la base de ATV Ops.'
          : 'Chats y pitches salen de las conversaciones; agendas y shows, de las reuniones.'}
      >
        {marcando && (
          <form className="pitch-form" onSubmit={marcar}>
            <input
              value={prospecto}
              onChange={(ev) => setProspecto(ev.target.value)}
              placeholder="A quién le mandaste el link"
              aria-label="Prospecto"
              autoFocus
            />
            <select value={canal} onChange={(ev) => setCanal(ev.target.value)} aria-label="Canal">
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="manual">Otro</option>
            </select>
            <button type="submit" className="btn primary" disabled={guardando || !prospecto.trim()}>
              {guardando ? 'Guardando…' : 'Marcar'}
            </button>
          </form>
        )}

        <div className="embudo">
          <Etapa label="Chats" valor={e.chats} meta={metaChats} />
          <Paso conversion={pct(e.pitches, e.chats)} benchmark={BENCHMARKS.pitches} />
          <Etapa label="Pitches" valor={e.pitches} meta={metaPitches} />
          <Paso conversion={pct(e.agendas, e.pitches)} benchmark={BENCHMARKS.agendas} />
          <Etapa label="Agendas" valor={e.agendas} meta={metaAgendas} />
          <Paso conversion={e.showRate ?? pct(e.shows, e.agendas)} benchmark={BENCHMARKS.shows} />
          <Etapa label="Shows" valor={e.shows} meta={metaShows} />
        </div>
      </Card>

      <Card
        title="Tiempo de respuesta"
        sub="Del primer mensaje del lead a la primera respuesta del equipo"
        foot="Verde menos de 5 minutos, amarillo hasta 30, rojo por encima."
      >
        {!e.respuesta?.medidas ? (
          <div className="empty">
            Todavía no hay conversaciones medidas. El tiempo sale de los mensajes que avisa
            Instagram: se empieza a medir cuando el webhook esté conectado.
          </div>
        ) : (
          <div className="resp-canales">
            <Respuesta canal="Todos los canales" minutos={e.respuesta.minutos} medidas={e.respuesta.medidas} />
            {(e.respuesta.porCanal ?? []).map((c) => (
              <Respuesta key={c.canal} canal={c.canal} minutos={c.minutos} medidas={c.medidas} />
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Leads entrantes por canal"
        sub={e.porCanal?.length ? 'De dónde entró cada conversación del mes' : 'Todavía sin conversaciones este mes'}
        flush
        foot="Instagram entra por respuestas a historias y reels. WhatsApp, por el opt-in de la landing."
      >
        {!e.porCanal?.length ? (
          <div className="empty">Sin leads registrados en el mes.</div>
        ) : (
          <div className="proy-tabla origen">
            <div className="proy-fila cabecera">
              <span>Canal</span>
              <span>Chats</span>
              <span>Pitches</span>
              <span>Conversión</span>
              <span>% del total</span>
            </div>
            {e.porCanal.map((c) => (
              <div key={c.canal} className="proy-fila">
                <span className="strong">{c.canal}</span>
                <span className="num">{n(c.chats)}</span>
                <span className="num">{n(c.pitches)}</span>
                <span className="num">{pct(c.pitches, c.chats) ?? '—'}%</span>
                <span className="num dim">{e.chats ? `${Math.round((c.chats / e.chats) * 100)}%` : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
