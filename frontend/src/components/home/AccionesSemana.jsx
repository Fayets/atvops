import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocalState } from '../../lib/hooks.js';
import Icon from '../ui/Icon.jsx';
import Pill from '../ui/Pill.jsx';

const AREA = {
  marketing: 'Marketing',
  ventas: 'Ventas',
  fulfillment: 'Fulfillment',
  cobranza: 'Cobranza',
  sistemas: 'Sistemas',
};

/**
 * Lo que el sistema dice que hay que hacer esta semana. Se pliega y recuerda
 * cómo quedó. Cada acción muestra solo el título; la cuenta que la justifica
 * se abre a pedido.
 * @param {{ acciones: import('../../data/types.js').Accion[], semana: string }} props
 */
export default function AccionesSemana({ acciones, semana }) {
  const [abierto, setAbierto] = useLocalState('atv-ops:acciones-abierto', true);
  const [expandida, setExpandida] = useState(null);
  const urgentes = acciones.filter((a) => a.prioridad === 'alta').length;

  return (
    <section className={`acciones${abierto ? '' : ' plegado'}`}>
      <button className="acciones-head" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <span className="acciones-titulo">
          <span className="eyebrow">Qué hacer esta semana · {semana}</span>
          <h2>
            {acciones.length} acciones
            {urgentes > 0 && <span className="acciones-urgentes"> · {urgentes} urgentes</span>}
          </h2>
        </span>
        {!abierto && (
          <span className="acciones-resumen">
            {acciones.slice(0, 4).map((a) => (
              <Pill key={a.id} tone={a.prioridad === 'alta' ? 'alert' : 'plain'}>{AREA[a.area]}</Pill>
            ))}
          </span>
        )}
        <span className={`acciones-chevron${abierto ? ' abierto' : ''}`}>
          <Icon name="arrow" size={15} />
        </span>
      </button>

      {abierto && (
        acciones.length === 0 ? (
          <div className="empty" style={{ padding: '16px 18px' }}>
            Sin acciones urgentes desde datos reales esta semana.
          </div>
        ) : (
          <ol className="acciones-lista">
            {acciones.map((a, i) => {
              const open = expandida === a.id;
              return (
                <li key={a.id} className={`accion ${a.prioridad}${open ? ' abierta' : ''}`}>
                  <span className="accion-n num">{i + 1}</span>
                  <div className="accion-cuerpo">
                    <div className="accion-titulo">
                      <Link to={a.href}>{a.titulo}</Link>
                      <button type="button" className="accion-ver" onClick={() => setExpandida(open ? null : a.id)}>
                        {open ? 'ocultar cuenta' : 'ver cuenta'}
                      </button>
                    </div>
                    {open && <div className="accion-porque">{a.porque}</div>}
                  </div>
                  <div className="accion-meta">
                    <Pill tone={a.prioridad === 'alta' ? 'alert' : 'plain'}>{AREA[a.area]}</Pill>
                    <span className="accion-dueno">{a.dueno}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )
      )}
    </section>
  );
}
