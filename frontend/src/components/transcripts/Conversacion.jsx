import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { colorAutor, inicialesAutor } from '../../lib/autores.js';
import { formatFecha, hace } from '../../lib/format.js';
import Pill from '../ui/Pill.jsx';
import Adjunto from './Adjunto.jsx';

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

  // Un chat se lee desde el final: al abrir (o cambiar de canal) arranca abajo
  // del todo; si llegan mensajes nuevos al canal abierto, baja suave.
  const scrollRef = useRef(null);
  const canalMostrado = useRef(null);
  const cantidad = useRef(0);
  const alFinal = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useLayoutEffect(() => {
    if (canalMostrado.current !== canal.id) {
      alFinal();
      canalMostrado.current = canal.id;
    } else if (mensajes.length > cantidad.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
    cantidad.current = mensajes.length;
  }, [canal.id, mensajes.length, alFinal]);
  // Las imágenes cargan después del layout y empujan el contenido: volver al final.
  useEffect(() => {
    const t = setTimeout(alFinal, 250);
    return () => clearTimeout(t);
  }, [canal.id, alFinal]);

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
                        {m.adjuntos.map((a) => (
                          <Adjunto
                            key={a.url}
                            adjunto={a}
                            categoria={canal.categoria}
                            canal={canal.canal}
                            onCarga={canalMostrado.current === canal.id && mensajes.length === cantidad.current ? undefined : alFinal}
                          />
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
