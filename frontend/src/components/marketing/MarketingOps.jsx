import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import QueMover from './QueMover.jsx';
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
 * Suma los valores por día en una serie acumulada, un lugar por día transcurrido.
 *
 * Los días sin nada no se saltean: un día sin agendas es una meseta en la curva, que es
 * justo lo que hay que ver. El mes en curso llega hasta hoy y no más: los días que no
 * pasaron todavía no son ceros.
 *
 * @param {Array<object>} filas Cada una con una fecha ISO y un valor.
 */
function acumular(filas, fecha, valor, diaHoy) {
  const porDia = new Array(diaHoy).fill(0);
  (filas ?? []).forEach((f) => {
    const dia = Number(String(fecha(f) ?? '').slice(8, 10));
    if (dia >= 1 && dia <= diaHoy) porDia[dia - 1] += Number(valor(f)) || 0;
  });
  let total = 0;
  return porDia.map((v) => {
    total += v;
    return Math.round(total * 100) / 100;
  });
}

/**
 * @param {{ decreto: object, real: object, contexto: object, series: array,
 *           piezas: {reels: number, secuencias: number, videos: number},
 *           chats: { total: number, fuente: string, porDia: array } }} props
 */
export default function MarketingOps({ decreto, real, contexto, series = [], piezas,
                                       chats = { total: 0, fuente: '', porDia: [] } }) {
  const diaHoy = contexto?.diaHoy ?? 1;
  const diasMes = contexto?.diasMes ?? 30;
  const base = { diaHoy, diasMes };

  // El número ya viene resuelto desde la página, que es la que lo comparte con el KPI de
  // arriba. Ver lib/chats.js: acá y allá tienen que dar lo mismo, y antes no lo daban.
  const conversacionesReales = chats.total;

  const conversaciones = proyectarMes({ ...base, real: conversacionesReales, meta: decreto?.conversaciones ?? 0 });
  const agendas = proyectarMes({ ...base, real: real?.agendas ?? 0, meta: decreto?.agendas ?? 0 });
  const cash = proyectarMes({ ...base, real: real?.cash ?? 0, meta: decreto?.cashMeta ?? 0 });
  const totalPiezas = (piezas?.reels ?? 0) + (piezas?.secuencias ?? 0) + (piezas?.videos ?? 0);
  const publicacion = proyectarMes({ ...base, real: totalPiezas, meta: 0 });

  // Una métrica sin meta no se puede medir contra nada: no entra al gráfico en vez de
  // dibujarle una curva contra una meta inventada.
  const aMover = [
    {
      label: 'Chats',
      color: 'var(--s1)',
      format: 'count',
      p: conversaciones,
      acum: acumular(chats.porDia, (d) => d.fecha, (d) => d.cuantos, diaHoy),
    },
    {
      label: 'Agendas',
      color: 'var(--s2)',
      format: 'count',
      p: agendas,
      acum: acumular(series, (d) => d.fecha, (d) => d.agendas, diaHoy),
    },
    {
      label: 'Cash',
      color: 'var(--brand)',
      format: 'usd',
      p: cash,
      acum: acumular(series, (d) => d.fecha, (d) => d.cashUsd, diaHoy),
    },
  ].filter((f) => f.p.meta > 0)
    .map((f) => ({
      ...f,
      meta: f.p.meta,
      proyectado: f.p.proyectado,
      // El total del mes es el que manda: es el mismo que muestran los KPI de arriba y la
      // tabla. La serie por día puede quedar unos pesos abajo —una seña de un mes
      // anterior que cerró ahora entra en el total y no en el día de la llamada—, así que
      // el último punto se cierra contra el total en vez de dejar la curva y el número
      // diciendo cosas distintas en la misma pantalla.
      acum: f.acum.length ? [...f.acum.slice(0, -1), f.p.real] : f.acum,
    }));

  return (
    <>
      <div className="kpi-grid">
        <Proyeccion label="Chats a fin de mes" p={conversaciones} nota={chats.fuente} />
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
          <Fila label="Chats" p={conversaciones} />
          <Fila label="Agendas" p={agendas} />
          <Fila label="Cash" p={cash} format="usd" />
          <Fila label="Piezas publicadas" p={publicacion} />
        </div>
      </Card>

      <Card title="Qué hay que mover" sub={`${diaHoy} de ${diasMes} días`} flush>
        {aMover.length === 0 ? (
          <div className="empty">Sin metas cargadas para el mes. Se cargan en Metas.</div>
        ) : (
          <div className="mover">
            <div className="legend">
              {aMover.map((f) => (
                <span className="k" key={f.label}><i style={{ background: f.color }} />{f.label}</span>
              ))}
              <span className="k dim"><i className="ideal" />el ritmo que llega justo</span>
            </div>
            <QueMover filas={aMover} diaHoy={diaHoy} diasMes={diasMes} />
          </div>
        )}
      </Card>

    </>
  );
}
