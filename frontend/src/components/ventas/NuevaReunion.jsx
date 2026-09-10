import { useState } from 'react';
import { crearLlamada } from '../../data/api.js';

const VENTA = ['Cerrado', 'Seña'];
const ORIGENES = ['Referido', 'Orgánico', 'Ads', 'Chat', 'Outbound'];

const ahoraLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return { dia: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:00` };
};

/**
 * Cargar una reunión que nunca pasó por el calendario: un referido, una que se armó por
 * chat. Entra al sistema como cualquier otra y cuenta en las métricas del mes.
 * @param {{ programas: object[], estados: string[], onCreada: () => void, onCerrar: () => void }} props
 */
export default function NuevaReunion({ programas, estados, onCreada, onCerrar }) {
  const inicial = ahoraLocal();
  const [prospecto, setProspecto] = useState('');
  const [dia, setDia] = useState(inicial.dia);
  const [hora, setHora] = useState(inicial.hora);
  const [origen, setOrigen] = useState('Referido');
  const [resultado, setResultado] = useState('');
  const [programa, setPrograma] = useState('');
  const [cash, setCash] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const esVenta = VENTA.includes(resultado);
  const listo = prospecto.trim() && dia && hora && (!esVenta || programa);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await crearLlamada({
        prospecto: prospecto.trim(),
        fechaAt: `${dia}T${hora}:00`,
        origen,
        resultado,
        programa: esVenta ? programa : '',
        cashUsd: esVenta && cash !== '' ? Number(cash) : 0,
        nota: nota.trim(),
      });
      onCreada();
      onCerrar();
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCerrar}>
      <div className="modal-card editor-reunion" onClick={(e) => e.stopPropagation()}>
        <header className="modal-cab">
          <div>
            <h3>Agregar una reunión</h3>
            <div className="dim">Para las que no pasaron por el calendario: un referido, una que se armó por chat.</div>
          </div>
          <button className="btn sm ghost" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </header>

        <div className="llamada-form">
          <label className="campo">
            <span>Prospecto</span>
            <input value={prospecto} onChange={(e) => setProspecto(e.target.value)} placeholder="Nombre y apellido" autoFocus />
          </label>

          <div className="llamada-venta">
            <label className="campo">
              <span>Día</span>
              <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            </label>
            <label className="campo">
              <span>Hora</span>
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </label>
            <label className="campo">
              <span>De dónde salió</span>
              <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
                {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>

          <div>
            <span className="campo-titulo">Cómo salió (si ya pasó)</span>
            <div className="llamada-estados">
              {estados.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`btn sm estado-chip${resultado === e ? ' elegido plain' : ''}`}
                  onClick={() => setResultado(resultado === e ? '' : e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {esVenta && (
            <div className="llamada-venta">
              <label className="campo">
                <span>Programa</span>
                <select value={programa} onChange={(e) => setPrograma(e.target.value)}>
                  <option value="">Elegí uno</option>
                  {programas.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>Cash cobrado (USD)</span>
                <input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
              </label>
            </div>
          )}

          <label className="campo">
            <span>Nota</span>
            <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="De dónde vino, qué pasó" />
          </label>

          {error && <div className="ronda-evento error">{error}</div>}

          <div className="llamada-acciones">
            <button className="btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
            <button className="btn primary" onClick={guardar} disabled={guardando || !listo}>
              {guardando ? 'Guardando…' : 'Agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
