import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';
import { proyectarMes } from '../../lib/metasMes.js';

/**
 * Marketing visto desde operaciones.
 *
 * Franco no decide qué reel se publica: decide si el mes llega o si hay que mover algo, y
 * para eso necesita saber adónde termina esto si seguimos al ritmo de hoy. El detalle de
 * cada pieza es el trabajo de Emi y vive en sus subvistas.
 *
 * Todo lo que se muestra sale de la base de ATV Ops. Lo que no tiene fuente va en cero y
 * se dice, en vez de rellenarlo.
 */

const n = (v, f = 'count') => formatValue(v ?? 0, f);
const TONO = { ok: 'llega', warn: 'ajustado', alert: 'no llega' };

function Proyeccion({ label, p, format = 'count', nota }) {
  return (
    <article className="kpi sm">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value-row">
        <span className="kpi-value num">{n(p.proyectado, format)}</span>
        {p.zona && <Pill tone={p.zona} dot>{TONO[p.zona]}</Pill>}
      </div>
      <div className="kpi-nota">
        {p.meta ? `van ${n(p.real, format)} · meta ${n(p.meta, format)}` : `van ${n(p.real, format)} · sin meta`}
      </div>
      {nota && <div className="kpi-nota dim">{nota}</div>}
    </article>
  );
}

/** Una línea de la tabla de cierre: lo que va, lo que proyecta y lo que falta por día. */
function Fila({ label, p, format = 'count' }) {
  const alcanza = p.zona === 'ok';
  return (
    <div className="proy-fila">
      <span className="strong">{label}</span>
      <span className="num">{n(p.real, format)}</span>
      <span className="num dim">{n(Math.round(p.ritmoDia * 10) / 10, format)}</span>
      <span className={`num${p.zona === 'alert' ? ' proy-mal' : p.zona === 'ok' ? ' proy-bien' : ''}`}>
        {n(p.proyectado, format)}
      </span>
      <span className="num dim">{p.meta ? n(p.meta, format) : '—'}</span>
      <span className="num">
        {!p.meta ? '—' : alcanza ? 'al ritmo' : `${n(Math.ceil(p.necesarioDia), format)} / día`}
      </span>
    </div>
  );
}

/**
 * @param {{ decreto: object, real: object, contexto: object, origenes: array,
 *           piezas: {reels: number, secuencias: number, videos: number},
 *           conversacionesPropias: object }} props
 */
export default function MarketingOps({ decreto, real, contexto, origenes = [], piezas,
                                       conversacionesPropias, conversacionesCrm = 0 }) {
  const diaHoy = contexto?.diaHoy ?? 1;
  const diasMes = contexto?.diasMes ?? 30;
  const base = { diaHoy, diasMes };

  // Las conversaciones propias mandan apenas empiezan a llegar; hasta entonces, el CRM.
  const conversacionesReales = conversacionesPropias?.conectado
    ? conversacionesPropias.conversaciones
    : conversacionesCrm;

  const conversaciones = proyectarMes({ ...base, real: conversacionesReales, meta: decreto?.conversaciones ?? 0 });
  const agendas = proyectarMes({ ...base, real: real?.agendas ?? 0, meta: decreto?.agendas ?? 0 });
  const cash = proyectarMes({ ...base, real: real?.cash ?? 0, meta: decreto?.cashMeta ?? 0 });
  const totalPiezas = (piezas?.reels ?? 0) + (piezas?.secuencias ?? 0) + (piezas?.videos ?? 0);
  const publicacion = proyectarMes({ ...base, real: totalPiezas, meta: 0 });

  // Un origen sin agendas ni cash no dice nada: ocupa una fila y se lee como ruido.
  const conMovimiento = origenes.filter((o) => (o.agendados ?? 0) > 0 || (o.cashUsd ?? 0) > 0);
  const totalAgendas = conMovimiento.reduce((t, o) => t + (o.agendados ?? 0), 0);
  // Orgánico es el origen "Orgánico", no todo lo que no es Ads: un referido no lo trajo
  // el contenido.
  const organico = conMovimiento.find((o) => /org[áa]nico/i.test(o.nombre));

  return (
    <>
      <div className="kpi-grid">
        <Proyeccion label="Conversaciones a fin de mes" p={conversaciones}
          nota={conversacionesPropias?.conectado ? 'las cuenta ATV Ops' : 'las cuenta el CRM de atv-mkt'} />
        <Proyeccion label="Agendas a fin de mes" p={agendas} />
        <Proyeccion label="Cash a fin de mes" p={cash} format="usd" />
        <article className="kpi sm">
          <div className="kpi-label">Piezas publicadas</div>
          <div className="kpi-value-row"><span className="kpi-value num">{n(totalPiezas)}</span></div>
          <div className="kpi-nota">
            {`${piezas?.reels ?? 0} ${piezas?.reels === 1 ? 'reel' : 'reels'} · ${piezas?.secuencias ?? 0} ${piezas?.secuencias === 1 ? 'secuencia' : 'secuencias'} · ${piezas?.videos ?? 0} ${piezas?.videos === 1 ? 'video' : 'videos'}`}
          </div>
          <div className="kpi-nota dim">{`al ritmo de hoy, ${n(publicacion.proyectado)} en el mes`}</div>
        </article>
      </div>

      <Card
        title="Cómo termina el mes"
        sub={`Al ritmo de los primeros ${diaHoy} días de ${diasMes}`}
        flush
        foot={`Quedan ${Math.max(diasMes - diaHoy, 0)} días. La última columna es lo que hay que hacer por día para llegar igual.`}
      >
        <div className="proy-tabla">
          <div className="proy-fila cabecera">
            <span>Métrica</span>
            <span>Va</span>
            <span>Por día</span>
            <span>Proyectado</span>
            <span>Meta</span>
            <span>Falta</span>
          </div>
          <Fila label="Conversaciones" p={conversaciones} />
          <Fila label="Agendas" p={agendas} />
          <Fila label="Cash" p={cash} format="usd" />
          <Fila label="Piezas publicadas" p={publicacion} />
        </div>
      </Card>

      <Card
        title="De dónde viene"
        sub={conMovimiento.length ? 'Agendas, cierres y cash del mes por origen' : 'Todavía sin agendas este mes'}
        flush
        foot="Lo orgánico es lo que produce el contenido. Lo pago se mide en Ads."
      >
        {conMovimiento.length === 0 ? (
          <div className="empty">Sin llamadas cargadas en el mes.</div>
        ) : (
          <div className="proy-tabla origen">
            <div className="proy-fila cabecera">
              <span>Origen</span>
              <span>Agendas</span>
              <span>% del total</span>
              <span>Cierres</span>
              <span>Cash</span>
            </div>
            {conMovimiento.map((o) => (
              <div key={o.nombre} className="proy-fila">
                <span className="strong">{o.nombre}</span>
                <span className="num">{n(o.agendados)}</span>
                <span className="num dim">
                  {totalAgendas ? `${Math.round((o.agendados / totalAgendas) * 100)}%` : '—'}
                </span>
                <span className="num">{n(o.cierres)}</span>
                <span className="num">{n(o.cashUsd, 'usd')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Qué hay que mover"
        sub="Lo que cambia el resultado del mes, no lo que ya pasó"
        foot={organico
          ? `Lo orgánico trajo ${n(organico.agendados)} de las ${n(totalAgendas)} agendas del mes y ${n(organico.cashUsd, 'usd')} de cash.`
          : 'Todavía no hay agendas atribuidas a contenido orgánico este mes.'}
      >
        <ul className="proy-acciones">
          {[conversaciones, agendas, cash].every((p) => !p.meta) && (
            <li>No hay metas cargadas para el mes: sin eso no se puede decir si el ritmo alcanza. Se cargan en Metas.</li>
          )}
          {conversaciones.meta > 0 && conversaciones.zona !== 'ok' && (
            <li>
              Conversaciones proyecta <b>{n(conversaciones.proyectado)}</b> contra una meta de{' '}
              {n(conversaciones.meta)}. Para llegar hacen falta{' '}
              <b>{n(Math.ceil(conversaciones.necesarioDia))} por día</b> en los {conversaciones.diasRestantes} que
              quedan, contra las {n(Math.round(conversaciones.ritmoDia * 10) / 10)} de hoy.
            </li>
          )}
          {agendas.meta > 0 && agendas.zona !== 'ok' && (
            <li>
              Agendas proyecta <b>{n(agendas.proyectado)}</b> contra {n(agendas.meta)}. Hacen falta{' '}
              <b>{n(Math.ceil(agendas.necesarioDia))} por día</b>.
            </li>
          )}
          {cash.meta > 0 && cash.zona !== 'ok' && (
            <li>
              Cash proyecta <b>{n(cash.proyectado, 'usd')}</b> contra {n(cash.meta, 'usd')}: faltan{' '}
              <b>{n(Math.max(cash.meta - cash.proyectado, 0), 'usd')}</b>.
            </li>
          )}
          {totalPiezas === 0 && <li>No hay contenido publicado este mes. Sin piezas no hay de dónde salgan conversaciones.</li>}
          {[conversaciones, agendas, cash].every((p) => p.meta > 0 && p.zona === 'ok') && (
            <li>Las tres proyecciones llegan a la meta al ritmo actual. No hay nada que corregir.</li>
          )}
        </ul>
      </Card>
    </>
  );
}
