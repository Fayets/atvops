import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * La meta del equipo repartida entre quienes la tienen que cumplir, contra lo que
 * cada uno lleva. La parte de cada uno es la meta dividida por la cantidad de personas
 * del rol: no hay cuotas distintas por persona, así que se reparte parejo.
 */

const RITMO = (actual, parte) => (parte > 0 ? Math.round((actual / parte) * 100) : null);

function tono(pct, esperado) {
  if (pct == null) return 'off';
  if (pct >= esperado) return 'ok';
  if (pct >= esperado * 0.6) return 'warn';
  return 'alert';
}

function Fila({ persona, metricas, esperado }) {
  return (
    <div className="meta-ind-fila">
      <div className="meta-ind-quien">
        <span className="strong">{persona}</span>
      </div>
      {metricas.map((m) => {
        const pct = RITMO(m.actual, m.parte);
        return (
          <div key={m.id} className="meta-ind-celda">
            <div className="meta-ind-valor num">
              {formatValue(m.actual, m.format)}
              <span className="dim"> / {formatValue(m.parte, m.format)}</span>
            </div>
            <div className="meta-ind-barra">
              <span style={{ width: `${Math.min(pct ?? 0, 100)}%` }} data-tono={tono(pct, esperado)} />
            </div>
            <div className="meta-ind-pct dim">{pct == null ? '—' : `${pct}%`}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * @param {{ titulo: string, sub: string, columnas: {id: string, nombre: string, format?: string}[],
 *           filas: {persona: string, metricas: object[]}[], esperado: number, gente: number }} props
 */
export default function MetasIndividuales({ titulo, sub, columnas, filas, esperado, gente }) {
  if (!filas.length) {
    return (
      <Card title={titulo} sub={sub}>
        <div className="empty">Todavía no hay nadie de este rol con llamadas en el mes.</div>
      </Card>
    );
  }
  return (
    <Card
      title={titulo}
      sub={sub}
      actions={<Pill tone="plain" dot>{`${gente} ${gente === 1 ? 'persona' : 'personas'} · va ${esperado}% del mes`}</Pill>}
      flush
      foot="La parte de cada uno es la meta del equipo dividida por la cantidad de personas del rol."
    >
      <div className="meta-ind-tabla">
        <div className="meta-ind-fila cabecera">
          <div className="meta-ind-quien">Persona</div>
          {columnas.map((c) => (
            <div key={c.id} className="meta-ind-celda">{c.nombre}</div>
          ))}
        </div>
        {filas.map((f) => (
          <Fila key={f.persona} persona={f.persona} metricas={f.metricas} esperado={esperado} />
        ))}
      </div>
    </Card>
  );
}
