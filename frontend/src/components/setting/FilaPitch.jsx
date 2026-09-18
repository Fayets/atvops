import { useState } from 'react';
import Pill from '../ui/Pill.jsx';
import { CANAL, LLAMADA_ESTADO, ORIGEN, PITCH_ESTADO, fechaCorta } from '../../lib/setting.js';

/** Un contador con flechas: reprogramaciones, seguimientos, llamadas. */
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
function Toggle({ valor, opciones, onCambiar, className = '' }) {
  return (
    <span className={`toggle ${className}`}>
      {Object.entries(opciones).map(([k, label]) => (
        <button key={k} type="button" className={valor === k ? 'activo' : ''} onClick={() => valor !== k && onCambiar(k)}>
          {label}
        </button>
      ))}
    </span>
  );
}

/**
 * Un pitch con sus controles en línea, como en el calendario de calls de SetSystem:
 * canal, contadores R/F/C, estado de la llamada, origen.
 *
 * @param {{ p: object, modo: 'call'|'pitch', onCambiar: (id, patch) => void, onBorrar?: (id) => void }} props
 */
export default function FilaPitch({ p, modo = 'call', onCambiar, onBorrar }) {
  const [abierto, setAbierto] = useState(false);
  const cambiar = (patch) => onCambiar(p.id, patch);
  const estadoLlamada = p.llamadaEstado || 'scheduled';
  const contacto = [p.usuarioIg && `@${p.usuarioIg}`, p.email, p.telefono].filter(Boolean).join(' · ');

  return (
    <div className={`pitch-fila${p.sinResolver ? ' sin-resolver' : ''}`}>
      <div className="pitch-cab">
        <button type="button" className="pitch-nombre" onClick={() => setAbierto((v) => !v)} title="Editar datos">
          <span className="strong">{p.prospecto}</span>
          {p.sinResolver && <Pill tone="alert" dot>sin resolver</Pill>}
          {p.porOcurrir && <Pill tone="info">por ocurrir</Pill>}
        </button>
        <span className="dim pitch-fechas num">
          {modo === 'call'
            ? <>call {fechaCorta(p.fechaLlamada)}{p.reprogramadaAt && ' (repro)'} · pitch {fechaCorta(p.pitchAt)}</>
            : <>pitched {fechaCorta(p.pitchAt)}{p.agendoAt && <> · booked {fechaCorta(p.agendoAt)}</>}{p.fechaLlamada && <> · for {fechaCorta(p.fechaLlamada)}</>}</>}
        </span>
      </div>
      <div className="pitch-controles">
        <Toggle valor={p.canal} opciones={CANAL} onCambiar={(canal) => cambiar({ canal })} />
        <Contador letra="R" titulo="Reprogramaciones" valor={p.reprogramaciones}
          onCambiar={(reprogramaciones) => cambiar({ reprogramaciones })} />
        <Contador letra="F" titulo="Seguimientos (follow-ups)" valor={p.seguimientos}
          onCambiar={(seguimientos) => cambiar({ seguimientos })} />
        <Contador letra="C" titulo="Llamadas hechas" valor={p.llamadas}
          onCambiar={(llamadas) => cambiar({ llamadas })} />
        {modo === 'pitch' && (
          <select className="sel-estado" value={p.pitchEstado} onChange={(e) => cambiar({ pitchEstado: e.target.value })}
            aria-label="Estado del pitch">
            {Object.entries(PITCH_ESTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        )}
        {(modo === 'call' || p.pitchEstado === 'booked') && (
          <select className={`sel-estado tono-${LLAMADA_ESTADO[estadoLlamada]?.tone}`} value={estadoLlamada}
            onChange={(e) => cambiar({ llamadaEstado: e.target.value })} aria-label="Resultado de la llamada">
            {Object.entries(LLAMADA_ESTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        )}
        <Toggle valor={p.origen} opciones={ORIGEN} onCambiar={(origen) => cambiar({ origen })} className="origen" />
      </div>
      {abierto && (
        <div className="pitch-detalle">
          <label>Prospecto<input defaultValue={p.prospecto} onBlur={(e) => e.target.value.trim() && e.target.value !== p.prospecto && cambiar({ prospecto: e.target.value })} /></label>
          <label>Pitch<input type="date" value={p.pitchAt} onChange={(e) => e.target.value && cambiar({ pitchAt: e.target.value })} /></label>
          <label>Agendó<input type="date" value={p.agendoAt || ''} onChange={(e) => cambiar({ agendoAt: e.target.value || null })} /></label>
          <label>Llamada<input type="date" value={p.llamadaAt || ''} onChange={(e) => cambiar({ llamadaAt: e.target.value || null })} /></label>
          <label>Reprogramada<input type="date" value={p.reprogramadaAt || ''} onChange={(e) => cambiar({ reprogramadaAt: e.target.value || null })} /></label>
          <label>Cierre<input type="date" value={p.cierreAt || ''} onChange={(e) => cambiar({ cierreAt: e.target.value || null })} /></label>
          <label>Valor USD<input type="number" min="0" defaultValue={p.valorUsd || ''} onBlur={(e) => Number(e.target.value || 0) !== p.valorUsd && cambiar({ valorUsd: Number(e.target.value || 0) })} /></label>
          <label>Cash USD<input type="number" min="0" defaultValue={p.cashUsd || ''} onBlur={(e) => Number(e.target.value || 0) !== p.cashUsd && cambiar({ cashUsd: Number(e.target.value || 0) })} /></label>
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
