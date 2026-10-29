import EmbudoVentas from '../components/ventas/EmbudoVentas.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { getEmbudoSetting, getVentas } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { mesId } from '../lib/format.js';

/** "2026-09" → "2026-08". */
function anterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
const nombreMes = (mes) => new Date(`${mes}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long' });

/**
 * Ventas: el dashboard del área, con el embudo de punta a punta como el de atv-mkt.
 *
 * Son tres pedidos y no uno porque los chats del embudo los cuenta Marketing (es caro:
 * cruza historias, reels y conversaciones) y el resto no tiene por qué esperarlo. El mes
 * anterior se pide solo por sus chats: sin ellos la tasa de agendamiento no tiene contra
 * qué compararse.
 */
export default function VentasDashboard() {
  const { mes: elegido } = useMes();
  const mes = elegido || mesId();
  const previo = anterior(mes);
  const { data, error, loading } = useResource(() => getVentas(mes), [mes]);
  const embudo = useResource(() => getEmbudoSetting(mes), [mes]);
  const embudoPrevio = useResource(() => getEmbudoSetting(previo), [previo]);

  if (error) return <ErrorState error={error} />;
  if (loading || !data) {
    return (
      <div className="page ventas-dash">
        <SkeletonKpis n={4} />
        <SkeletonBlock height={420} />
      </div>
    );
  }

  const real = data.real ?? {};
  const ctx = real.contexto ?? {};

  return (
    <div className="page ventas-dash">
      {ctx.diasMes ? (
        <p className="dim ventas-dash-dia">
          Día {ctx.diaHoy} de {ctx.diasMes} · el mes va por el {Math.round((ctx.diaHoy / ctx.diasMes) * 100)}%
        </p>
      ) : null}
      <EmbudoVentas
        real={real}
        embudo={embudo.data}
        embudoPrevio={embudoPrevio.data}
        mesPrevio={nombreMes(previo)}
      />
    </div>
  );
}
