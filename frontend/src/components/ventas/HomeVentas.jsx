import { useMemo, useState } from 'react';
import { formatValue } from '../../lib/format.js';
import { DetalleMetrica } from './BloqueClosing.jsx';

const PERIODO_LABEL = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  anio: 'Este año',
  rango: 'Rango',
};

/** Valor real o guión cuando aún no hay fuente. */
function mostrar(value, format) {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return formatValue(value, format);
}

/**
 * Caja 1 del mes: lo que entró de ventas y de qué. La cuota 1 de una venta es la venta
 * nueva; de la 2 en adelante, cuotas de ventas anteriores; la seña va aparte. Lo que vence
 * y lo atrasado es lo que todavía falta cobrar.
 */
/** Una métrica que se abre: muestra de dónde sale el número. */
function Metrica({ m, valor, onVer }) {
  const abre = Boolean(m.fuente);
  return (
    <article
      className={`home-ventas-metric${abre ? ' clickable' : ''}`}
      onClick={abre ? () => onVer(m) : undefined}
      role={abre ? 'button' : undefined}
      tabIndex={abre ? 0 : undefined}
      onKeyDown={abre ? (e) => (e.key === 'Enter' || e.key === ' ') && onVer(m) : undefined}
    >
      <div className="home-ventas-metric-label">{m.label}</div>
      <div className="home-ventas-metric-value num">{valor}</div>
      {m.detalle && <div className="home-ventas-metric-detalle">{m.detalle}</div>}
    </article>
  );
}

function CajaUno({ caja, error, onVer }) {
  if (error) {
    return (
      <section className="home-ventas-seg">
        <div className="home-ventas-seg-head"><div><h3>Caja 1</h3></div></div>
        <p className="dim" style={{ margin: 0 }}>{error.message}</p>
      </section>
    );
  }
  if (!caja) return null;
  const filas = caja.entro?.filas ?? [];
  const suma = (xs) => xs.reduce((n, x) => n + (x.montoUsd || 0), 0);
  // Venta nueva es el primer pago de la cuota 1. La cuota 1 a veces se paga en partes, y el
  // resto es cobranza de una venta ya hecha: Laura Graseller pagó 1.400 de su cuota 1 el
  // 17-09 (venta de septiembre) y los otros 1.000 el 07-10 (Franco, 21-10-2026).
  const inicioMes = `${String(caja.mes || '').slice(0, 7)}-01`;
  const esNueva = (x) => x.tipo === 'cuota_venta' && Number(x.cuota) === 1
    && (x.primerPago ?? (!x.venceAt || x.venceAt >= inicioMes));
  const nuevas = filas.filter(esNueva);
  const cuotas = filas.filter((x) => x.tipo === 'cuota_venta' && !esNueva(x));
  const senas = filas.filter((x) => x.tipo === 'sena');
  const clientes = (xs) => new Set(xs.map((x) => x.cliente)).size;
  const total = caja.entro?.usd ?? suma(filas);
  const pct = (v) => (total ? ` · ${Math.round((v / total) * 100)}%` : '');
  // Los pagos con la forma de la lista de detalle: fecha, cliente, responsable, qué fue y monto.
  const NOMBRES = { nombre: 'Cliente', closer: 'Responsable', estado: 'Qué fue', cash: 'Monto' };
  const comoFila = (x, i, fechaDe) => ({
    id: `${x.cliente}-${x[fechaDe] ?? ''}-${x.cuota ?? ''}-${i}`, nombre: x.cliente, fecha: x[fechaDe],
    closer: x.responsable, pagoUsd: x.montoUsd,
    estado: x.tipo === 'sena' ? 'Seña'
      : `Cuota ${x.cuota ?? ''}${Number(x.cuota) === 1 && x.primerPago === false ? ' · resto' : ''}`,
  });
  const seccion = (titulo, xs, fechaDe = 'pagoAt') => ({
    titulo, nota: formatValue(suma(xs), 'usd'), nombres: { ...NOMBRES, fecha: fechaDe === 'pagoAt' ? 'Pagó' : 'Vence' },
    columnas: ['estado', 'cash'], leads: xs.map((x, i) => comoFila(x, i, fechaDe)),
  });
  const vence = caja.vence?.filas ?? [];
  const atrasado = caja.atrasado?.filas ?? [];
  const metricas = [
    { id: 'total', label: 'Cash total', value: total, detalle: `${filas.length} pagos`,
      fuente: { explicacion: 'Cada pago del mes imputado a una venta nueva o a una seña.',
        secciones: [seccion('Ventas nuevas', nuevas), seccion('Cuotas de ventas', cuotas), seccion('Señas', senas)] } },
    { id: 'nuevas', label: 'Ventas nuevas', value: suma(nuevas), detalle: `${clientes(nuevas)} ventas${pct(suma(nuevas))}`,
      fuente: { explicacion: 'El primer pago de la cuota 1 de cada venta.', secciones: [seccion('Pagos', nuevas)] } },
    { id: 'cuotas', label: 'Cuotas de ventas', value: suma(cuotas), detalle: `${cuotas.length} cuotas${pct(suma(cuotas))}`,
      fuente: { explicacion: 'Cuotas de ventas ya hechas, incluido el resto de una cuota 1 pagada en partes.', secciones: [seccion('Pagos', cuotas)] } },
    { id: 'senas', label: 'Señas', value: suma(senas), detalle: `${clientes(senas)} señas${pct(suma(senas))}`,
      fuente: { explicacion: 'Lo que entró como seña de una venta a medio hacer.', secciones: [seccion('Pagos', senas)] } },
    { id: 'vence', label: 'Falta cobrar del mes', value: caja.vence?.usd ?? 0, detalle: `${caja.vence?.cuotas ?? 0} cuotas`,
      fuente: { explicacion: 'Cuotas que vencen este mes y todavía no se pagaron, por lo que les falta.',
        secciones: [seccion('Cuotas', vence, 'venceAt')] } },
    { id: 'atrasado', label: 'Atrasado', value: caja.atrasado?.usd ?? 0, detalle: `${caja.atrasado?.cuotas ?? 0} cuotas`,
      fuente: { explicacion: 'Cuotas de meses anteriores que siguen sin pagarse.',
        secciones: [seccion('Cuotas', atrasado, 'venceAt')] } },
  ];
  return (
    <section className="home-ventas-seg">
      <div className="home-ventas-seg-head">
        <div><h3>Caja 1</h3></div>
        <div className="home-ventas-seg-badge"><span>{formatValue(total, 'usd')} entró</span></div>
      </div>
      <div className="home-ventas-metrics">
        {metricas.map((m) => (
          <Metrica key={m.id} m={m} valor={mostrar(m.value, 'usd')} onVer={(x) => onVer({ ...x, format: 'usd' })} />
        ))}
      </div>
    </section>
  );
}

/**
 * Home del Director de Ventas: cash, las métricas generales y Caja 1.
 * @param {{ data: object, caja?: object, cajaError?: Error }} props
 */
export default function HomeVentas({ data, caja, cajaError }) {
  const [periodo, setPeriodo] = useState('mes');
  const [programa, setPrograma] = useState('todos');
  const [closer, setCloser] = useState('todos');
  const [abierta, setAbierta] = useState(null);   // la métrica cuyo detalle se está mirando

  const filtros = data.filtros;
  const segmentos = useMemo(() => {
    const porPeriodo = data.segmentosPorPeriodo?.[periodo] ?? null;
    if (!porPeriodo) return data.segmentosVacios ?? [];
    // Programa: no hay corte por oferta en el CRM todavía → se mantiene UI.
    void programa;
    if (closer !== 'todos' && data.segmentosPorCloser?.[closer]) {
      return data.segmentosPorCloser[closer];
    }
    return porPeriodo;
  }, [data, periodo, programa, closer]);

  // El número grande es lo que entró a Caja 1, igual que en ATV Clients: ventas nuevas,
  // cuotas y señas. El cash de las llamadas (cierres y señas cargados por el closer) es más
  // chico porque no cuenta las cuotas de ventas anteriores; queda para un closer elegido,
  // porque los pagos de Clients no dicen quién vendió.
  const deCaja = periodo === 'mes' && closer === 'todos' && caja?.entro?.usd != null;
  const cash = useMemo(() => {
    if (periodo !== 'mes') return null;
    if (closer !== 'todos') {
      const c = data.cashPorCloser?.[closer];
      return c === undefined ? null : c;
    }
    return caja?.entro?.usd ?? data.cashPorPeriodo?.mes ?? null;
  }, [data, periodo, closer, caja]);

  return (
    <div className="home-ventas">
      <header className="home-ventas-top">
        <div className="home-ventas-hero">
          <div className="home-ventas-periodo-label">{PERIODO_LABEL[periodo] ?? 'Este mes'}</div>
          <div className="home-ventas-cash num">{mostrar(cash, 'usd')}</div>
          <div className="home-ventas-cash-sub">{deCaja ? 'Cash collected · Caja 1' : `Cash de las llamadas${closer !== 'todos' ? ` de ${closer}` : ''}`}</div>
        </div>

        <div className="home-ventas-filters">
          <div className="home-ventas-periodos" role="tablist" aria-label="Periodo">
            {filtros.periodos.map((p) => (
              <button
                key={p.value}
                type="button"
                role="tab"
                aria-selected={periodo === p.value}
                className={`home-ventas-periodo${periodo === p.value ? ' active' : ''}`}
                onClick={() => setPeriodo(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="home-ventas-select">
            <span>Programa</span>
            <select value={programa} onChange={(e) => setPrograma(e.target.value)}>
              {filtros.programas.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="home-ventas-select">
            <span>Closer</span>
            <select value={closer} onChange={(e) => setCloser(e.target.value)}>
              {filtros.closers.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="home-ventas-segmentos">
        {/* Calificadas / descalificadas no tienen fuente: se sacaron (Franco, 21-10-2026). */}
        {segmentos.filter((seg) => !['calificadas', 'descalificadas'].includes(seg.id)).map((seg) => (
          <section key={seg.id} className="home-ventas-seg">
            <div className="home-ventas-seg-head">
              <div>
                <h3>{seg.titulo}</h3>
                {seg.subtitulo && <div className="home-ventas-seg-sub">{seg.subtitulo}</div>}
              </div>
              <div className="home-ventas-seg-badge">
                <span>{seg.badge ?? '--'}</span>
                {seg.badgeExtra != null && <span className="extra">{seg.badgeExtra}</span>}
              </div>
            </div>
            <div className="home-ventas-metrics">
              {seg.metricas.map((m) => (
                <Metrica key={m.id} m={m} valor={mostrar(m.value, m.format)} onVer={setAbierta} />
              ))}
            </div>
          </section>
        ))}
        <CajaUno caja={caja} error={cajaError} onVer={setAbierta} />
      </div>
      {abierta && (
        <DetalleMetrica
          titulo={abierta.label}
          explicacion={abierta.fuente.explicacion}
          valor={mostrar(abierta.value, abierta.format)}
          pie={abierta.detalle}
          secciones={abierta.fuente.secciones}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  );
}
