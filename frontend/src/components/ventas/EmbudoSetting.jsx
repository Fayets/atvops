import { useState } from 'react';
import Card from '../ui/Card.jsx';
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
const fecha = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—');
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

/** Una etapa: el número y, si hay meta, cuánto lleva de ella. */
function Etapa({ label, valor, meta, nota, onVer }) {
  const avance = meta ? Math.min(Math.round((valor / meta) * 100), 999) : null;
  return (
    <article className={`etapa${onVer ? ' clickable' : ''}`} onClick={onVer}
      role={onVer ? 'button' : undefined} tabIndex={onVer ? 0 : undefined}
      onKeyDown={onVer ? (e) => (e.key === 'Enter' || e.key === ' ') && onVer() : undefined}>
      <span className="etapa-label">{label}</span>
      <span className="etapa-valor num">{n(valor)}</span>
      {nota && <span className="etapa-meta dim">{nota}</span>}
      {meta > 0 ? (
        <>
          <span className="etapa-meta dim">{`${avance}% de ${n(meta)}`}</span>
          <span className="barra"><span style={{ width: `${Math.min(avance, 100)}%` }} /></span>
        </>
      ) : <span className="etapa-meta dim">sin meta</span>}
      {onVer && <span className="etapa-ver">ver detalle</span>}
    </article>
  );
}

/** Las filas que componen una etapa. */
function Detalle({ titulo, filas, onCerrar }) {
  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card detalle-metrica" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <header>
          <div><h3>{titulo}</h3></div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>
        {filas.length === 0 ? (
          <div className="empty">Sin filas para esta etapa.</div>
        ) : (
          <div className="detalle-lista">
            <div className="detalle-fila cabecera">
              <span>Fecha</span><span>Quién</span><span /><span>Dato</span>
            </div>
            {filas.map((f, i) => (
              <div key={`${f.cuando}-${f.quien}-${i}`} className="detalle-fila">
                <span className="num dim">{fecha(f.cuando)}</span>
                <span className="strong detalle-quien">
                  {f.foto && <img className="detalle-foto" src={f.foto} alt="" loading="lazy" />}
                  {f.quien}
                </span>
                <span />
                <span className="valor">{f.dato}</span>
              </div>
            ))}
          </div>
        )}
        <footer className="dim">{filas.length} {filas.length === 1 ? 'fila' : 'filas'} · base de ATV Ops</footer>
      </div>
    </div>
  );
}

/** Lo que convierte de una etapa a la siguiente, entre las dos. */
function Paso({ conversion, benchmark }) {
  // Más del 100% no es un récord: es que las dos etapas no están contando lo mismo —por
  // ejemplo agendas que entraron sin pitch cargado—. Darle semáforo verde sería mentir.
  const incoherente = conversion != null && conversion > 100;
  const zona = incoherente ? null : zonaDe(conversion, benchmark);
  const titulo = incoherente
    ? 'Hay más en esta etapa que en la anterior: las dos no están contando los mismos leads.'
    : `Rango sano: ${benchmark.texto}`;
  return (
    <div className="embudo-paso" title={titulo}>
      <span className={`embudo-pct num${zona ? ` zona-${zona}` : ''}${incoherente ? ' dim' : ''}`}>
        {conversion == null ? '—' : `${conversion}%`}
      </span>
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
  const [detalle, setDetalle] = useState(null);

  const e = embudo ?? {};
  // De qué se compone el número: historias con CTA, reels y bio, otros canales.
  const repartoChats = (e.chatsPartes ?? [])
    .filter((p) => Number(p.cuantos) > 0)
    .map((p) => `${p.fuente.toLowerCase()} ${formatValue(p.cuantos, 'count')}`)
    .join(' · ');
  const metaChats = decreto.chats ?? 0;
  const metaPitches = decreto.conversaciones ?? 0;
  const metaAgendas = decreto.agendas ?? 0;
  // El decreto no fija shows: sale de las agendas por el show rate que se decretó.
  const metaShows = metaAgendas && decreto.showUpRate
    ? Math.round((metaAgendas * decreto.showUpRate) / 100)
    : 0;

  // Setting rate: del pitch al cierre. Es el número que resume el trabajo del setter,
  // porque atraviesa las cuatro etapas.
  const tasas = [
    { id: 'booking', label: 'Booking rate', valor: pct(e.agendas, e.pitches), b: BENCHMARKS.agendas,
      pie: `${n(e.agendas)} de ${n(e.pitches)} pitches` },
    { id: 'show', label: 'Show rate', valor: e.showRate ?? pct(e.shows, e.agendas), b: BENCHMARKS.shows,
      pie: `${n(e.shows)} de las que ya pasaron` },
    { id: 'close', label: 'Close rate', valor: pct(e.cierres, e.shows), b: { verde: 25, amarillo: 15 },
      pie: `${n(e.cierres)} de ${n(e.shows)} shows` },
    { id: 'setting', label: 'Setting rate', valor: pct(e.cierres, e.pitches), b: null,
      pie: 'del pitch al cierre' },
  ];

  const abrir = (titulo, clave) => () =>
    setDetalle({ titulo, filas: e.detalle?.[clave] ?? [] });

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
          ? 'Chats y pitches todavía no tienen fuente conectada. Agendas y shows sí salen de la base de ATV Ops.'
          : `Los chats entran por ${repartoChats || 'ninguna puerta este mes'}. Pitches sale del reporte del setter; agendas y shows, de las reuniones.`}
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

        <div className="tasas">
          {tasas.map((t) => (
            <div key={t.id} className="tasa">
              <span className="tasa-label">{t.label}</span>
              <span className={`tasa-valor num${t.b ? ` zona-${zonaDe(t.valor, t.b) ?? ''}` : ''}`}>
                {t.valor == null ? '—' : `${t.valor}%`}
              </span>
              <span className="tasa-pie dim">{t.pie}</span>
            </div>
          ))}
        </div>

        <div className="embudo">
          <Etapa label="Chats" valor={e.chats} meta={metaChats} nota={repartoChats}
            onVer={abrir('Chats', 'chats')} />
          <Paso conversion={pct(e.pitches, e.chats)} benchmark={BENCHMARKS.pitches} />
          <Etapa label="Pitches" valor={e.pitches} meta={metaPitches} onVer={abrir('Pitches', 'pitches')} />
          <Paso conversion={pct(e.agendas, e.pitches)} benchmark={BENCHMARKS.agendas} />
          <Etapa label="Agendas" valor={e.agendas} meta={metaAgendas} onVer={abrir('Agendas', 'agendas')} />
          <Paso conversion={e.showRate ?? pct(e.shows, e.agendas)} benchmark={BENCHMARKS.shows} />
          <Etapa label="Shows" valor={e.shows} meta={metaShows} onVer={abrir('Shows', 'shows')} />
        </div>
      </Card>

      <Card
        title="Leads entrantes por canal"
        sub={e.porCanal?.length ? '' : 'Todavía sin conversaciones este mes'}
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

      {detalle && <Detalle {...detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}
