import { useState } from 'react';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { getCajaUno } from '../data/api.js';
import { formatValue } from '../lib/format.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

/**
 * Caja 1: la plata de las ventas nuevas, que es la que cierra el closer.
 *
 * Cuatro números y nada más: lo que entró, lo que vence este mes y todavía no entró, lo
 * que venció antes y sigue sin pagarse, y la suma de los dos últimos. Un mes que cobró
 * todo y uno que cobró la mitad y arrastra el resto suman parecido y no son lo mismo; la
 * diferencia entre los dos es el trabajo que hay por delante.
 *
 * Las cuotas detrás de cada número no están a la vista: se abren tocando el número. Con
 * tres tablas abiertas la pantalla era una lista larga que había que recorrer entera
 * para encontrar el dato; así, primero se lee el estado y recién después, si hace falta,
 * quién debe qué.
 */

const usd = (n) => formatValue(n || 0, 'usd');
const fecha = (iso) => (iso
  ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  : '—');

function Lista({ filas, campo, vacio, tono }) {
  if (!filas?.length) return <p className="dim" style={{ margin: 0 }}>{vacio}</p>;
  return (
    <div className="pv-bloque caja1-tabla">
      <table>
        <thead>
          <tr>
            <th>{campo === 'pagoAt' ? 'Pagó' : 'Vence'}</th>
            <th>Cliente</th><th className="c">Cuota</th>
            <th>Responsable</th><th className="der">Monto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={`${f.cliente}-${f[campo]}-${i}`}>
              <td className="num">{fecha(f[campo])}</td>
              <td className="nom">{f.cliente}</td>
              <td className="c num">{f.cuota ?? '—'}</td>
              <td>{f.responsable || '—'}</td>
              <td className={`der num${tono ? ` ${tono}` : ''}`}>{usd(f.montoUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Un número que se puede abrir. Mismo gesto que los KPIs del closer y del reporte. */
function Kpi({ label, valor, nota, color, onVer }) {
  return (
    <article
      className="kpi sm con-detalle"
      onClick={onVer}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onVer()}
      role="button"
      tabIndex={0}
      title="Ver las cuotas que componen este número"
    >
      <div className="kpi-label">
        {label}
        <span className="kpi-ver">ver cuotas →</span>
      </div>
      <div className="kpi-value-row">
        <span className="kpi-value num" style={color ? { color } : undefined}>{valor}</span>
      </div>
      <div className="kpi-nota">{nota}</div>
    </article>
  );
}

/**
 * De dónde sale el número: la explicación, el total y las cuotas, en bloques si el número
 * es una suma de dos cosas distintas (Por cobrar = vence este mes + atrasado).
 */
function Detalle({ titulo, explicacion, resumen, bloques, onCerrar }) {
  const cuotas = bloques.reduce((n, b) => n + (b.filas?.length || 0), 0);
  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card detalle-metrica ancho caja1-detalle"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <header>
          <div>
            <h3>{titulo}</h3>
            <p className="dim">{explicacion}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>
        {resumen && (
          <div className="detalle-resumen">
            {resumen.map((r) => (
              <div key={r.label} className={r.tenue ? 'tenue' : undefined}>
                <span className="dim">{r.label}</span>
                <strong style={r.tono ? { color: r.tono } : undefined}>{r.valor}</strong>
                {r.nota && <span className="dim nota">{r.nota}</span>}
              </div>
            ))}
          </div>
        )}
        <div className="caja1-detalle-bloques">
          {bloques.map((b) => (
            <section key={b.titulo}>
              {bloques.length > 1 && (
                <h4>
                  {b.titulo}
                  <span className="dim"> · {b.filas?.length || 0} {b.filas?.length === 1 ? 'cuota' : 'cuotas'} · {usd(b.usd)}</span>
                </h4>
              )}
              <Lista filas={b.filas} campo={b.campo} tono={b.tono} vacio={b.vacio} />
            </section>
          ))}
        </div>
        <footer className="dim">
          {cuotas} {cuotas === 1 ? 'cuota' : 'cuotas'} · cuotas de venta (Caja 1) de ATV Clients
        </footer>
      </div>
    </div>
  );
}

export default function CajaUno() {
  const { mes } = useMes();
  const { data, error, loading } = useResource(() => getCajaUno(mes), [mes]);
  const [abierto, setAbierto] = useState(null);

  if (loading && !data) return <div className="page"><SkeletonBlock /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  const entro = data?.entro ?? {};
  const vence = data?.vence ?? {};
  const atrasado = data?.atrasado ?? {};
  const porCobrar = data?.total?.porCobrarUsd ?? 0;

  const DETALLES = {
    entro: {
      titulo: 'Entró este mes',
      explicacion: 'Las cuotas de venta que se cobraron con fecha de pago dentro del mes. Cuenta cuándo entró la plata, no cuándo vencía.',
      resumen: [
        { label: 'Entró', valor: usd(entro.usd), tono: 'var(--ok)' },
        { label: 'Cuotas', valor: entro.cuotas ?? 0 },
      ],
      bloques: [{ titulo: 'Entró', filas: entro.filas, campo: 'pagoAt', tono: 'ok', usd: entro.usd,
        vacio: 'Todavía no entró ninguna cuota de venta este mes.' }],
    },
    vence: {
      titulo: 'Vence este mes',
      explicacion: 'Las cuotas con vencimiento dentro del mes que todavía no se pagaron. Las que ya pasaron de fecha siguen acá hasta fin de mes; recién el mes que viene pasan a atrasado.',
      resumen: [
        { label: 'Vence', valor: usd(vence.usd), tono: vence.usd ? 'var(--warn)' : undefined },
        { label: 'Cuotas', valor: vence.cuotas ?? 0 },
        { label: 'Ya pasaron de fecha', valor: vence.yaVencidas ?? 0, tenue: true },
      ],
      bloques: [{ titulo: 'Vence este mes', filas: vence.filas, campo: 'venceAt', tono: 'warn', usd: vence.usd,
        vacio: 'No queda nada por vencer este mes.' }],
    },
    atrasado: {
      titulo: 'Atrasado',
      explicacion: 'Las cuotas que vencieron antes de este mes y siguen sin pagarse. Es la deuda que se arrastra: cada una es una conversación de cobranza pendiente.',
      resumen: [
        { label: 'Atrasado', valor: usd(atrasado.usd), tono: atrasado.usd ? 'var(--alert)' : undefined },
        { label: 'Cuotas', valor: atrasado.cuotas ?? 0 },
      ],
      bloques: [{ titulo: 'Atrasado', filas: atrasado.filas, campo: 'venceAt', tono: 'mal', usd: atrasado.usd,
        vacio: 'Nada atrasado.' }],
    },
    porCobrar: {
      titulo: 'Por cobrar',
      explicacion: 'Todo lo que falta entrar de las ventas: lo que vence este mes más lo que ya venía atrasado. Es la suma de los dos números anteriores.',
      resumen: [
        { label: 'Por cobrar', valor: usd(porCobrar) },
        { label: 'Vence este mes', valor: usd(vence.usd), tono: vence.usd ? 'var(--warn)' : undefined, tenue: true },
        { label: 'Atrasado', valor: usd(atrasado.usd), tono: atrasado.usd ? 'var(--alert)' : undefined, tenue: true },
      ],
      bloques: [
        { titulo: 'Vence este mes', filas: vence.filas, campo: 'venceAt', tono: 'warn', usd: vence.usd,
          vacio: 'No queda nada por vencer este mes.' },
        { titulo: 'Atrasado', filas: atrasado.filas, campo: 'venceAt', tono: 'mal', usd: atrasado.usd,
          vacio: 'Nada atrasado.' },
      ],
    },
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Ventas"
        title="Caja 1"
        desc="La plata de las ventas nuevas: lo que entró, lo que falta y lo que se arrastra. Tocá un número para ver las cuotas."
      />

      <div className="kpi-grid">
        <Kpi label="Entró este mes" valor={usd(entro.usd)} color="var(--ok)"
          nota={`${entro.cuotas ?? 0} cuotas cobradas`} onVer={() => setAbierto('entro')} />
        <Kpi label="Vence este mes" valor={usd(vence.usd)} color={vence.usd ? 'var(--warn)' : undefined}
          nota={`${vence.cuotas ?? 0} cuotas sin cobrar${vence.yaVencidas ? ` · ${vence.yaVencidas} ya pasaron de fecha` : ''}`}
          onVer={() => setAbierto('vence')} />
        <Kpi label="Atrasado" valor={usd(atrasado.usd)} color={atrasado.usd ? 'var(--alert)' : undefined}
          nota={`${atrasado.cuotas ?? 0} cuotas de meses anteriores`} onVer={() => setAbierto('atrasado')} />
        <Kpi label="Por cobrar" valor={usd(porCobrar)}
          nota="todo lo que falta entrar" onVer={() => setAbierto('porCobrar')} />
      </div>

      <p className="dim" style={{ fontSize: 12 }}>
        Caja 1 son las cuotas de ventas nuevas. El upsell y la recompra son Caja 2 y no
        entran acá; las señas tampoco, porque reservan cupo y no son una cuota de la venta.
        Sale de ATV Clients.
      </p>

      {abierto && <Detalle {...DETALLES[abierto]} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}
