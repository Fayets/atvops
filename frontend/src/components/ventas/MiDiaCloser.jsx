import { useMemo, useState } from 'react';
import Card from '../ui/Card.jsx';
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

/** Mi día: las llamadas del closer y la carga del resultado. */
export default function MiDiaCloser({ data, onActualizado }) {
  const [abierta, setAbierta] = useState(null);
  const { llamadas = [], programas = [], estados = [], mes = {} } = data ?? {};

  const grupos = useMemo(() => {
    const ahora = new Date();
    const hoyIso = ahora.toISOString().slice(0, 10);
    const pendientes = llamadas.filter((l) => l.estado === 'sin_reportar');
    const hoy = llamadas.filter((l) => l.fechaAt.slice(0, 10) === hoyIso && l.estado !== 'sin_reportar');
    const proximas = llamadas.filter((l) => new Date(l.fechaAt) > ahora && l.fechaAt.slice(0, 10) !== hoyIso);
    const hechas = llamadas.filter(
      (l) => !pendientes.includes(l) && !hoy.includes(l) && !proximas.includes(l),
    );
    return { pendientes, hoy, proximas: proximas.sort((a, b) => a.fechaAt.localeCompare(b.fechaAt)), hechas };
  }, [llamadas]);

  const props = (l) => ({
    key: l.id,
    llamada: l,
    programas,
    estados,
    abierta: abierta === l.id,
    onAbrir: () => setAbierta(l.id),
    onCerrar: () => setAbierta(null),
    onGuardado: (nuevo) => { setAbierta(null); onActualizado(nuevo); },
  });

  return (
    <div className="mi-dia">
      <div className="kpi-grid">
        <article className="kpi sm">
          <div className="kpi-label">Cash cobrado</div>
          <div className="kpi-value-row"><span className="kpi-value num">{formatValue(mes.cashUsd ?? 0, 'usd')}</span></div>
          <div className="kpi-nota">este mes{mes.saldoUsd ? ` · ${formatValue(mes.saldoUsd, 'usd')} por cobrar` : ''}</div>
        </article>
        <article className="kpi sm">
          <div className="kpi-label">Facturación</div>
          <div className="kpi-value-row"><span className="kpi-value num">{formatValue(mes.facturacionUsd ?? 0, 'usd')}</span></div>
          <div className="kpi-nota">precio de los programas vendidos</div>
        </article>
        <article className="kpi sm">
          <div className="kpi-label">Ventas</div>
          <div className="kpi-value-row"><span className="kpi-value num">{mes.cierres ?? 0}</span></div>
          <div className="kpi-nota">{mes.shows ?? 0} shows sobre {mes.agendadas ?? 0} agendadas</div>
        </article>
        <article className="kpi sm">
          <div className="kpi-label">Sin cargar</div>
          <div className="kpi-value-row">
            <span className="kpi-value num" style={{ color: mes.sinReportar ? 'var(--brand-hi)' : 'var(--ok)' }}>{mes.sinReportar ?? 0}</span>
          </div>
          <div className="kpi-nota">este mes</div>
        </article>
      </div>

      {grupos.pendientes.length > 0 && (
        <Card title="Falta cargar el resultado" sub={`${grupos.pendientes.length} llamadas de los últimos 30 días sin resultado`} flush>
          <div className="llamadas">{grupos.pendientes.map((l) => <Llamada {...props(l)} />)}</div>
        </Card>
      )}

      <Card title="Hoy" sub={grupos.hoy.length ? `${grupos.hoy.length} llamadas` : 'Sin llamadas hoy'} flush>
        <div className="llamadas">
          {grupos.hoy.map((l) => <Llamada {...props(l)} />)}
          {grupos.hoy.length === 0 && <div className="empty">Nada agendado para hoy.</div>}
        </div>
      </Card>

      {grupos.proximas.length > 0 && (
        <Card title="Lo que viene" sub={`${grupos.proximas.length} llamadas agendadas`} flush>
          <div className="llamadas">{grupos.proximas.map((l) => <Llamada {...props(l)} />)}</div>
        </Card>
      )}

      {grupos.hechas.length > 0 && (
        <Card title="Ya cargadas" sub="Últimos 30 días" flush>
          <div className="llamadas">{grupos.hechas.slice(0, 30).map((l) => <Llamada {...props(l)} />)}</div>
        </Card>
      )}
    </div>
  );
}
