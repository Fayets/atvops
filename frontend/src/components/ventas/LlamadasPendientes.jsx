import { useMemo, useState } from 'react';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';
import { guardarResultadoLlamada } from '../../data/api.js';

const VENTA = ['Cerrado', 'Seña'];
const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const dia = (iso) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Una llamada pendiente como tarjeta: se carga el resultado ahí mismo y desaparece.
 */
export function TarjetaPendiente({ llamada, programas, estados, onGuardado }) {
  const [resultado, setResultado] = useState('');
  const [programa, setPrograma] = useState('');
  const [cash, setCash] = useState('');
  const [saldo, setSaldo] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const esVenta = VENTA.includes(resultado);
  const precio = programas.find((p) => p.nombre === programa)?.precioUsd ?? 0;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const nuevo = await guardarResultadoLlamada(llamada.id, {
        resultado,
        programa,
        cashUsd: cash === '' ? 0 : Number(cash),
        saldoUsd: saldo === '' ? 0 : Number(saldo),
        nota,
      });
      onGuardado(nuevo, llamada.id);
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <div className={`pendiente-card${guardando ? ' guardando' : ''}`}>
      <div className="pendiente-card-cab">
        <div>
          <div className="strong">{llamada.prospecto}</div>
          <div className="dim">{dia(llamada.fechaAt)} · {hora(llamada.fechaAt)}</div>
        </div>
        <Pill tone={llamada.diasDesde > 2 ? 'alert' : 'warn'}>
          {llamada.diasDesde === 0 ? 'hoy' : `hace ${llamada.diasDesde} d`}
        </Pill>
      </div>

      {llamada.facturaHoy && <div className="dim" style={{ fontSize: 12 }}>Factura {llamada.facturaHoy}</div>}

      <div className="pendiente-card-estados">
        {estados.map((e) => (
          <button
            key={e}
            type="button"
            className={`btn sm${resultado === e ? ' primary' : ''}`}
            onClick={() => setResultado(e)}
          >
            {e}
          </button>
        ))}
      </div>

      {esVenta && (
        <div className="pendiente-card-venta">
          <select value={programa} onChange={(e) => setPrograma(e.target.value)} aria-label="Programa">
            <option value="">Programa…</option>
            {programas.map((p) => (
              <option key={p.id} value={p.nombre}>{p.nombre} · {formatValue(p.precioUsd, 'usd')}</option>
            ))}
          </select>
          <input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="Cash USD" aria-label="Cash cobrado" />
          <input type="number" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="Debe USD" aria-label="Saldo" />
          {precio > 0 && <div className="dim" style={{ gridColumn: '1 / -1', fontSize: 11.5 }}>Facturación {formatValue(precio, 'usd')}</div>}
        </div>
      )}

      <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota" />

      {error && <div className="ronda-evento error" style={{ fontSize: 12 }}>{error}</div>}

      <button className="btn primary" onClick={guardar} disabled={guardando || !resultado || (esVenta && !programa)}>
        {guardando ? 'Guardando…' : 'Listo'}
      </button>
    </div>
  );
}

/** Grilla de llamadas pendientes. Cada una desaparece al cargarla. */
export default function LlamadasPendientes({ pendientes, programas, estados, onGuardado }) {
  const [hechas, setHechas] = useState(() => new Set());
  const visibles = useMemo(() => pendientes.filter((l) => !hechas.has(l.id)), [pendientes, hechas]);

  const marcar = (nuevo, id) => {
    setHechas((prev) => new Set(prev).add(id));
    onGuardado?.(nuevo, id);
  };

  if (visibles.length === 0) return null;

  return (
    <div className="pendientes-cards">
      {visibles.map((l) => (
        <TarjetaPendiente key={l.id} llamada={l} programas={programas} estados={estados} onGuardado={marcar} />
      ))}
    </div>
  );
}
