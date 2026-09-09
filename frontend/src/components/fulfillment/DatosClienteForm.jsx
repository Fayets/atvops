import { useState } from 'react';
import { guardarDatosCliente } from '../../data/api.js';

const STAGES = [
  { value: '', label: '—' },
  { value: 'pre_lanzamiento', label: 'Pre-lanzamiento' },
  { value: 'lanzando', label: 'Lanzando' },
  { value: 'escalando', label: 'Escalando' },
];

const vacio = {
  objetivo: '', objetivoMontoUsd: '', objetivoPlazoDias: '',
  nicho: '', ticketPromedioUsd: '', stage: '',
  nombreCompleto: '', email: '', whatsapp: '', pais: '', zonaHoraria: '', linkedin: '',
  notas: '',
};

/**
 * Lo que el sistema no puede deducir del canal: objetivo, ICP, contacto y la gente
 * del equipo del cliente. El contrato y los pagos viven en ATV Clients.
 */
export default function DatosClienteForm({ clienteId, datos, onGuardado, onCerrar }) {
  const [form, setForm] = useState({ ...vacio, ...Object.fromEntries(Object.entries(datos ?? {}).map(([k, v]) => [k, v ?? ''])) });
  const [equipo, setEquipo] = useState(datos?.equipo?.length ? datos.equipo : [{ nombre: '', rol: '', contacto: '' }]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setMiembro = (i, k) => (e) => setEquipo((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const payload = { ...form, equipo: equipo.filter((m) => m.nombre.trim()) };
      onGuardado(await guardarDatosCliente(clienteId, payload));
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const campo = (k, label, extra = {}) => (
    <label className="campo">
      <span>{label}</span>
      <input value={form[k] ?? ''} onChange={set(k)} {...extra} />
    </label>
  );

  return (
    <div className="datos-form">
      <div className="datos-grupo">
        <div className="eyebrow">Objetivo</div>
        <div className="datos-grid">
          {campo('objetivo', 'Objetivo', { placeholder: '50k USD en 90 días' })}
          {campo('objetivoMontoUsd', 'Monto (USD)', { type: 'number', inputMode: 'decimal' })}
          {campo('objetivoPlazoDias', 'Plazo (días)', { type: 'number' })}
        </div>
      </div>

      <div className="datos-grupo">
        <div className="eyebrow">A quién le vende</div>
        <div className="datos-grid">
          {campo('nicho', 'Nicho / industria')}
          {campo('ticketPromedioUsd', 'Ticket promedio (USD)', { type: 'number', inputMode: 'decimal' })}
          <label className="campo">
            <span>Stage</span>
            <select value={form.stage ?? ''} onChange={set('stage')}>
              {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="datos-grupo">
        <div className="eyebrow">Contacto</div>
        <div className="datos-grid">
          {campo('nombreCompleto', 'Nombre completo')}
          {campo('email', 'Email', { type: 'email' })}
          {campo('whatsapp', 'WhatsApp')}
          {campo('pais', 'País')}
          {campo('zonaHoraria', 'Zona horaria', { placeholder: 'GMT-3' })}
          {campo('linkedin', 'LinkedIn')}
        </div>
      </div>

      <div className="datos-grupo">
        <div className="eyebrow">Su equipo (setters, closers, editores)</div>
        {equipo.map((m, i) => (
          <div key={i} className="datos-grid datos-equipo">
            <label className="campo"><span>Nombre</span><input value={m.nombre} onChange={setMiembro(i, 'nombre')} /></label>
            <label className="campo"><span>Rol</span><input value={m.rol} onChange={setMiembro(i, 'rol')} placeholder="setter" /></label>
            <label className="campo"><span>Contacto</span><input value={m.contacto} onChange={setMiembro(i, 'contacto')} /></label>
          </div>
        ))}
        <button className="btn" onClick={() => setEquipo((xs) => [...xs, { nombre: '', rol: '', contacto: '' }])}>Agregar persona</button>
      </div>

      <label className="campo">
        <span>Notas</span>
        <textarea value={form.notas ?? ''} onChange={set('notas')} rows={3} />
      </label>

      {error && <div className="ronda-evento error">{error}</div>}

      <div className="update-acciones">
        <span className="dim">El contrato y los pagos se cargan en ATV Clients, no acá.</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar datos'}</button>
        </div>
      </div>
    </div>
  );
}
