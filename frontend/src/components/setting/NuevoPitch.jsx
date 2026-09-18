import { useState } from 'react';

/** El alta de un pitch: a quién le mandaste el link y por dónde. */
export default function NuevoPitch({ hoy, onCrear, onCerrar }) {
  const [f, setF] = useState({
    prospecto: '', pitchAt: hoy, canal: 'dm', origen: 'organico', pitchEstado: 'pendiente',
    llamadaAt: '', usuarioIg: '', email: '', telefono: '',
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await onCrear({ ...f, llamadaAt: f.llamadaAt || null });
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <form className="modal-card nuevo-pitch" onClick={(e) => e.stopPropagation()} onSubmit={enviar}
        role="dialog" aria-label="Nuevo pitch">
        <header><h3>Nuevo pitch</h3><button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button></header>
        <label>Prospecto<input value={f.prospecto} onChange={set('prospecto')} placeholder="Nombre, mail o usuario" autoFocus required /></label>
        <div className="dos">
          <label>Fecha del pitch<input type="date" value={f.pitchAt} onChange={set('pitchAt')} required /></label>
          <label>Estado<select value={f.pitchEstado} onChange={set('pitchEstado')}>
            <option value="pendiente">Sin responder</option><option value="booked">Booked</option>
            <option value="ghosted">Ghosted</option><option value="denied">Dijo que no</option>
          </select></label>
        </div>
        <div className="dos">
          <label>Canal<select value={f.canal} onChange={set('canal')}>
            <option value="dm">100% por DM</option><option value="phone">100% por llamada</option>
            <option value="hibrido">Híbrido</option>
          </select></label>
          <label>Origen<select value={f.origen} onChange={set('origen')}>
            <option value="organico">Orgánico</option><option value="ads">Ads</option>
          </select></label>
        </div>
        {f.pitchEstado === 'booked' && (
          <label>Llamada agendada para<input type="date" value={f.llamadaAt} onChange={set('llamadaAt')} /></label>
        )}
        <div className="tres">
          <label>Instagram<input value={f.usuarioIg} onChange={set('usuarioIg')} placeholder="usuario" /></label>
          <label>Email<input value={f.email} onChange={set('email')} /></label>
          <label>Teléfono<input value={f.telefono} onChange={set('telefono')} /></label>
        </div>
        <footer>
          <button type="submit" className="btn primary" disabled={guardando || !f.prospecto.trim()}>
            {guardando ? 'Guardando…' : 'Agregar'}
          </button>
        </footer>
      </form>
    </div>
  );
}
