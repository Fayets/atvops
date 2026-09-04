import { useEffect, useState } from 'react';
import { formatFecha } from '../../lib/format.js';
import { useIdeas } from '../../lib/useIdeas.jsx';
import Icon from '../ui/Icon.jsx';

const ESTADO_TONO = { idea: 'var(--text-3)', tarea: 'var(--warn)', hecha: 'var(--ok)' };

/**
 * Lluvia de ideas con conversión a tarea: de acá salen las tareas de Ale o
 * Franco. `limite` recorta la lista en la home; la página muestra todo.
 * @param {{ limite?: number }} props
 */
export default function IdeasBloque({ limite }) {
  const { ideas, loading, agregar, asignar, marcar, editar, borrar } = useIdeas();
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [editandoId, setEditandoId] = useState(/** @type {number | null} */ (null));
  const [editTexto, setEditTexto] = useState('');
  const [aBorrar, setABorrar] = useState(/** @type {{ id: number, texto: string } | null} */ (null));
  const visibles = limite ? ideas.filter((i) => i.estado !== 'hecha').slice(0, limite) : ideas;

  const correr = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!aBorrar) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setABorrar(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aBorrar]);

  const empezarEdicion = (idea) => {
    setEditandoId(idea.id);
    setEditTexto(idea.texto);
  };

  const guardarEdicion = () => {
    if (editandoId == null) return;
    const id = editandoId;
    const valor = editTexto;
    setEditandoId(null);
    correr(() => editar(id, valor));
  };

  const confirmarBorrado = () => {
    if (!aBorrar) return;
    const id = aBorrar.id;
    setABorrar(null);
    correr(() => borrar(id));
  };

  return (
    <div className="ideas">
      <form
        className="ideas-form"
        onSubmit={(e) => {
          e.preventDefault();
          const valor = texto;
          setTexto('');
          correr(() => agregar(valor));
        }}
      >
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Tirá una idea…"
          aria-label="Nueva idea"
          disabled={busy}
        />
        <button type="submit" className="btn primary" disabled={!texto.trim() || busy}>
          <Icon name="mas" size={13} />
        </button>
      </form>

      <ul className="ideas-lista">
        {loading && !ideas.length ? (
          <li className="empty">Cargando ideas…</li>
        ) : (
          visibles.map((i) => (
            <li key={i.id} className={`idea ${i.estado}`}>
              <button
                className="idea-check"
                style={{ borderColor: ESTADO_TONO[i.estado], color: ESTADO_TONO[i.estado] }}
                title={i.estado === 'hecha' ? 'Volver a pendiente' : 'Marcar hecha'}
                disabled={busy || editandoId === i.id}
                onClick={() =>
                  correr(() =>
                    marcar(i.id, i.estado === 'hecha' ? (i.asignada ? 'tarea' : 'idea') : 'hecha'),
                  )
                }
              >
                {i.estado === 'hecha' ? '✓' : ''}
              </button>
              <div className="idea-cuerpo">
                {editandoId === i.id ? (
                  <form
                    className="idea-edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      guardarEdicion();
                    }}
                  >
                    <input
                      type="text"
                      value={editTexto}
                      onChange={(e) => setEditTexto(e.target.value)}
                      aria-label="Editar idea"
                      autoFocus
                      disabled={busy}
                    />
                    <button type="submit" className="btn primary" disabled={!editTexto.trim() || busy}>
                      Guardar
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => setEditandoId(null)}
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="idea-texto">{i.texto}</div>
                    <div className="idea-meta">
                      {i.quien} · {formatFecha(i.fechaAt)}
                      {i.estado === 'tarea' && <span style={{ color: 'var(--warn)' }}> · tarea</span>}
                    </div>
                  </>
                )}
              </div>
              <div className="idea-acciones">
                {editandoId !== i.id && (
                  <>
                    <button
                      type="button"
                      className="idea-icon-btn"
                      title="Editar"
                      disabled={busy}
                      onClick={() => empezarEdicion(i)}
                    >
                      <Icon name="editar" size={13} />
                    </button>
                    <button
                      type="button"
                      className="idea-icon-btn danger"
                      title="Eliminar"
                      disabled={busy}
                      onClick={() => setABorrar({ id: i.id, texto: i.texto })}
                    >
                      <Icon name="borrar" size={13} />
                    </button>
                  </>
                )}
                <div className="idea-asignar">
                  {['Ale', 'Franco'].map((p) => (
                    <button
                      key={p}
                      className={`tab${i.asignada === p ? ' active' : ''}`}
                      disabled={busy || editandoId === i.id}
                      onClick={() => correr(() => asignar(i.id, i.asignada === p ? null : p))}
                      title={i.asignada === p ? `Quitar a ${p}` : `Asignar a ${p}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))
        )}
        {!loading && !visibles.length && <li className="empty">Sin ideas pendientes.</li>}
      </ul>

      {aBorrar && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setABorrar(null)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="idea-borrar-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="idea-borrar-titulo">¿Estás seguro que deseas eliminar?</h3>
            <p className="modal-desc">
              Se va a borrar permanentemente:
              <br />
              <strong>“{aBorrar.texto}”</strong>
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => setABorrar(null)}>
                Cancelar
              </button>
              <button type="button" className="btn primary" disabled={busy} onClick={confirmarBorrado}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
