import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon.jsx';
import { preguntarAsistente } from '../data/api.js';
import { formatFecha } from '../lib/format.js';
import { useLocalState } from '../lib/hooks.js';
import { useRol } from '../lib/RolContext.jsx';

const SUGERENCIAS = [
  '¿Qué clientes llevan más de 7 días sin escribir?',
  '¿Cómo se calcula el score de salud?',
  '¿Cómo funciona la vista Activación?',
  '¿Quién está pidiendo devolución o quiere irse?',
  'Resumime la última semana de un cliente (decime el nombre)',
];

const nuevoChat = () => ({ id: `c_${Date.now()}`, titulo: null, creadoAt: new Date().toISOString(), turnos: [] });

/**
 * ATV AI: chat del equipo sobre la cartera, los transcripts y el sistema.
 * Cada usuario tiene sus chats (en su navegador); se pueden abrir varios.
 */
export default function Asistente() {
  const { user } = useRol();
  const clave = `atv-ops:atvai:${user?.username ?? 'anon'}`;
  const [estado, setEstado] = useLocalState(clave, () => {
    const c = nuevoChat();
    return { chats: [c], activo: c.id };
  });
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState(null);
  const finRef = useRef(null);
  const inputRef = useRef(null);
  const MAX_LINEAS = 6;

  const ajustarAltura = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const estilos = getComputedStyle(el);
    const lineHeight = parseFloat(estilos.lineHeight) || 21;
    const padY = parseFloat(estilos.paddingTop) + parseFloat(estilos.paddingBottom);
    const maxH = lineHeight * MAX_LINEAS + padY;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  };

  useEffect(() => {
    ajustarAltura();
  }, [texto]);

  const chats = estado.chats ?? [];
  const chat = useMemo(() => chats.find((c) => c.id === estado.activo) ?? chats[0], [chats, estado.activo]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat?.turnos?.length, pensando]);

  const actualizarChat = (id, fn) =>
    setEstado((prev) => ({ ...prev, chats: prev.chats.map((c) => (c.id === id ? fn(c) : c)) }));

  const crear = () => {
    const c = nuevoChat();
    setEstado((prev) => ({ chats: [c, ...prev.chats], activo: c.id }));
    setError(null);
  };

  const borrar = (id) => {
    setEstado((prev) => {
      const restantes = prev.chats.filter((c) => c.id !== id);
      if (!restantes.length) {
        const c = nuevoChat();
        return { chats: [c], activo: c.id };
      }
      return { chats: restantes, activo: prev.activo === id ? restantes[0].id : prev.activo };
    });
  };

  const enviar = async (pregunta) => {
    const p = (pregunta ?? texto).trim();
    if (!p || pensando || !chat) return;
    setTexto('');
    setError(null);
    const id = chat.id;
    const historial = chat.turnos.slice(-8).map((t) => ({ rol: t.rol, texto: t.texto }));
    actualizarChat(id, (c) => ({
      ...c,
      titulo: c.titulo ?? p.slice(0, 60),
      turnos: [...c.turnos, { id: Date.now(), rol: 'usuario', texto: p, at: new Date().toISOString() }],
    }));
    setPensando(true);
    try {
      const r = await preguntarAsistente(p, historial);
      actualizarChat(id, (c) => ({
        ...c,
        turnos: [
          ...c.turnos,
          {
            id: Date.now() + 1,
            rol: 'asistente',
            texto: r.respuesta,
            citas: r.citas,
            meta: { modelo: r.modelo, tokens: r.tokens_entrada + r.tokens_salida, ms: r.duracion_ms, coincidencias: r.coincidencias },
            at: new Date().toISOString(),
          },
        ],
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="page atvai-page">
      <div className="atvai">
        <aside className="atvai-rail">
          <button className="btn primary atvai-nuevo" onClick={crear}>
            <Icon name="mas" size={13} />
            Nuevo chat
          </button>
          <div className="atvai-lista">
            {chats.map((c) => (
              <div key={c.id} className={`atvai-item${c.id === chat?.id ? ' activo' : ''}`}>
                <button className="atvai-item-btn" onClick={() => setEstado((prev) => ({ ...prev, activo: c.id }))}>
                  <span className="atvai-item-titulo">{c.titulo ?? 'Chat nuevo'}</span>
                  <span className="atvai-item-fecha">{formatFecha(c.creadoAt)}{c.turnos.length ? ` · ${Math.ceil(c.turnos.length / 2)} preg.` : ''}</span>
                </button>
                <button className="atvai-item-borrar" onClick={() => borrar(c.id)} title="Borrar chat" aria-label="Borrar chat">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="chat-asistente">
          <div className="chat-asistente-scroll">
            {chat && chat.turnos.length === 0 && (
              <div className="asistente-vacio">
                <div className="atvai-marca">
                  <img src="/atv-logo.png" alt="" width={40} height={40} />
                  <h2>ATV AI</h2>
                  <p>Preguntá por un cliente, por lo que se dijo en un canal, o por cómo funciona cualquier vista.</p>
                </div>
                <div className="sugerencias">
                  {SUGERENCIAS.map((s) => (
                    <button key={s} className="chip sugerencia" onClick={() => enviar(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat?.turnos.map((t) => (
              <div key={t.id} className={`burbuja ${t.rol}`}>
                <div className="burbuja-texto">{t.texto}</div>
                {t.citas?.length > 0 && (
                  <div className="burbuja-citas">
                    {t.citas.map((c) => (
                      <Link key={c.canalId ?? c.canal} to={c.canalId ? `/fulfillment/chats/${c.canalId}` : '/fulfillment/chats'} className="chip">
                        #{c.canal} · abrir chat
                      </Link>
                    ))}
                  </div>
                )}
                {t.meta && (
                  <div className="burbuja-meta">
                    {Math.round(t.meta.tokens / 1000)}k tokens · {(t.meta.ms / 1000).toFixed(1)} s
                    {t.meta.coincidencias ? ` · ${t.meta.coincidencias} mensajes encontrados` : ''}
                  </div>
                )}
              </div>
            ))}

            {pensando && (
              <div className="burbuja asistente pensando">
                <span className="pulso-dots"><i /><i /><i /></span> leyendo la cartera y los transcripts…
              </div>
            )}
            {error && <div className="burbuja error">{error}</div>}
            <div ref={finRef} />
          </div>

          <form
            className="chat-asistente-input"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Preguntale a ATV AI…"
              aria-label="Pregunta"
              disabled={pensando}
              autoFocus
            />
            <button type="submit" className="btn primary" disabled={pensando || !texto.trim()}>
              Enviar
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
