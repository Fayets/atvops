import { useEffect, useState } from 'react';
import Card from '../ui/Card.jsx';
import { SkeletonBlock } from '../ui/Loading.jsx';
import { marcarVideoChats } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';

/**
 * Los videos del canal, en columnas.
 *
 * Salen de la base de ATV Ops: el canal se sincroniza solo cada tres horas con la clave
 * propia. El CTR y la retención no están porque la API de YouTube no los da: eso vive
 * únicamente en Studio.
 *
 * Chats es a mano, igual que en Reels: el interruptor decide cuáles entran al total.
 */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—');
const n = (v) => formatValue(v ?? 0, 'count');

/** 1986 segundos son 33:06. Un short y un video de media hora no se leen igual. */
const duracion = (seg) => {
  if (!seg) return '—';
  const m = Math.floor(seg / 60);
  const s = String(seg % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

function chatsDe(v) {
  return Number(v.chatsManual) || 0;
}

/** Interruptor + número editable. Misma lógica que en Reels. */
function CeldaChats({ videoId, inicialSuma, inicialChats, onCambio }) {
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
      const r = await marcarVideoChats(videoId, siguienteSuma, siguienteChats);
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
          ? 'Este video suma chats al contador. Tocá para sacarlo.'
          : 'Este video no suma. Tocá para meterlo al contador.'}
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
        aria-label="Chats de este video"
      />
    </span>
  );
}

export default function VideosYouTube({ yt, cargando }) {
  const [filas, setFilas] = useState(yt?.videos ?? []);

  useEffect(() => { setFilas(yt?.videos ?? []); }, [yt?.videos]);

  if (cargando) return <SkeletonBlock height={300} />;
  const t = yt?.totales ?? {};

  if (!filas.length) {
    return (
      <Card title="YouTube" sub="Nada publicado en este mes">
        <div className="empty">
          {yt?.conectado === false
            ? 'Falta la clave del canal en ATV Ops: se carga en Sistemas.'
            : 'No hay videos publicados en el mes elegido.'}
        </div>
      </Card>
    );
  }

  const chatsMarcados = filas.reduce((acc, v) => acc + (v.sumaChats ? chatsDe(v) : 0), 0);
  const cuantosSuman = filas.filter((v) => v.sumaChats).length;

  function actualizarFila(id, patch) {
    setFilas((prev) => prev.map((v) => (v.id === id
      ? { ...v, sumaChats: patch.sumaChats, chatsManual: patch.chats }
      : v)));
  }

  const sub = [
    `${n(t.vistas)} vistas`,
    `${n(t.vistasPromedio)} de promedio`,
    `${n(t.likes)} likes`,
    cuantosSuman
      ? `${n(chatsMarcados)} chats (${cuantosSuman} ${cuantosSuman === 1 ? 'video' : 'videos'})`
      : '0 chats marcados',
  ].join(' · ');

  return (
    <Card
      title={`${filas.length} ${filas.length === 1 ? 'video' : 'videos'}`}
      sub={sub}
      flush
      foot="Un video sigue sumando vistas durante meses: los números se refrescan en cada pasada. Los chats se marcan a mano: solo los prendidos suman al total."
    >
      <div className="reel-tabla" style={{ '--reel-cols': 5 }}>
        <div className="reel-fila cabecera">
          <span>Video</span>
          <span>Fecha</span>
          <span>Duración</span>
          <span>Vistas</span>
          <span>Likes</span>
          <span>Coment.</span>
          <span>Chats</span>
        </div>
        {filas.map((v) => (
          <div key={v.id} className="reel-fila">
            <span className="reel-pieza">
              {v.thumbnail
                ? <img className="ancho" src={v.thumbnail} alt="" loading="lazy" />
                : <span className="reel-sinfoto dim">—</span>}
              <span className="reel-titulo">
                {v.url ? <a href={v.url} target="_blank" rel="noreferrer">{v.titulo}</a> : v.titulo}
                {v.short && <code className="reel-keyword">short</code>}
              </span>
            </span>
            <span className="num dim">{dia(v.fecha)}</span>
            <span className="num dim">{duracion(v.duracionSeg)}</span>
            <span className="num">{n(v.vistas)}</span>
            <span className="num">{n(v.likes)}</span>
            <span className="num">{n(v.comentarios)}</span>
            <CeldaChats
              videoId={v.id}
              inicialSuma={Boolean(v.sumaChats)}
              inicialChats={chatsDe(v)}
              onCambio={(patch) => actualizarFila(v.id, patch)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
