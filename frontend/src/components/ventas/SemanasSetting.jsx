import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';

/**
 * Las últimas seis semanas de setting, y dónde conviene trabajar.
 *
 * Una foto del mes dice dónde estás; la serie por semana dice hacia dónde vas. Es lo que
 * permite ver que el show rate viene cayendo tres semanas seguidas antes de que el mes
 * cierre mal.
 *
 * El diagnóstico apunta a una sola etapa: la que más lejos está de su rango sano. Arreglar
 * la peor mueve el resultado; mirar las cuatro a la vez no mueve ninguna.
 */

const RANGOS = {
  booking: { verde: 30, amarillo: 20, label: 'Pitch → Agenda',
    porque: 'Mandás el link y no agendan: el problema está en cómo se ofrece la llamada.' },
  show: { verde: 80, amarillo: 65, label: 'Agenda → Show',
    porque: 'Agendan y no vienen: faltan recordatorios y confirmación previa.' },
  close: { verde: 25, amarillo: 15, label: 'Show → Cierre',
    porque: 'Llegan a la llamada y no cierran: o la llamada o la calificación del lead.' },
};

const pinta = (v, r) => {
  if (v == null || !r) return '';
  if (v >= r.verde) return ' zona-ok';
  if (v >= r.amarillo) return ' zona-warn';
  return ' zona-alert';
};

const num = (v) => (v == null ? '—' : `${v}%`);

/** La etapa que más lejos está de su rango sano, mirando el mes. */
function peorEtapa(semanas) {
  const ultimas = semanas.slice(-4);
  const promedio = (campo) => {
    const vals = ultimas.map((s) => s[campo]).filter((v) => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const candidatas = Object.entries(RANGOS)
    .map(([id, r]) => {
      const valor = promedio(id);
      return valor == null ? null : { id, ...r, valor, brecha: r.verde - valor };
    })
    .filter(Boolean)
    .filter((c) => c.brecha > 0)
    .sort((a, b) => b.brecha - a.brecha);
  return candidatas[0] ?? null;
}

/**
 * @param {{ semanas: array }} props
 */
export default function SemanasSetting({ semanas = [] }) {
  if (!semanas.length) return null;
  const peor = peorEtapa(semanas);

  return (
    <>
      <Card
        title="Dónde conviene trabajar"
        sub={peor ? 'La etapa más lejos de su rango sano, sobre las últimas cuatro semanas' : 'Las tres etapas están en rango'}
      >
        {!peor ? (
          <div className="empty">Las tres conversiones están dentro de lo sano. No hay una sola cosa que arreglar.</div>
        ) : (
          <div className="peor-etapa">
            <div className="peor-cab">
              <span className="peor-titulo">{peor.label}</span>
              <Pill tone={peor.valor >= peor.amarillo ? 'warn' : 'alert'} dot>
                {peor.valor}% · sano {peor.verde}%
              </Pill>
            </div>
            <p className="peor-porque">{peor.porque}</p>
            <p className="dim">
              Faltan {Math.round(peor.brecha * 10) / 10} puntos para entrar en rango. Es la etapa
              donde el mismo esfuerzo rinde más, porque todo lo que pasa después se multiplica por ella.
            </p>
          </div>
        )}
      </Card>

      <Card
        title="Últimas seis semanas"
        sub="Lo que hizo cada semana y lo que convirtió"
        flush
        foot="Una semana sola no dice nada; la serie sí. Dos semanas seguidas fuera de rango en la misma etapa ya es una tendencia."
      >
        <div className="proy-tabla semanas">
          <div className="proy-fila cabecera">
            <span>Semana</span>
            <span>Pitch</span>
            <span>Agendas</span>
            <span>Shows</span>
            <span>Cierres</span>
            <span>Book</span>
            <span>Show</span>
            <span>Close</span>
            <span>Setting</span>
          </div>
          {semanas.map((s) => (
            <div key={s.semana} className="proy-fila">
              <span className="strong">{s.etiqueta}</span>
              <span className="num">{s.pitches}</span>
              <span className="num">{s.agendas}</span>
              <span className="num">{s.shows}</span>
              <span className="num">{s.cierres}</span>
              <span className={`num${pinta(s.booking, RANGOS.booking)}`}>{num(s.booking)}</span>
              <span className={`num${pinta(s.show, RANGOS.show)}`}>{num(s.show)}</span>
              <span className={`num${pinta(s.close, RANGOS.close)}`}>{num(s.close)}</span>
              <span className="num dim">{num(s.setting)}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
