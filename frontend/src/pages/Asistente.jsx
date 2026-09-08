import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader.jsx';
import { preguntarAsistente } from '../data/api.js';
import { useLocalState } from '../lib/hooks.js';
import { useRol } from '../lib/RolContext.jsx';

const SUGERENCIAS = [
  '¿Qué clientes llevan más de 7 días sin escribir?',
  '¿Cómo se calcula el score de salud?',
  '¿Cómo funciona la vista Activación?',
  '¿Quién está pidiendo devolución o quiere irse?',
  'Resumime la última semana de un cliente (decime el nombre)',
];

/**
 * Chat del equipo sobre la cartera, los transcripts y el propio sistema.
 * El historial es de cada usuario y vive en su navegador.
 */
export default function Asistente() {
  const { user } = useRol();
  const clave = `atv-ops:asistente:${user?.username ?? 'anon'}`;
  const [turnos, setTurnos] = useLocalState(clave, []);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState(null);
  const finRef = useRef(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turnos.length, pensando]);

  const enviar = async (pregunta) => {
    const p = (pregunta ?? texto).trim();
    if (!p || pensando) return;
    setTexto('');
    setError(null);
    const historial = turnos.slice(-8).map((t) => ({ rol: t.rol, texto: t.texto }));
    setTurnos((prev) => [...prev, { id: Date.now(), rol: 'usuario', texto: p, at: new Date().toISOString() }]);
    setPensando(true);
    try {
      const r = await preguntarAsistente(p, historial);
      setTurnos((prev) => [
        ...prev,
        { id: Date.now() + 1, rol: 'asistente', texto: r.respuesta, citas: r.citas, meta: { modelo: r.modelo, tokens: r.tokens_entrada + r.tokens_salida, ms: r.duracion_ms, coincidencias: r.coincidencias }, at: new Date().toISOString() },
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="page asistente-page">
      <PageHeader
        eyebrow="Fulfillment"
        title="Asistente"
        desc="Preguntale por un cliente, por lo que se dijo en un canal, o por cómo funciona cualquier vista. Lee la cartera, los transcripts y el manual del sistema antes de responder."
        actions={
          turnos.length > 0 && (
            <button className="btn" onClick={() => setTurnos([])}>
              Limpiar
            </button>
          )
        }
      />

      <div className="chat-asistente">
        <div className="chat-asistente-scroll">
          {turnos.length === 0 && (
            <div className="asistente-vacio">
              <div className="eyebrow" style={{ marginBottom: 10 }}>Para empezar</div>
              <div className="sugerencias">
                {SUGERENCIAS.map((s) => (
                  <button key={s} className="chip sugerencia" onClick={() => enviar(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turnos.map((t) => (
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
                  {t.meta.modelo} · {Math.round(t.meta.tokens / 1000)}k tokens · {(t.meta.ms / 1000).toFixed(1)} s
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
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Preguntá algo sobre un cliente, un canal o una vista…"
            aria-label="Pregunta"
            disabled={pensando}
            autoFocus
          />
          <button type="submit" className="btn primary" disabled={pensando || !texto.trim()}>
            Preguntar
          </button>
        </form>
      </div>
    </div>
  );
}
