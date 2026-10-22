import { useState } from 'react';
import Card from '../../ui/Card.jsx';
import { D, FINN, csvAjustes, fmtCorta, fmtD, usd } from '../../../lib/lineaPagos.js';
import BotonCliente from './BotonCliente.jsx';

/** Pestaña Ajustes: la tabla para revisar o pasar a la ficha, con copia en CSV. */
export default function AjustesCargados({ filas, onElegir, onQuitar }) {
  const [copia, setCopia] = useState('');
  if (!filas.length) return <p className="dim lp-vacio">Sin ajustes cargados</p>;

  const copiar = () => {
    const listo = (ok) => setCopia(ok ? 'CSV copiado' : 'No se pudo copiar');
    try {
      navigator.clipboard.writeText(csvAjustes(filas)).then(() => listo(true), () => listo(false));
    } catch {
      listo(false);
    }
  };

  return (
    <Card flush title="Ajustes cargados" actions={(
      <>
        {copia && <span className="lp-aviso">{copia}</span>}
        <button type="button" className="btn sm" onClick={copiar}>Copiar como CSV</button>
      </>
    )}>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Cliente</th><th>Grupo</th><th>Vencimiento</th><th>Estado financiero</th><th className="right">Deuda</th><th>Próxima cuota</th><th /></tr>
          </thead>
          <tbody>
            {filas.map(({ c, a }) => (
              <tr key={c.id}>
                <td><BotonCliente c={c} onElegir={onElegir} /></td>
                <td>{c.g}{c.ab ? '+B' : ''}</td>
                <td className="num">{a.v ? `${fmtCorta(c.o.vD)} → ${fmtD(D(a.v))}` : '–'}</td>
                <td>{a.estado ? FINN[a.estado] || a.estado : '–'}</td>
                <td className="right num">{a.deuda != null && a.deuda !== '' ? usd(+a.deuda) : '–'}</td>
                <td className="num">{a.prox ? `${fmtD(D(a.prox))}${a.monto ? ` · ${usd(+a.monto)}` : ''}` : '–'}</td>
                <td className="right"><button type="button" className="btn ghost sm" onClick={() => onQuitar(c.id)}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
