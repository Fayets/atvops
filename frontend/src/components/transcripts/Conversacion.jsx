import { useEffect, useRef } from 'react';
import { colorAutor, inicialesAutor } from '../../lib/autores.js';
import { formatFecha, hace } from '../../lib/format.js';
import Pill from '../ui/Pill.jsx';

const CATEGORIA_TONO = { boost: 'alert', advantage: 'warn', mentoria: 'plain', avanzados: 'plain', principiantes: 'plain', updates: 'ok' };
const diaDe = (iso) => iso.slice(0, 10);
const hora = (iso) => iso.slice(11, 16);

/**
 * La conversación de un canal, tal como la escribe el bot. Si llegan mensajes
 * nuevos al canal abierto, baja sola al final.
 * @param {{ canal: object, mensajes: object[], resaltar?: string }} props
 */
export default function Conversacion({ canal, mensajes, resaltar = '' }) {
  const ahora = new Date();
  const q = resaltar.trim().toLowerCase();

  const scrollRef = useRef(null);
  const previo = useRef({ canal: canal.id, n: mensajes.length });
  useEffect(() => {
    const el = scrollRef.current;
    const p = previo.current;
    if (el) {
      if (p.canal !== canal.id) el.scrollTop = el.scrollHeight;
      else if (mensajes.length > p.n) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    previo.current = { canal: canal.id, n: mensajes.length };
  }, [canal.id, mensajes.length]);

  return (
    <section className="chat-panel">
      <header className="chat-panel-head">
        <div className="chat-panel-title">
          <h2>
            <span style={{ color: 'var(--text-3)' }}>#</span>
            {canal.canal}
          </h2>
          <Pill tone={CATEGORIA_TONO[canal.categoria] ?? 'plain'}>{canal.categoria}</Pill>
          <span className="chat-panel-stats">
            {canal.mensajes} mensajes · {formatFecha(canal.primer_mensaje_at)} → {formatFecha(canal.ultimo_mensaje_at)} · último{' '}
            <span style={{ color: (canal.dias_sin_actividad ?? 0) >= 7 ? 'var(--warn)' : 'inherit' }}>
              {hace(canal.ultimo_mensaje_at, ahora)}
            </span>
          </span>
        </div>
        <div className="chat-panel-autores">
          {canal.autores.map((a) => (
            <span className="autor-chip" key={a.nombre}>
              <i style={{ background: colorAutor(a.nombre) }} />
              {a.nombre}
              <span style={{ color: 'var(--text-3)' }}>{a.mensajes} · {Math.round((a.mensajes / canal.mensajes) * 100)}%</span>
            </span>
          ))}
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        <div className="conversacion">
          {mensajes.map((m, i) => {
            const ant = mensajes[i - 1];
            const nuevoDia = !ant || diaDe(ant.fecha_at) !== diaDe(m.fecha_at);
            const continuacion = !nuevoDia && ant && ant.autor === m.autor;
            const coincide = q && (m.contenido.toLowerCase().includes(q) || m.autor.toLowerCase().includes(q));
            return (
              <div key={m.indice}>
                {nuevoDia && <div className="dia-sep">{formatFecha(m.fecha_at)}</div>}
                <div className={`msg${continuacion ? ' continuacion' : ''}`} style={coincide ? { background: 'var(--brand-dim)' } : undefined}>
                  {continuacion ? <span /> : (
                    <span className="msg-avatar" style={{ background: colorAutor(m.autor) }}>{inicialesAutor(m.autor)}</span>
                  )}
                  <div>
                    {!continuacion && (
                      <div className="msg-top">
                        <span className="msg-autor" style={{ color: colorAutor(m.autor) }}>{m.autor}</span>
                        <span className="msg-hora num">{hora(m.fecha_at)}</span>
                      </div>
                    )}
                    {m.contenido ? <div className="msg-cuerpo">{m.contenido}</div> : <div className="msg-cuerpo msg-vacio">— sin texto —</div>}
                    {m.adjuntos.length > 0 && (
                      <div className="msg-adjuntos">
                        {m.adjuntos.map((url) => (
                          <a key={url} className="msg-adjunto" href={url} target="_blank" rel="noreferrer noopener">
                            📎 {url.split('/').pop()?.split('?')[0] || url}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="chat-panel-foot">{canal.archivo}</footer>
    </section>
  );
}
