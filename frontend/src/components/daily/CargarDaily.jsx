import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { DIAS } from '../../lib/daily.js';
import { cargarTareasDaily, importarDaily } from '../../data/api.js';

/**
 * Cargar la semana desde el documento del domingo.
 *
 * Mucha gente ya la escribe afuera —un Google Doc, muchas veces hecho con Claude— y
 * después la copiaba día por día. Acá se pega el link o el texto, se ve el reparto y se
 * carga de una. Lo que quede mal se corrige en la daily como cualquier otra tarea.
 */

const TIPOS = [['velocidad', 'Velocidad'], ['desplazamiento', 'Desplazamiento']];

export default function CargarDaily({ semana, onCargado }) {
  const [abierto, setAbierto] = useState(false);
  const [fuente, setFuente] = useState('');
  const [propuesta, setPropuesta] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);

  const esLink = /^https?:\/\//i.test(fuente.trim());

  function cerrar() {
    setAbierto(false);
    setFuente('');
    setPropuesta(null);
    setError(null);
  }

  async function leer(e) {
    e.preventDefault();
    setTrabajando(true);
    setError(null);
    try {
      const r = await importarDaily(esLink ? { url: fuente.trim() } : { texto: fuente });
      setPropuesta(r.tareas.map((t, i) => ({ ...t, id: i })));
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  }

  async function cargar() {
    setTrabajando(true);
    setError(null);
    try {
      const r = await cargarTareasDaily(semana, propuesta.map(({ texto, tipo, dia }) => ({ texto, tipo, dia })));
      onCargado(r.semana, r.cargadas);
      cerrar();
    } catch (err) {
      setError(err.message);
      setTrabajando(false);
    }
  }

  const cambiar = (id, campo, valor) => setPropuesta((p) => p.map((t) => (t.id === id ? { ...t, [campo]: valor } : t)));
  const quitar = (id) => setPropuesta((p) => p.filter((t) => t.id !== id));

  // Las sueltas van al final: son los objetivos de la semana, no las de un día.
  const grupos = [...DIAS.map((_, i) => i), null]
    .map((dia) => ({ dia, tareas: (propuesta ?? []).filter((t) => t.dia === dia) }))
    .filter((g) => g.tareas.length);

  return (
    <>
      <button type="button" className="btn" onClick={() => setAbierto(true)}>Cargar daily</button>

      <Modal open={abierto} onClose={cerrar} title="Cargar la semana desde tu documento" wide className="dl-importar">
        {!propuesta ? (
          <form onSubmit={leer}>
            <label className="campo">
              <span>Link del Google Doc, o pegá el texto</span>
              <textarea
                id="dl-fuente"
                rows={6}
                value={fuente}
                onChange={(e) => setFuente(e.target.value)}
                placeholder="https://docs.google.com/document/d/…"
              />
            </label>
            {error && <div className="ronda-evento error">{error}</div>}
            <div className="llamada-acciones">
              <button type="button" className="btn" onClick={cerrar}>Cancelar</button>
              <button type="submit" className="btn primary" disabled={trabajando || !fuente.trim()}>
                {trabajando ? 'Leyendo…' : 'Leer el documento'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="dl-imp-cab">
              <b>{propuesta.length} {propuesta.length === 1 ? 'tarea' : 'tareas'}</b>
              <button type="button" className="btn sm ghost" onClick={() => setPropuesta(null)}>Cambiar el documento</button>
            </div>
            {grupos.map((g) => (
              <section key={g.dia ?? 'semana'} className="dl-imp-dia">
                <h4>{g.dia === null ? 'Abiertas en la semana' : DIAS[g.dia]}</h4>
                {g.tareas.map((t) => (
                  <div className="dl-imp-fila" key={t.id}>
                    <input value={t.texto} onChange={(e) => cambiar(t.id, 'texto', e.target.value)}
                      aria-label="Tarea" />
                    <select value={t.dia ?? ''} onChange={(e) => cambiar(t.id, 'dia', e.target.value === '' ? null : Number(e.target.value))}
                      aria-label="Día">
                      {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      <option value="">En la semana</option>
                    </select>
                    <select value={t.tipo} onChange={(e) => cambiar(t.id, 'tipo', e.target.value)} aria-label="Tipo">
                      {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button type="button" className="dl-x" onClick={() => quitar(t.id)}
                      aria-label={`Quitar ${t.texto}`} title="Quitar">✕</button>
                  </div>
                ))}
              </section>
            ))}
            {error && <div className="ronda-evento error">{error}</div>}
            <div className="llamada-acciones">
              <button type="button" className="btn" onClick={cerrar}>Cancelar</button>
              <button type="button" className="btn primary" onClick={cargar} disabled={trabajando || !propuesta.length}>
                {trabajando ? 'Cargando…' : `Cargar ${propuesta.length}`}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
