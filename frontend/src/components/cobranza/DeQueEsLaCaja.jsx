import Bars from '../charts/Bars.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * En qué se parte la plata que entró en el mes.
 *
 * El total de caja es una suma de dos negocios que no se manejan igual: caja 1 son las
 * cuotas de las ventas nuevas —plata que ya estaba prometida y hay que ir a buscar— y
 * caja 2 es upsell y recompra, que hay que generar. Un mes puede cerrar igual con las
 * dos mitades dadas vuelta y significar cosas opuestas, así que el total solo no alcanza.
 *
 * La partición la decide ATV Clients, no ATV Ops: acá se muestra lo que ese sistema
 * publica, y `otros` aparece solo si las partes no llegan al total.
 */

const usd = (v) => formatValue(v ?? 0, 'usd');

export default function DeQueEsLaCaja({ caja, mes, onCerrar }) {
  const caja1 = caja?.caja1 ?? 0;
  const caja2 = caja?.caja2 ?? 0;
  const otros = caja?.otros ?? 0;
  const total = caja?.usd ?? 0;

  const partes = [
    { label: 'Caja 1', usd: caja1, que: 'Cuotas de ventas nuevas', color: 'var(--s3)' },
    { label: 'Caja 2', usd: caja2, que: 'Upsell y recompra', color: 'var(--s5)' },
    // Solo cuando hay algo que explicar: una fila en cero acá confunde más de lo que aclara.
    ...(Math.abs(otros) >= 1
      ? [{ label: 'Otros', usd: otros, que: 'Lo que el desglose no explica', color: 'var(--s4)' }]
      : []),
  ];

  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card caja-detalle" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="De qué es la caja del mes">
        <header>
          <div>
            <h3>De qué son los {usd(total)} que entraron</h3>
            <span className="dim">
              {caja?.pagos ?? 0} pagos con fecha en {mes || 'el mes'}
            </span>
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>

        <Bars
          data={partes} x={(d) => d.label} y={(d) => d.usd} format="usd" label="Entró"
          color={(d) => d.color} height={210}
        />

        <div className="caja-partes">
          {partes.map((p) => (
            <div key={p.label} className="caja-parte">
              <span className="caja-parte-punto" style={{ background: p.color }} />
              <div>
                <strong>{p.label}</strong>
                <span className="dim">{p.que}</span>
              </div>
              <div className="caja-parte-n">
                <span className="num">{usd(p.usd)}</span>
                <span className="dim">{total ? Math.round((p.usd / total) * 100) : 0}% del mes</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
