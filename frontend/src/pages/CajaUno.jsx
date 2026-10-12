import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { getCajaUno } from '../data/api.js';
import { formatValue } from '../lib/format.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

/**
 * Caja 1: la plata de las ventas nuevas, que es la que cierra el closer.
 *
 * Tres bloques y no un total: lo que entró, lo que vence este mes y todavía no entró, y
 * lo que venció antes y sigue sin pagarse. Un mes que cobró todo y uno que cobró la
 * mitad y arrastra el resto suman parecido y no son lo mismo; la diferencia entre los
 * dos es el trabajo que hay por delante.
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

export default function CajaUno() {
  const { mes } = useMes();
  const { data, error, loading } = useResource(() => getCajaUno(mes), [mes]);

  if (loading && !data) return <div className="page"><SkeletonBlock /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  const entro = data?.entro ?? {};
  const vence = data?.vence ?? {};
  const atrasado = data?.atrasado ?? {};

  return (
    <div className="page">
      <PageHeader
        eyebrow="Ventas"
        title="Caja 1"
        desc="La plata de las ventas nuevas: lo que entró, lo que falta y lo que se arrastra."
      />

      <div className="kpi-grid">
        <article className="kpi sm">
          <div className="kpi-label">Entró este mes</div>
          <div className="kpi-value-row">
            <span className="kpi-value num" style={{ color: 'var(--ok)' }}>{usd(entro.usd)}</span>
          </div>
          <div className="kpi-nota">{entro.cuotas ?? 0} cuotas cobradas</div>
        </article>
        <article className="kpi sm">
          <div className="kpi-label">Vence este mes</div>
          <div className="kpi-value-row">
            <span className="kpi-value num"
              style={{ color: vence.usd ? 'var(--warn)' : undefined }}>{usd(vence.usd)}</span>
          </div>
          <div className="kpi-nota">
            {vence.cuotas ?? 0} cuotas sin cobrar
            {vence.yaVencidas ? ` · ${vence.yaVencidas} ya pasaron de fecha` : ''}
          </div>
        </article>
        <article className="kpi sm">
          <div className="kpi-label">Atrasado</div>
          <div className="kpi-value-row">
            <span className="kpi-value num"
              style={{ color: atrasado.usd ? 'var(--alert)' : undefined }}>{usd(atrasado.usd)}</span>
          </div>
          <div className="kpi-nota">{atrasado.cuotas ?? 0} cuotas de meses anteriores</div>
        </article>
        <article className="kpi sm">
          <div className="kpi-label">Por cobrar</div>
          <div className="kpi-value-row">
            <span className="kpi-value num">{usd(data?.total?.porCobrarUsd)}</span>
          </div>
          <div className="kpi-nota">todo lo que falta entrar</div>
        </article>
      </div>

      <Card title="Entró este mes" sub={`${entro.cuotas ?? 0} cuotas · ${usd(entro.usd)}`}>
        <Lista filas={entro.filas} campo="pagoAt" tono="ok"
          vacio="Todavía no entró ninguna cuota de venta este mes." />
      </Card>

      <Card title="Vence este mes y no entró"
        sub={vence.yaVencidas
          ? `${vence.yaVencidas} ya pasaron de fecha · ${usd(vence.usd)}`
          : `${vence.cuotas ?? 0} cuotas · ${usd(vence.usd)}`}>
        <Lista filas={vence.filas} campo="venceAt" tono="warn"
          vacio="No queda nada por vencer este mes." />
      </Card>

      <Card title="Atrasado"
        sub={`venció antes de este mes y sigue sin pagarse · ${usd(atrasado.usd)}`}>
        <Lista filas={atrasado.filas} campo="venceAt" tono="mal"
          vacio="Nada atrasado." />
      </Card>

      <p className="dim" style={{ fontSize: 12 }}>
        Caja 1 son las cuotas de ventas nuevas. El upsell y la recompra son Caja 2 y no
        entran acá; las señas tampoco, porque reservan cupo y no son una cuota de la venta.
        Sale de ATV Clients.
      </p>
    </div>
  );
}
