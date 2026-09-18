import { useState } from 'react';
import { CANAL, LLAMADA_ESTADO, ORIGEN, PITCH_ESTADO, fechaCorta } from '../../lib/setting.js';

/** Un contador con flechas: reprogramaciones, follow-ups, llamadas. */
function Contador({ letra, titulo, valor, onCambiar }) {
  return (
    <span className="cnt" title={titulo}>
      <span className="cnt-letra">{letra}</span>
      <span className="cnt-num num">{valor}</span>
      <span className="cnt-flechas">
        <button type="button" onClick={() => onCambiar(valor + 1)} aria-label={`${titulo}: sumar`}>▲</button>
        <button type="button" onClick={() => onCambiar(Math.max(0, valor - 1))} aria-label={`${titulo}: restar`}>▼</button>
      </span>
    </span>
  );
}

/** Un grupo de botones donde uno solo está prendido. */
function Toggle({ valor, opciones, onCambiar, className = '', etiqueta }) {
  return (
    <span className={`toggle ${className}`} role="group" aria-label={etiqueta}>
      {Object.entries(opciones).map(([k, label]) => (
        <button key={k} type="button" className={valor === k ? 'activo' : ''}
          onClick={() => valor !== k && onCambiar(k)} aria-pressed={valor === k}>
          {label}
        </button>
      ))}
    </span>
  );
}

/** Las tres fechas del ciclo, como las muestra el trackeo diario. */
function Fechas({ p }) {
  return (
    <span className="pitch-hitos">
      <span><b>pitched on</b> {fechaCorta(p.pitchAt)}</span>
      <span><b>booked on</b> {p.agendoAt ? fechaCorta(p.agendoAt) : '—'}</span>
      <span><b>booked for</b> {p.fechaLlamada ? fechaCorta(p.fechaLlamada) : '—'}</span>
    </span>
  );
}

/**
 * Un pitch con todo lo que se le puede cambiar sin salir de la fila: el canal, los
 * contadores, el estado y el origen. Es como se carga en SetSystem, y es lo que hace que
 * el setter no tenga que abrir un formulario por cada movimiento.
 *
 * @param {{ p: object, modo: 'call'|'pitch', onCambiar: (id, patch) => void, onBorrar?: (id) => void }} props
 */
export default function FilaPitch({ p, modo = 'call', onCambiar, onBorrar }) {
  const [abierto, setAbierto] = useState(false);
  const cambiar = (patch) => onCambiar(p.id, patch);
  const estado = p.llamadaEstado || 'scheduled';
  const pill = p.pitchEstado === 'booked' ? LLAMADA_ESTADO[estado] : PITCH_ESTADO[p.pitchEstado];
  const contacto = [p.usuarioIg && `@${p.usuarioIg}`, p.email, p.telefono].filter(Boolean).join(' · ');

  return (
    <div className={`pitch-fila${p.vencida ? ' vencida' : ''}`}>
      <div className="pitch-linea">
        <button type="button" className="pitch-nombre" onClick={() => setAbierto((v) => !v)} title="Ver y editar los datos">
          {p.prospecto}
        </button>
        {modo === 'pitch' && <Fechas p={p} />}
        <span className="pitch-controles">
          <Toggle valor={p.canal} opciones={CANAL} onCambiar={(canal) => cambiar({ canal })} etiqueta="Canal" />
          <Contador letra="R" titulo="Reprogramaciones" valor={p.reprogramaciones}
            onCambiar={(reprogramaciones) => cambiar({ reprogramaciones })} />
          <Contador letra="F" titulo="Follow-ups" valor={p.seguimientos}
            onCambiar={(seguimientos) => cambiar({ seguimientos })} />
          <Contador letra="C" titulo="Llamadas hechas" valor={p.llamadas}
            onCambiar={(llamadas) => cambiar({ llamadas })} />
        </span>
        <span className="pitch-estado">
          <span className={`pill-estado tono-${pill?.tone ?? 'off'}`}>
            <select value={p.pitchEstado === 'booked' ? estado : p.pitchEstado}
              onChange={(e) => {
                const v = e.target.value;
                cambiar(v in PITCH_ESTADO ? { pitchEstado: v } : { llamadaEstado: v });
              }}
              aria-label={`Estado de ${p.prospecto}`}>
              <optgroup label="El pitch">
                {Object.entries(PITCH_ESTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </optgroup>
              <optgroup label="La llamada">
                {Object.entries(LLAMADA_ESTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </optgroup>
            </select>
          </span>
          <Toggle valor={p.origen} opciones={ORIGEN} onCambiar={(origen) => cambiar({ origen })}
            className="origen" etiqueta="Origen" />
        </span>
      </div>

      {abierto && (
        <div className="pitch-detalle">
          <label>Prospecto<input defaultValue={p.prospecto} onBlur={(e) => e.target.value.trim() && e.target.value !== p.prospecto && cambiar({ prospecto: e.target.value })} /></label>
          <label>Pitch<input type="date" value={p.pitchAt} onChange={(e) => e.target.value && cambiar({ pitchAt: e.target.value })} /></label>
          <label>Agendó<input type="date" value={p.agendoAt || ''} onChange={(e) => cambiar({ agendoAt: e.target.value || null })} /></label>
          <label>Llamada<input type="date" value={p.llamadaAt || ''} onChange={(e) => cambiar({ llamadaAt: e.target.value || null })} /></label>
          <label>Reprogramada<input type="date" value={p.reprogramadaAt || ''} onChange={(e) => cambiar({ reprogramadaAt: e.target.value || null })} /></label>
          <label>Cierre<input type="date" value={p.cierreAt || ''} onChange={(e) => cambiar({ cierreAt: e.target.value || null })} /></label>
          <label>Revenue USD<input type="number" min="0" defaultValue={p.valorUsd || ''} onBlur={(e) => Number(e.target.value || 0) !== p.valorUsd && cambiar({ valorUsd: Number(e.target.value || 0) })} /></label>
          <label>Cobrado USD<input type="number" min="0" defaultValue={p.cashUsd || ''} onBlur={(e) => Number(e.target.value || 0) !== p.cashUsd && cambiar({ cashUsd: Number(e.target.value || 0) })} /></label>
          <label>Instagram<input defaultValue={p.usuarioIg || ''} placeholder="usuario" onBlur={(e) => (e.target.value.trim() || null) !== (p.usuarioIg || null) && cambiar({ usuarioIg: e.target.value })} /></label>
          <label>Email<input defaultValue={p.email || ''} onBlur={(e) => (e.target.value.trim() || null) !== (p.email || null) && cambiar({ email: e.target.value })} /></label>
          <label>Teléfono<input defaultValue={p.telefono || ''} onBlur={(e) => (e.target.value.trim() || null) !== (p.telefono || null) && cambiar({ telefono: e.target.value })} /></label>
          <label className="ancho">Nota<input defaultValue={p.nota || ''} onBlur={(e) => (e.target.value.trim() || null) !== (p.nota || null) && cambiar({ nota: e.target.value })} /></label>
          <div className="pitch-detalle-pie">
            <span className="dim">{contacto || 'Sin datos de contacto'}</span>
            {onBorrar && (
              <button type="button" className="btn sm alerta" onClick={() => window.confirm(`¿Borrar el pitch de ${p.prospecto}?`) && onBorrar(p.id)}>
                Borrar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
