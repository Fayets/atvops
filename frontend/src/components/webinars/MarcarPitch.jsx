import { useEffect, useState } from 'react';
import Card from '../ui/Card.jsx';
import { actualizarWebinar } from '../../data/api.js';

/**
 * A qué minuto arrancó el pitch.
 *
 * Es el único dato del vivo que Zoom no puede saber: está en el guion, no en la
 * conexión. Y de él cuelgan las métricas que importan —cuánta gente llegó al pitch y
 * qué porcentaje del pico era—, así que tiene que poder marcarse rápido, sin ir a otra
 * pantalla a editar un formulario.
 *
 * Dos formas, porque son dos momentos distintos: "marcar ahora" mientras se está dando
 * el webinar —un clic y queda el minuto exacto—, o escribirlo después, que es lo que
 * pasa cuando el que conduce no tiene el tablero abierto.
 */
export default function MarcarPitch({ webinarId, minutoPitch, arranqueAt, enVivo, enElPitch, pico, onGuardado }) {
  const [valor, setValor] = useState(minutoPitch ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setValor(minutoPitch ?? ''); }, [minutoPitch]);

  // Cuántos minutos van del webinar, para el botón de marcar en el momento.
  const minutoActual = (() => {
    if (!arranqueAt) return null;
    const t = new Date(arranqueAt.endsWith('Z') ? arranqueAt : `${arranqueAt}Z`).getTime();
    return Math.max(0, Math.round((Date.now() - t) / 60000));
  })();

  const guardar = async (m) => {
    const n = Number(m);
    if (!Number.isFinite(n) || n < 0) { setError('Poné un número de minutos.'); return; }
    setGuardando(true);
    setError('');
    try {
      await actualizarWebinar(webinarId, { metricas: { minutoPitch: Math.round(n) } });
      onGuardado?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const pct = pico && enElPitch != null ? Math.round((enElPitch / pico) * 100) : null;

  return (
    <Card
      title="El minuto del pitch"
      sub="Lo único que Zoom no sabe: está en el guion, no en la conexión"
      foot="De este número cuelgan la retención al pitch y el booking rate. Se puede cambiar después: las métricas se recalculan solas."
    >
      <div className="pitch-marcar">
        <label>
          <span className="dim">Minuto desde que arrancó</span>
          <input
            type="number" min="0" inputMode="numeric"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="52"
          />
        </label>

        <button type="button" className="btn sm" disabled={guardando || valor === ''}
          onClick={() => guardar(valor)}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>

        {enVivo && minutoActual != null ? (
          <button type="button" className="btn sm ghost" disabled={guardando}
            onClick={() => { setValor(minutoActual); guardar(minutoActual); }}
            title="Deja marcado el minuto exacto en que tocás el botón">
            Marcar ahora · minuto {minutoActual}
          </button>
        ) : null}
      </div>

      {minutoPitch ? (
        <p className="pitch-resultado">
          {enElPitch == null
            ? `Marcado en el minuto ${minutoPitch}. Todavía no se llegó a ese momento.`
            : <>Al minuto {minutoPitch} había <strong>{enElPitch} personas</strong>
              {pct != null ? <> · {pct}% del pico</> : null}</>}
        </p>
      ) : (
        <p className="dim pitch-resultado">
          Sin este dato, la retención al pitch y el booking rate quedan en blanco. No se
          calculan contra un minuto inventado.
        </p>
      )}

      {error ? <p className="error">{error}</p> : null}
    </Card>
  );
}
