import { useEffect, useState } from 'react';
import { guardarReporteDia } from '../../data/api.js';

/**
 * El reporte de un día: los números que carga la persona y una nota.
 * Se usa igual en el panel del calendario personal y en el modal de Mis reportes.
 */
export default function FormReporteDia({ dia, campos, rol = 'setter', onGuardado, onCancelar }) {
  const [valores, setValores] = useState(() =>
    Object.fromEntries(campos.map((c) => [c.id, dia.valores?.[c.id] || ''])),
  );
  const [nota, setNota] = useState(dia.nota ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setValores(Object.fromEntries(campos.map((c) => [c.id, dia.valores?.[c.id] || ''])));
    setNota(dia.nota ?? '');
    setError(null);
  }, [dia, campos]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await guardarReporteDia(dia.fecha, { ...valores, nota }, rol));
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="reporte-form">
      <div className="reporte-campos">
        {campos.map((c) => (
          <label key={c.id} className="campo">
            <span>{c.label}</span>
            <input
              type="number"
              inputMode="numeric"
              value={valores[c.id]}
              onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
              placeholder="0"
            />
          </label>
        ))}
      </div>

      <label className="campo">
        <span>Cómo estuvo el día (opcional)</span>
        <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué funcionó, qué no" />
      </label>

      {error && <div className="pendiente-error">{error}</div>}

      <div className="reporte-acciones">
        {onCancelar && <button className="btn" onClick={onCancelar}>Cancelar</button>}
        <button className="btn primary" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar el día'}
        </button>
      </div>
    </div>
  );
}
