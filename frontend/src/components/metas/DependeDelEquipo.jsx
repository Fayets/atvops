import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Qué necesita el closer del resto del equipo para llegar a su meta.
 *
 * Sus cierres no dependen solo de él: primero alguien tiene que agendar la llamada y el
 * prospecto tiene que presentarse. Esta tarjeta traduce lo que le falta en cuántas
 * agendas hacen falta, para que sepa cuándo el problema es suyo y cuándo es del setting.
 */

const N = (v) => (Number.isFinite(v) ? v : 0);

export default function DependeDelEquipo({ decreto, actual, semanasRestantes, setters }) {
  const cierresMeta = Math.round(N(decreto.agendas) * (N(decreto.showUpRate) / 100) * (N(decreto.closeRateBueno) / 100));
  const cierresFaltan = Math.max(cierresMeta - N(actual.cierres), 0);

  // Con qué rates trabajar: los reales si ya hay historia del mes, si no los del decreto.
  const evaluadas = N(actual.shows) + N(actual.noShows);
  const showRate = evaluadas > 0 ? N(actual.shows) / evaluadas : N(decreto.showUpRate) / 100;
  const closeRate = N(actual.shows) > 0 ? N(actual.cierres) / N(actual.shows) : N(decreto.closeRateBueno) / 100;

  const showsNecesarios = closeRate > 0 ? Math.ceil(cierresFaltan / closeRate) : null;
  const agendasNecesarias = showsNecesarios != null && showRate > 0 ? Math.ceil(showsNecesarios / showRate) : null;
  const agendasPlanificadas = Math.max(N(decreto.agendas) - N(actual.agendados), 0);
  const alcanza = agendasNecesarias != null && agendasNecesarias <= agendasPlanificadas;
  const porSemana = agendasNecesarias != null && semanasRestantes > 0
    ? Math.ceil(agendasNecesarias / semanasRestantes)
    : null;

  const quienes = (setters ?? []).map((s) => s.nombre).filter((n) => n && n !== 'Sin asignar');

  if (cierresFaltan === 0) {
    return (
      <Card title="De qué depende tu meta" sub="La meta de cierres del mes ya está cumplida.">
        <div className="empty">No hace falta pedir más llamadas para llegar.</div>
      </Card>
    );
  }

  return (
    <Card
      title="De qué depende tu meta"
      sub="Tus cierres arrancan cuando la llamada existe: esto es lo que hace falta que entre."
      actions={<Pill tone={alcanza ? 'ok' : 'alert'} dot>{alcanza ? 'Alcanza con el plan' : 'No alcanza con el plan'}</Pill>}
      foot={
        quienes.length
          ? `El setting del mes lo está trayendo ${quienes.join(' y ')}.`
          : 'Todavía no hay setters con agendas cargadas este mes.'
      }
    >
      <div className="depende-cadena">
        <div className="depende-paso">
          <span className="dim">Te faltan</span>
          <strong className="num">{cierresFaltan} cierres</strong>
          <span className="dim">para la meta de {cierresMeta}</span>
        </div>
        <div className="depende-paso">
          <span className="dim">Con tu close rate de {formatValue(closeRate * 100, 'pct')} eso son</span>
          <strong className="num">{showsNecesarios ?? '—'} shows</strong>
        </div>
        <div className="depende-paso">
          <span className="dim">Y con el show rate de {formatValue(showRate * 100, 'pct')} hacen falta</span>
          <strong className="num">{agendasNecesarias ?? '—'} llamadas agendadas</strong>
        </div>
      </div>

      <div className="depende-cierre">
        {alcanza ? (
          <p>
            El decreto todavía tiene {agendasPlanificadas} agendas por delante, así que con el plan alcanza.
            {porSemana != null && semanasRestantes > 0
              ? ` Son ${porSemana} por semana en las ${semanasRestantes} que quedan.`
              : ''}
          </p>
        ) : (
          <p>
            El decreto tiene {agendasPlanificadas} agendas por delante y hacen falta {agendasNecesarias}.
            Faltan {agendasNecesarias - agendasPlanificadas} llamadas más de las planificadas: o el setting
            aprieta, o tenés que subir el close rate.
          </p>
        )}
        <p className="dim">
          Si en cambio subís tu close rate a {formatValue(N(decreto.closeRateBueno), 'pct')}, las mismas{' '}
          {agendasPlanificadas} agendas del plan dan{' '}
          {Math.floor(agendasPlanificadas * showRate * (N(decreto.closeRateBueno) / 100))} cierres.
        </p>
      </div>
    </Card>
  );
}
