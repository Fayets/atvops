import { formatValue } from '../../lib/format.js';

/**
 * El embudo del setting: de dónde sale cada escalón importa tanto como el número.
 *
 * Chats son automáticos (los genera el contenido y viven en Marketing); conversaciones
 * y pitches los carga el setter en su reporte diario. Nunca van a coincidir, y esa
 * diferencia es el dato: si entran 200 chats y se trabajan 40 conversaciones, o no da
 * abasto o los chats son basura.
 */

/** Una tasa solo se muestra si el denominador existe: 0 sobre 0 no es 0%. */
function tasa(arriba, abajo) {
  if (!abajo) return null;
  return Math.round((arriba / abajo) * 100);
}

function Escalon({ etapa, n, pie, atenuado }) {
  return (
    <div className={`embudo-escalon${atenuado ? ' atenuado' : ''}`}>
      <div className="embudo-etapa">{etapa}</div>
      <div className="embudo-n">{n == null ? '—' : formatValue(n, 'num')}</div>
      <div className="embudo-pie">{pie}</div>
    </div>
  );
}

function Paso({ valor, label }) {
  return (
    <div className="embudo-paso">
      <div className={`embudo-tasa${valor == null ? ' vacia' : ''}`}>{valor == null ? '—' : `${valor}%`}</div>
      <div className="embudo-paso-label">{label}</div>
    </div>
  );
}

/**
 * @param {{ funnel: object, chats: number | null }} props
 */
export default function EmbudoSetting({ funnel = {}, chats = null }) {
  const conversaciones = Number(funnel.conversaciones ?? 0);
  const pitches = Number(funnel.pitches ?? 0);
  const agendas = Number(funnel.agendas ?? 0);
  const cargado = conversaciones + pitches + agendas > 0;

  return (
    <section className="card embudo-card">
      <div className="embudo-fila">
        <Escalon etapa="Chats" n={chats} pie="automático · Marketing" atenuado />
        <Paso valor={tasa(conversaciones, chats)} label="se trabaja" />
        <Escalon etapa="Conversaciones" n={conversaciones} pie={cargado ? 'del reporte del setter' : 'sin cargar'} />
        <Paso valor={tasa(pitches, conversaciones)} label="a pitch" />
        <Escalon etapa="Pitches" n={pitches} pie={cargado ? 'del reporte del setter' : 'sin cargar'} />
        <Paso valor={tasa(agendas, pitches)} label="booking" />
        <Escalon etapa="Agendas" n={agendas} pie={cargado ? 'del reporte del setter' : 'sin cargar'} />
      </div>

      {!cargado && (
        <div className="embudo-aviso">
          <i className="dot warn" />
          <span>
            <strong>Nadie cargó el reporte este mes.</strong> Estos números salen del reporte diario
            del setter: sin eso, el embudo no existe.
          </span>
        </div>
      )}
    </section>
  );
}
