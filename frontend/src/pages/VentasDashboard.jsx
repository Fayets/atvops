import BloqueClosing from '../components/ventas/BloqueClosing.jsx';
import EmbudoSetting from '../components/ventas/EmbudoSetting.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { getVentas } from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

/**
 * Ventas: el dashboard del área. Dos bloques y nada más.
 *
 * Setting arriba y closing abajo, en el orden del embudo. Lo operativo —el calendario,
 * los reportes, el pipeline— no vive acá: esta pantalla dice cómo venimos, no qué hacer
 * ahora. Para eso están los laboratorios.
 */
export default function VentasDashboard() {
  const { mes } = useMes();
  const { data, error, loading } = useResource(() => getVentas(mes), [mes]);

  if (error) return <ErrorState error={error} />;
  if (loading || !data) {
    return (
      <div className="page ventas-dash">
        <SkeletonKpis n={4} />
        <SkeletonBlock height={200} />
      </div>
    );
  }

  const actual = data.real?.actual ?? data.actual ?? {};
  const ctx = data.real?.contexto ?? data.contexto ?? {};
  const funnel = data.real?.topFunnel ?? data.topFunnel ?? {};

  return (
    <div className="page ventas-dash">
      <PageHeader
        eyebrow="Ventas"
        title={ctx.mes ? `Septiembre ${String(ctx.mes).slice(0, 4)}` : 'El mes'}
        desc={
          ctx.diasMes
            ? `Día ${ctx.diaHoy} de ${ctx.diasMes} · el mes va por el ${Math.round((ctx.diaHoy / ctx.diasMes) * 100)}%`
            : ''
        }
      />

      <section className="ventas-dash-bloque">
        <header>
          <h2>Setting</h2>
          <span className="dim">lo carga el setter · los chats son automáticos y viven en Marketing</span>
        </header>
        <EmbudoSetting funnel={funnel} chats={null} />
      </section>

      <section className="ventas-dash-bloque">
        <header>
          <h2>Closing</h2>
          <span className="dim">del registro de llamadas · se llena solo con Fathom</span>
        </header>
        <BloqueClosing data={actual} />
      </section>
    </div>
  );
}
