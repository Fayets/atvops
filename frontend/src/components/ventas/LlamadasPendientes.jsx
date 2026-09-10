import { useMemo, useState } from 'react';
import { formatValue } from '../../lib/format.js';
import { guardarResultadoLlamada } from '../../data/api.js';

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const dia = (iso) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Lo primero: ¿la llamada pasó o no? */
const QUE_PASO = [
  { id: 'vino', label: 'Se presentó', ayuda: 'La llamada se hizo' },
  { id: 'No show', label: 'No se presentó', ayuda: 'No apareció' },
  { id: 'Cancelada', label: 'La canceló', ayuda: 'Avisó que no venía' },
  { id: 'Re-agenda', label: 'La pasamos', ayuda: 'Quedó para otro día' },
];

/** Si se presentó: ¿en qué terminó? */
const COMO_TERMINO = [
  { id: 'compro', label: 'Compró', ayuda: 'Cerró el programa' },
  { id: 'Seguimiento', label: 'Lo está pensando', ayuda: 'Queda en seguimiento' },
  { id: 'Descalificado', label: 'No calificaba', ayuda: 'No es para nosotros' },
];

/** Si compró: pagó el programa entero o dejó una seña. */
const COMO_PAGO = [
  { id: 'Cerrado', label: 'Pagó todo', ayuda: 'No queda saldo' },
  { id: 'Seña', label: 'Dejó seña', ayuda: 'Paga el resto después' },
];

/**
 * Una llamada sin cargar. Se resuelve con dos preguntas simples y, si hubo venta,
 * el programa y la plata. Al guardar, la tarjeta desaparece.
 */
export function TarjetaPendiente({ llamada, programas, onGuardado }) {
  const [paso, setPaso] = useState('');
  const [final, setFinal] = useState('');
  const [programa, setPrograma] = useState('');
  const [comoPago, setComoPago] = useState('');
  const [cash, setCash] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const vino = paso === 'vino';
  const compro = vino && final === 'compro';
  const precio = programas.find((p) => p.nombre === programa)?.precioUsd ?? 0;
  const pagado = cash === '' ? 0 : Number(cash);
  const debe = Math.max(0, precio - pagado);
  const resultado = compro ? comoPago : (vino ? final : paso);
  const listo = Boolean(resultado) && (!compro || (programa && comoPago && cash !== ''));

  const elegirPaso = (id) => {
    setPaso(id);
    setFinal('');
    setPrograma('');
    setComoPago('');
    setCash('');
  };

  const elegirPrograma = (nombre) => {
    setPrograma(nombre);
    const p = programas.find((x) => x.nombre === nombre);
    if (comoPago === 'Cerrado' && p) setCash(String(p.precioUsd));
  };

  const elegirPago = (id) => {
    setComoPago(id);
    // Si pagó todo, el cash es el precio del programa; si dejó seña, lo carga a mano.
    setCash(id === 'Cerrado' && precio ? String(precio) : '');
  };

  const enviar = async (payload) => {
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await guardarResultadoLlamada(llamada.id, payload), llamada.id);
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  /** Llamadas internas, duplicadas o cargadas por error: quedan fuera de las métricas. */
  const descartar = () => enviar({ resultado: 'Descartada', programa: '', cashUsd: 0, saldoUsd: 0, nota });

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      onGuardado(
        await guardarResultadoLlamada(llamada.id, {
          resultado,
          programa: compro ? programa : '',
          cashUsd: compro ? pagado : 0,
          saldoUsd: compro ? debe : 0,
          nota,
        }),
        llamada.id,
      );
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <article className={`pendiente-card${guardando ? ' guardando' : ''}`}>
      <header className="pendiente-card-cab">
        <h3>{llamada.prospecto}</h3>
        <div className="dim">
          {dia(llamada.fechaAt)} · {hora(llamada.fechaAt)}
          {llamada.diasDesde > 0 ? ` · hace ${llamada.diasDesde} ${llamada.diasDesde === 1 ? 'día' : 'días'}` : ''}
        </div>
        {llamada.facturaHoy && <div className="dim">Facturaba {llamada.facturaHoy}</div>}
      </header>

      <div className="pendiente-paso">
        <div className="pendiente-pregunta">¿Qué pasó con la llamada?</div>
        <div className="pendiente-opciones">
          {QUE_PASO.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`opcion${paso === o.id ? ' elegida' : ''}`}
              onClick={() => elegirPaso(o.id)}
            >
              <span className="opcion-label">{o.label}</span>
              <span className="opcion-ayuda">{o.ayuda}</span>
            </button>
          ))}
        </div>
      </div>

      {vino && (
        <div className="pendiente-paso">
          <div className="pendiente-pregunta">¿En qué terminó?</div>
          <div className="pendiente-opciones">
            {COMO_TERMINO.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`opcion${final === o.id ? ' elegida' : ''}`}
                onClick={() => setFinal(o.id)}
              >
                <span className="opcion-label">{o.label}</span>
                <span className="opcion-ayuda">{o.ayuda}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {compro && (
        <div className="pendiente-paso">
          <div className="pendiente-pregunta">¿Qué compró y cuánto dejó?</div>
          <label className="campo">
            <span>Programa</span>
            <select value={programa} onChange={(e) => elegirPrograma(e.target.value)}>
              <option value="">Elegí el programa</option>
              {programas.map((p) => (
                <option key={p.id} value={p.nombre}>{p.nombre} · {formatValue(p.precioUsd, 'usd')}</option>
              ))}
            </select>
          </label>
          <div className="pendiente-opciones">
            {COMO_PAGO.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`opcion${comoPago === o.id ? ' elegida' : ''}`}
                onClick={() => elegirPago(o.id)}
              >
                <span className="opcion-label">{o.label}</span>
                <span className="opcion-ayuda">{o.ayuda}</span>
              </button>
            ))}
          </div>

          {comoPago && (
            <label className="campo">
              <span>{comoPago === 'Seña' ? 'Cuánto dejó de seña' : 'Cuánto pagó'}</span>
              <input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
            </label>
          )}

          {precio > 0 && comoPago && (
            <div className="pendiente-cuenta">
              Facturación {formatValue(precio, 'usd')}
              {debe > 0 ? ` · queda debiendo ${formatValue(debe, 'usd')}` : ' · sin saldo'}
            </div>
          )}
        </div>
      )}

      <label className="campo">
        <span>Nota (opcional)</span>
        <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Objeción, próximo paso, lo que quieras recordar" />
      </label>

      {error && <div className="pendiente-error">{error}</div>}

      <button className="btn primary pendiente-guardar" onClick={guardar} disabled={guardando || !listo}>
        {guardando ? 'Guardando…' : 'Guardar y seguir'}
      </button>

      <button type="button" className="pendiente-descartar" onClick={descartar} disabled={guardando}>
        Esta llamada no corresponde
      </button>
    </article>
  );
}

/** Grilla de llamadas sin cargar. Cada una desaparece al completarla. */
export default function LlamadasPendientes({ pendientes, programas, onGuardado }) {
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
        <TarjetaPendiente key={l.id} llamada={l} programas={programas} onGuardado={marcar} />
      ))}
    </div>
  );
}
