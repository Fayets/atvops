import { useState } from 'react';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';
import { guardarResultadoLlamada } from '../../data/api.js';

const VENTA = ['Cerrado', 'Seña'];
const TONO = {
  cierre: 'ok', show: 'plain', no_show: 'alert', sin_reportar: 'warn', agendado: 'off',
};
const LABEL = {
  cierre: 'venta', show: 'reportada', no_show: 'no show', sin_reportar: 'falta cargar', agendado: 'agendada',
};

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const dia = (iso) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Formulario de una llamada: qué pasó, qué compró y cuánto dejó. */
function FormResultado({ llamada, programas, estados, onGuardado, onCerrar }) {
  const [resultado, setResultado] = useState(llamada.resultado || '');
  const [programa, setPrograma] = useState(llamada.programa || '');
  const [cash, setCash] = useState(llamada.cashUsd || '');
  const [saldo, setSaldo] = useState(llamada.saldoUsd || '');
  const [nota, setNota] = useState(llamada.reporte || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const esVenta = VENTA.includes(resultado);
  const precio = programas.find((p) => p.nombre === programa)?.precioUsd ?? 0;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await guardarResultadoLlamada(llamada.id, {
        resultado, programa, cashUsd: cash === '' ? 0 : Number(cash), saldoUsd: saldo === '' ? 0 : Number(saldo), nota,
      }));
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <div className="llamada-form">
      <div className="llamada-estados">
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
        <div className="llamada-venta">
          <label className="campo">
            <span>Programa</span>
            <select value={programa} onChange={(e) => setPrograma(e.target.value)}>
              <option value="">Elegí uno</option>
              {programas.map((p) => (
                <option key={p.id} value={p.nombre}>{p.nombre} · {formatValue(p.precioUsd, 'usd')}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Cash cobrado (USD)</span>
            <input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
          </label>
          <label className="campo">
            <span>Queda debiendo (USD)</span>
            <input type="number" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0" />
          </label>
          {precio > 0 && (
            <div className="llamada-precio dim">
              Facturación {formatValue(precio, 'usd')}
              {cash !== '' && saldo !== '' && Number(cash) + Number(saldo) !== precio
                ? ` · cargaste ${formatValue(Number(cash) + Number(saldo), 'usd')}`
                : ''}
            </div>
          )}
        </div>
      )}

      <label className="campo">
        <span>Nota de la llamada</span>
        <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué pasó, objeción, próximo paso" />
      </label>

      {error && <div className="ronda-evento error">{error}</div>}

      <div className="llamada-acciones">
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn primary" onClick={guardar} disabled={guardando || !resultado}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function Llamada({ llamada, programas, estados, abierta, onAbrir, onCerrar, onGuardado }) {
  return (
    <div className={`llamada${abierta ? ' abierta' : ''}`}>
      <div className="llamada-cab">
        <div className="llamada-cuando num">
          <div>{hora(llamada.fechaAt)}</div>
          <div className="dim">{dia(llamada.fechaAt)}</div>
        </div>
        <div className="llamada-quien">
          <div className="strong">{llamada.prospecto}</div>
          <div className="dim">
            {[llamada.facturaHoy && `factura ${llamada.facturaHoy}`, llamada.origen, llamada.setter && `set por ${llamada.setter}`]
              .filter(Boolean).join(' · ') || 'Sin datos del formulario'}
          </div>
          {llamada.estado === 'cierre' && (
            <div className="llamada-venta-resumen">
              {llamada.programa || 'Sin programa'} · cash {formatValue(llamada.cashUsd, 'usd')}
              {llamada.saldoUsd > 0 ? ` · debe ${formatValue(llamada.saldoUsd, 'usd')}` : ''}
              {llamada.facturacionUsd > 0 ? ` · factura ${formatValue(llamada.facturacionUsd, 'usd')}` : ''}
            </div>
          )}
        </div>
        <div className="llamada-derecha">
          <Pill tone={TONO[llamada.estado] ?? 'plain'} dot>{LABEL[llamada.estado] ?? llamada.estado}</Pill>
          <button className="btn sm" onClick={abierta ? onCerrar : onAbrir}>
            {abierta ? 'Cerrar' : (!llamada.resultado || llamada.estado === 'sin_reportar') ? 'Cargar' : 'Editar'}
          </button>
        </div>
      </div>
      {abierta && (
        <FormResultado
          llamada={llamada}
          programas={programas}
          estados={estados}
          onGuardado={onGuardado}
          onCerrar={onCerrar}
        />
      )}
    </div>
  );
}


/** Lista de llamadas con su resultado, editable fila por fila. */
export default function ListaLlamadas({ llamadas, programas, estados, onActualizado }) {
  const [abierta, setAbierta] = useState(null);
  if (!llamadas.length) return <div className="empty">No hay llamadas para mostrar.</div>;
  return (
    <div className="llamadas">
      {llamadas.map((l) => (
        <Llamada
          key={l.id}
          llamada={l}
          programas={programas}
          estados={estados}
          abierta={abierta === l.id}
          onAbrir={() => setAbierta(l.id)}
          onCerrar={() => setAbierta(null)}
          onGuardado={(nuevo) => { setAbierta(null); onActualizado(nuevo); }}
        />
      ))}
    </div>
  );
}
