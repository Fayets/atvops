import { useEffect, useState } from 'react';
import { getEstadoReuniones, ocultarReunion } from '../../data/api.js';
import { formatFecha } from '../../lib/format.js';

/**
 * Las reuniones que alguien sacó del calendario, para poder devolverlas.
 *
 * Vive en el pie del sidebar y no en el calendario porque es algo que se toca una vez
 * cada tanto: ahí abajo no molesta y se encuentra igual. Trae TODAS, no solo las del
 * rango que esté cargado en pantalla — una ocultada por error hace tres meses era
 * imposible de encontrar si había que adivinar en qué semana estaba.
 */
export default function ReunionesOcultas({ onCerrar }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  const [devolviendo, setDevolviendo] = useState(null);

  const cargar = () => {
    getEstadoReuniones({})
      .then((d) => {
        const ocultos = d?.ocultos ?? {};
        setFilas(Object.entries(ocultos)
          .map(([id, datos]) => ({
            id,
            prospecto: datos?.prospecto || 'Sin nombre',
            fechaAt: datos?.inicioAt || null,
          }))
          .sort((a, b) => (b.fechaAt ?? '').localeCompare(a.fechaAt ?? '')));
      })
      .catch(setError);
  };

  useEffect(cargar, []);

  async function devolver(fila) {
    setDevolviendo(fila.id);
    setError(null);
    try {
      await ocultarReunion(fila.id, { mostrar: true });
      // Se saca de la lista acá en vez de recargar: el panel queda abierto y se pueden
      // devolver varias seguidas sin tener que volver a entrar cada vez.
      setFilas((f) => f.filter((x) => x.id !== fila.id));
    } catch (e) {
      setError(e);
    } finally {
      setDevolviendo(null);
    }
  }

  return (
    <div className="ocultas-modal" role="dialog" aria-label="Reuniones ocultas">
      <div className="ocultas-caja">
        <header>
          <div>
            <h3>Reuniones ocultas</h3>
            <span className="dim">No cuentan en ninguna métrica.</span>
          </div>
          <button type="button" className="btn sm ghost" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </header>

        {error && <div className="ronda-evento error">{error.message}</div>}

        {filas === null ? (
          <div className="empty">Buscando…</div>
        ) : filas.length === 0 ? (
          <div className="empty">No hay ninguna reunión oculta.</div>
        ) : (
          <div className="ocultas-lista">
            {filas.map((f) => (
              <div key={f.id} className="ocultas-fila">
                <span className="ocultas-nombre">{f.prospecto}</span>
                <span className="dim">{f.fechaAt ? formatFecha(f.fechaAt) : 'sin fecha'}</span>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => devolver(f)}
                  disabled={devolviendo === f.id}
                >
                  {devolviendo === f.id ? '…' : 'Devolver'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
