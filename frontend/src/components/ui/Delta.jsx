import { delta as calcDelta } from '../../lib/format.js';
import Icon from './Icon.jsx';

/**
 * Variación contra el período anterior. `good` dice qué dirección celebrar:
 * bajar el churn es bueno, bajar el cash no.
 * @param {{ value: number, previous: number | null | undefined,
 *           good?: 'up' | 'down' | 'neutral', sufijo?: string }} props
 */
export default function Delta({ value, previous, good = 'up', sufijo }) {
  const d = calcDelta(value, previous);
  if (d === null) return null;

  const sube = d > 0;
  const plano = Math.abs(d) < 0.5;
  let tono = 'neutral';
  if (!plano && good !== 'neutral') tono = (sube && good === 'up') || (!sube && good === 'down') ? 'good' : 'bad';

  return (
    <span className={`delta ${tono}`} title={`Período anterior: ${previous}`}>
      {!plano && <Icon name={sube ? 'up' : 'down'} size={10} />}
      <span className="num">
        {plano ? '=' : `${Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}%`}
      </span>
      {sufijo && <span style={{ opacity: 0.7 }}>{sufijo}</span>}
    </span>
  );
}
