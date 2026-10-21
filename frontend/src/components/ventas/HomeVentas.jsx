import { useState } from 'react';
import { formatValue } from '../../lib/format.js';
import { segmentoGeneralDesdeBloque } from '../../data/mock/ventasDirector.js';
import { DetalleMetrica } from './BloqueClosing.jsx';

const PERIODOS = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
  { value: 'rango', label: 'Rango' },
];

const PERIODO_LABEL = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  anio: 'Este año',
  rango: 'Rango',
};

const corta = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '');

/** Valor real o guión cuando aún no hay fuente. */
function mostrar(value, format) {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return formatValue(value, format);
}

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
  const inicioMes = caja.desde || `${String(caja.mes || '').slice(0, 7)}-01`;
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
    { id: 'vence', label: 'Falta cobrar', value: caja.vence?.usd ?? 0, detalle: `${caja.vence?.cuotas ?? 0} cuotas`,
      fuente: { explicacion: 'Cuotas que vencen en el período y todavía no se pagaron, por lo que les falta.',
        secciones: [seccion('Cuotas', vence, 'venceAt')] } },
    { id: 'atrasado', label: 'Atrasado', value: caja.atrasado?.usd ?? 0, detalle: `${caja.atrasado?.cuotas ?? 0} cuotas`,
      fuente: { explicacion: 'Cuotas que vencieron antes del período y siguen sin pagarse.',
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
 * Lo que trajo cada closer en el período: el cash de las ventas que cerró (cierres y
 * señas), con cuántas fueron y su close rate. Una tarjeta por closer del equipo; lo que
 * no tiene closer cargado va en una tarjeta aparte en vez de repartirse.
 */
function Equipo({ porCloser, sinAsignar, onVer }) {
  const tarjetas = [...porCloser, ...(sinAsignar ? [{ nombre: 'Sin asignar', ...sinAsignar, sin: true }] : [])];
  if (!tarjetas.length) return null;
  const totalEquipo = tarjetas.reduce((n, c) => n + (c.cashUsd || 0), 0);
  const abrir = (c) => onVer({
    label: c.nombre,
    value: c.cashUsd,
    format: 'usd',
    detalle: `${c.cierres} cierres · ${c.senas} señas · ${c.agendados} agendas`,
    fuente: {
      explicacion: 'El cash de las ventas que cerró en el período, llamada por llamada.',
      secciones: [
        { titulo: 'Ventas (cierres y señas)', leads: c.ventasDetalle ?? [], columnas: ['estado', 'cash'] },
        { titulo: 'No shows', leads: c.noShowsDetalle ?? [], columnas: [] },
      ],
    },
  });
  return (
    <section className="home-ventas-seg">
      <div className="home-ventas-seg-head">
        <div><h3>Equipo</h3></div>
        <div className="home-ventas-seg-badge"><span>{formatValue(totalEquipo, 'usd')} entre todos</span></div>
      </div>
      <div className="home-ventas-equipo">
        {tarjetas.map((c) => (
          <article key={c.nombre} className={`home-ventas-persona clickable${c.sin ? ' sin' : ''}`}
            onClick={() => abrir(c)} role="button" tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && abrir(c)}>
            <header>
              <span className="home-ventas-persona-avatar" aria-hidden="true">{c.nombre.slice(0, 1)}</span>
              <b>{c.nombre}</b>
              {totalEquipo > 0 && <span className="dim num">{Math.round(((c.cashUsd || 0) / totalEquipo) * 100)}%</span>}
            </header>
            <div className="home-ventas-persona-cash num">{formatValue(c.cashUsd || 0, 'usd')}</div>
            <div className="home-ventas-persona-datos">
              <span><b className="num">{c.cierres}</b> cierres</span>
              <span><b className="num">{c.senas}</b> señas</span>
              <span><b className="num">{c.agendados}</b> agendas</span>
              <span><b className="num">{c.closeRate == null ? '--' : `${String(c.closeRate).replace('.', ',')}%`}</b> close rate</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * Home del Director de Ventas: cash, las métricas generales, Caja 1 y el equipo, para el
 * período, programa y closer elegidos.
 */
export default function HomeVentas({ data, caja, cajaError, cargando, filtros, onPeriodo, onRango, onPrograma, onCloser }) {
  const [abierta, setAbierta] = useState(null);   // la métrica cuyo detalle se está mirando
  const { periodo, rango, programa, closer, desde, hasta } = filtros;

  // El número grande es lo que entró a Caja 1, igual que en ATV Clients: ventas nuevas,
  // cuotas y señas. Con un closer elegido es el cash de sus llamadas, porque los pagos de
  // Clients no dicen quién vendió.
  const deCaja = !closer && caja?.entro?.usd != null;
  const cash = deCaja ? caja.entro.usd : (data.actual?.cashUsd ?? null);
  const general = segmentoGeneralDesdeBloque(data.actual);

  return (
    <div className={`home-ventas${cargando ? ' cargando' : ''}`}>
      <header className="home-ventas-top">
        <div className="home-ventas-hero">
          <div className="home-ventas-periodo-label">
            {PERIODO_LABEL[periodo] ?? 'Este mes'}{periodo !== 'mes' ? ` · ${corta(desde)}${hasta !== desde ? ` al ${corta(hasta)}` : ''}` : ''}
          </div>
          <div className="home-ventas-cash num">{mostrar(cash, 'usd')}</div>
          <div className="home-ventas-cash-sub">{deCaja ? 'Cash collected · Caja 1' : `Cash de las llamadas${closer ? ` de ${closer}` : ''}`}</div>
        </div>

        <div className="home-ventas-filters">
          <div className="home-ventas-periodos" role="tablist" aria-label="Periodo">
            {PERIODOS.map((p) => (
              <button key={p.value} type="button" role="tab" aria-selected={periodo === p.value}
                className={`home-ventas-periodo${periodo === p.value ? ' active' : ''}`}
                onClick={() => {
                  if (p.value === 'rango' && !rango.desde) onRango({ desde, hasta });
                  onPeriodo(p.value);
                }}>
                {p.label}
              </button>
            ))}
          </div>
          {periodo === 'rango' && (
            <div className="home-ventas-rango">
              <input type="date" value={rango.desde} max={rango.hasta || undefined} aria-label="Desde"
                onChange={(e) => onRango({ ...rango, desde: e.target.value })} />
              <span className="dim">al</span>
              <input type="date" value={rango.hasta} min={rango.desde || undefined} aria-label="Hasta"
                onChange={(e) => onRango({ ...rango, hasta: e.target.value })} />
            </div>
          )}
          <label className="home-ventas-select">
            <span>Programa</span>
            <select value={programa} onChange={(e) => onPrograma(e.target.value)}>
              <option value="">Todos</option>
              {(data.programas ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="home-ventas-select">
            <span>Closer</span>
            <select value={closer} onChange={(e) => onCloser(e.target.value)}>
              <option value="">Todos</option>
              {(data.closers ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </header>

      <div className="home-ventas-segmentos">
        <section className="home-ventas-seg">
          <div className="home-ventas-seg-head">
            <div><h3>{general.titulo}</h3></div>
            <div className="home-ventas-seg-badge"><span>{general.badge ?? '--'}</span></div>
          </div>
          <div className="home-ventas-metrics">
            {general.metricas.map((m) => (
              <Metrica key={m.id} m={m} valor={mostrar(m.value, m.format)} onVer={setAbierta} />
            ))}
          </div>
        </section>
        <CajaUno caja={caja} error={cajaError} onVer={setAbierta} />
        <Equipo porCloser={data.porCloser ?? []} sinAsignar={data.sinAsignar} onVer={setAbierta} />
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
