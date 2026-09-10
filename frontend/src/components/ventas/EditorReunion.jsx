import { useState } from 'react';
import { FormResultado } from './ListaLlamadas.jsx';
import { descartarLlamada } from '../../data/api.js';

const fecha = (iso) =>
  new Date(iso).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * Cargar o corregir el resultado de una reunión sin salir del calendario.
 * Es el mismo formulario de la lista de llamadas, así el closer no aprende dos cosas.
 * @param {{ reunion: object, estado: object, programas: object[], estados: string[],
 *           onGuardado: () => void, onCerrar: () => void, mes?: string }} props
 */
export default function EditorReunion({ reunion, estado, programas, estados, onGuardado, onCerrar, mes }) {
  const [borrando, setBorrando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState(null);

  const borrar = async () => {
    setBorrando(true);
    setError(null);
    try {
      await descartarLlamada(estado.id, { mes, lista: false });
      onGuardado();
      onCerrar();
    } catch (e) {
      setError(e.message);
      setBorrando(false);
      setConfirmar(false);
    }
  };

  const llamada = {
    id: estado.id,
    prospecto: estado.prospecto || reunion.prospecto,
    resultado: estado.resultado,
    programa: estado.programa,
    cashUsd: estado.cashUsd,
    saldoUsd: estado.saldoUsd,
    reporte: estado.reporte,
    eventoId: estado.eventoId || reunion.id,
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCerrar}>
      <div className="modal-card editor-reunion" onClick={(e) => e.stopPropagation()}>
        <header className="modal-cab">
          <div>
            <h3>{llamada.prospecto}</h3>
            <div className="dim">
              {fecha(estado.fechaAt || reunion.fechaAt)}
              {estado.segunda ? ' · segunda reunión' : ''}
              {estado.closer ? ` · ${estado.closer}` : ''}
            </div>
          </div>
          <span className="editor-reunion-acciones">
            {confirmar ? (
              <>
                <span className="dim">{error || '¿La borro?'}</span>
                <button className="btn sm alerta" onClick={borrar} disabled={borrando}>
                  {borrando ? 'Borrando…' : 'Sí'}
                </button>
                <button className="btn sm" onClick={() => setConfirmar(false)} disabled={borrando}>No</button>
              </>
            ) : (
              <button className="btn sm ghost" onClick={() => setConfirmar(true)} title="Sacarla de la lista y de las métricas">
                Borrar
              </button>
            )}
            <button className="btn sm ghost" onClick={onCerrar} aria-label="Cerrar">✕</button>
          </span>
        </header>
        {estado.estado === 'sin_crm' && (
          <div className="dim editor-reunion-aviso">
            Esta reunión todavía no está en el CRM. Se crea al guardar el resultado.
          </div>
        )}
        <FormResultado
          llamada={llamada}
          programas={programas}
          estados={estados}
          onGuardado={() => { onGuardado(); onCerrar(); }}
          onCerrar={onCerrar}
          mes={mes}
          sinLista
        />
      </div>
    </div>
  );
}
