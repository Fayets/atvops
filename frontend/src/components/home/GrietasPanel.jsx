import { SOURCES } from '../../data/sources.js';
import { formatValue, hace } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';

const TONO = { alta: 'alert', media: 'warn', baja: 'off' };

/**
 * Panel de grietas: dónde el tablero y la fuente real dicen cosas distintas.
 * Es lo primero que hay que mirar antes de creerle a cualquier otro número.
 * @param {{ grietas: import('../../data/types.js').Grieta[] }} props
 */
export default function GrietasPanel({ grietas }) {
  const altas = grietas.filter((g) => g.severidad === 'alta').length;

  return (
    <Card
      title="Grietas detectadas"
      sub="Diferencias entre lo que muestra el tablero y lo que dice la fuente"
      actions={
        <Pill tone={altas ? 'alert' : 'ok'} dot>
          {altas ? `${altas} de severidad alta` : 'ninguna crítica'}
        </Pill>
      }
      flush
      foot="Una grieta se cierra de dos formas: corrigiendo el dato, o automatizando la fuente para que no vuelva a abrirse."
    >
      {grietas.map((g) => (
        <div key={g.id} className={`grieta ${g.severidad}`}>
          <i className="sev" />
          <div>
            <h4>
              {g.metrica}
              <Pill tone={TONO[g.severidad]}>{g.severidad}</Pill>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>
                detectada {hace(g.detectadaAt)}
              </span>
            </h4>
            <p>{g.causa}</p>
          </div>
          <div className="grieta-valores">
            <span>
              <span className="t eyebrow" style={{ display: 'block', textAlign: 'right' }}>
                tablero
              </span>
              <span className="num dash">{formatValue(g.valorDashboard, g.format)}</span>
            </span>
            <span className="vs">vs</span>
            <span>
              <span className="t eyebrow" style={{ display: 'block', textAlign: 'right' }}>
                {SOURCES[g.sourceId].nombre}
              </span>
              <span className="num fuente">{formatValue(g.valorFuente, g.format)}</span>
            </span>
          </div>
        </div>
      ))}
    </Card>
  );
}
