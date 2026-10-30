import { useState } from 'react';
import EmbudoVentas from '../components/ventas/EmbudoVentas.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { getEmbudoSetting, getMiEmbudo, getVentas } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { mesAnterior as anterior, mesId, nombreDelMes as nombreMes } from '../lib/format.js';

/**
 * Ventas: el dashboard del área, con el embudo de punta a punta como el de atv-mkt. Lo ven
 * igual el director y los closers, y se filtra por closer.
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
  // El filtro por closer: con uno elegido, el embudo sale de sus llamadas y arranca en las
  // agendas (los chats son del equipo y no se reparten).
  const [closer, setCloser] = useState('');
  const delCloser = useResource(() => (closer ? getMiEmbudo(mes, closer) : Promise.resolve(null)), [mes, closer]);

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
      {(real.closers ?? []).length > 1 && (
        <div className="pl-seg ventas-dash-closer" role="group" aria-label="Closer">
          {[['', 'Todos los closers'], ...real.closers.map((n) => [n, n])].map(([k, l]) => (
            <button key={k || 'todos'} type="button" className={closer === k ? 'activo' : ''} onClick={() => setCloser(k)}>{l}</button>
          ))}
        </div>
      )}
      {!closer ? (
        <EmbudoVentas
          real={real}
          embudo={embudo.data}
          embudoPrevio={embudoPrevio.data}
          mesPrevio={nombreMes(previo)}
        />
      ) : delCloser.data ? (
        <EmbudoVentas key={closer} real={delCloser.data} mesPrevio={nombreMes(previo)} soloLlamadas />
      ) : delCloser.error ? <ErrorState error={delCloser.error} /> : <SkeletonBlock height={420} />}
    </div>
  );
}
