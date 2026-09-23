import { useEffect, useState } from 'react';
import Card from '../ui/Card.jsx';
import { marcarReelChats } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';

/**
 * Los reels del mes con lo que midió Instagram, en columnas.
 *
 * Una tabla y no tarjetas sueltas: lo que se hace acá es comparar un reel contra otro, y
 * para eso los números tienen que caer en la misma columna.
 *
 * Chats es a mano por ahora: el CRM no trae bien cuántos abrió cada reel. El interruptor
 * decide cuáles entran al total de arriba; el número se edita en la celda.
 */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—');
const n = (v) => formatValue(v ?? 0, 'count');

const COLUMNAS = [
  { id: 'views', label: 'Vistas' },
  { id: 'reach', label: 'Alcance' },
  { id: 'likes', label: 'Likes' },
  { id: 'comments', label: 'Coment.' },
  { id: 'shares', label: 'Comp.' },
  { id: 'saved', label: 'Guard.' },
  { id: 'total_interactions', label: 'Interac.' },
];

/** Cuántos chats muestra / edita una fila: el manual si ya se guardó, si no el del CRM. */
function chatsDe(r) {
  if (r.chatsManual != null) return Number(r.chatsManual) || 0;
  return Number(r.conversaciones) || 0;
}

/**
 * Interruptor + número editable. Prendido = ese reel suma al contador de arriba.
 * Apagado no pinta de rojo: es el estado normal, igual que el CTA de historias.
 */
function CeldaChats({ mediaId, inicialSuma, inicialChats, onCambio }) {
  const [suma, setSuma] = useState(Boolean(inicialSuma));
  const [chats, setChats] = useState(Number(inicialChats) || 0);
  const [texto, setTexto] = useState(String(Number(inicialChats) || 0));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setSuma(Boolean(inicialSuma));
    setChats(Number(inicialChats) || 0);
    setTexto(String(Number(inicialChats) || 0));
  }, [inicialSuma, inicialChats]);

  async function guardar(siguienteSuma, siguienteChats) {
    const antes = { suma, chats };
    setSuma(siguienteSuma);
    setChats(siguienteChats);
    setTexto(String(siguienteChats));
    onCambio?.({ sumaChats: siguienteSuma, chats: siguienteChats });
    setGuardando(true);
    try {
      const r = await marcarReelChats(mediaId, siguienteSuma, siguienteChats);
      const chatsOk = Number(r?.chats ?? siguienteChats) || 0;
      const sumaOk = Boolean(r?.sumaChats ?? siguienteSuma);
      setSuma(sumaOk);
      setChats(chatsOk);
      setTexto(String(chatsOk));
      if (sumaOk !== siguienteSuma || chatsOk !== siguienteChats) {
        onCambio?.({ sumaChats: sumaOk, chats: chatsOk });
      }
    } catch {
      setSuma(antes.suma);
      setChats(antes.chats);
      setTexto(String(antes.chats));
      onCambio?.({ sumaChats: antes.suma, chats: antes.chats });
    } finally {
      setGuardando(false);
    }
  }

  async function alternar() {
    await guardar(!suma, chats);
  }

  function alCambiarTexto(e) {
    setTexto(e.target.value.replace(/[^\d]/g, ''));
  }

  async function alConfirmarNumero() {
    const valor = Math.max(0, parseInt(texto || '0', 10) || 0);
    setTexto(String(valor));
    if (valor === chats && suma) return;
    // Si escribió un número con el interruptor apagado, lo prende: no tiene sentido
    // guardar un chat que no suma.
    await guardar(suma || valor > 0, valor);
  }

  return (
    <span className={`reel-chats-celda${suma ? ' activo' : ''}`}>
      <button
        type="button"
        className={`btn sm cta-toggle${suma ? ' activo' : ''}`}
        onClick={alternar}
        disabled={guardando}
        aria-pressed={suma}
        title={suma
          ? 'Este reel suma chats al contador. Tocá para sacarlo.'
          : 'Este reel no suma. Tocá para meterlo al contador.'}
      >
        <i className="cta-luz" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        className={`reel-chats-input num${suma && chats ? ' reel-chats' : ' dim'}`}
        value={texto}
        onChange={alCambiarTexto}
        onBlur={alConfirmarNumero}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        disabled={guardando}
        aria-label="Chats de este reel"
      />
    </span>
  );
}

export default function Reels({ items }) {
  const [filas, setFilas] = useState(items);

  useEffect(() => { setFilas(items); }, [items]);

  if (!filas.length) {
    return (
      <Card title="Reels" sub="Nada publicado en este mes">
        <div className="empty">No hay reels publicados en el mes elegido.</div>
      </Card>
    );
  }

  const total = (campo) => filas.reduce((t, r) => t + (r[campo] ?? 0), 0);
  const chatsMarcados = filas.reduce(
    (t, r) => t + (r.sumaChats ? chatsDe(r) : 0),
    0,
  );
  const cuantosSuman = filas.filter((r) => r.sumaChats).length;

  function actualizarFila(id, patch) {
    setFilas((prev) => prev.map((r) => (r.id === id
      ? { ...r, sumaChats: patch.sumaChats, chatsManual: patch.chats }
      : r)));
  }

  const sub = [
    `${n(total('views'))} vistas`,
    `${n(total('reach'))} de alcance`,
    `${n(total('total_interactions'))} interacciones`,
    cuantosSuman
      ? `${n(chatsMarcados)} chats (${cuantosSuman} ${cuantosSuman === 1 ? 'reel' : 'reels'})`
      : '0 chats marcados',
  ].join(' · ');

  return (
    <Card
      title={`${filas.length} ${filas.length === 1 ? 'reel' : 'reels'}`}
      sub={sub}
      flush
      foot="Vistas son reproducciones; alcance son cuentas distintas. Instagram las refresca cada tres horas. Los chats se marcan a mano: solo los prendidos suman al total."
    >
      <div className="reel-tabla" style={{ '--reel-cols': COLUMNAS.length + 1 }}>
        <div className="reel-fila cabecera">
          <span>Reel</span>
          <span>Fecha</span>
          {COLUMNAS.map((c) => <span key={c.id}>{c.label}</span>)}
          <span>Chats</span>
        </div>
        {filas.map((r) => (
          <div key={r.id} className="reel-fila">
            <span className="reel-pieza">
              {r.thumbnail
                ? <img src={r.thumbnail} alt="" loading="lazy" />
                : <span className="reel-sinfoto dim">—</span>}
              <span className="reel-titulo">
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.titulo}</a> : r.titulo}
                {r.keyword && <code className="reel-keyword">{r.keyword}</code>}
              </span>
            </span>
            <span className="num dim">{dia(r.fecha)}</span>
            {COLUMNAS.map((c) => <span key={c.id} className="num">{n(r[c.id])}</span>)}
            <CeldaChats
              mediaId={r.id}
              inicialSuma={Boolean(r.sumaChats)}
              inicialChats={chatsDe(r)}
              onCambio={(patch) => actualizarFila(r.id, patch)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
