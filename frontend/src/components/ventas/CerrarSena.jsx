import { useState } from 'react';
import { cerrarSena } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { listaMeses, mesActualId } from '../../lib/mes.js';

/**
 * Una seña que termina de cerrar meses después.
 *
 * La llamada no se toca: sigue siendo la seña del mes en que pasó, con el cash que entró
 * entonces. Lo que entra al cerrar se anota con el mes en que entró, y es ese mes el que
 * lo cuenta. Si en vez de esto se marcara "Cerrado" sobre la misma fila, septiembre
 * perdería una seña, ganaría un cierre y se le sumaría plata de octubre: el reporte que
 * ya se entregó dejaría de coincidir con el sistema.
 *
 * Por eso aparece solo sobre una llamada que quedó en seña.
 */
export default function CerrarSena({ llamada, mes, onGuardado }) {
  const yaCerrada = Boolean(llamada.cierreMes);
  const [abierto, setAbierto] = useState(false);
  const [cierreMes, setCierreMes] = useState(llamada.cierreMes || mesActualId());
  const [cash, setCash] = useState(
    llamada.cierreCashUsd ? String(llamada.cierreCashUsd) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const sena = Number(llamada.cashUsd || 0);
  const precio = Number(llamada.facturacionUsd || 0);
  // Lo que falta cobrar, que es lo que se espera que entre al cerrar. Es una sugerencia
  // para no tipearla: el que cierra puede poner otra cosa.
  const falta = precio > sena ? Math.round(precio - sena) : 0;

  const guardar = async (deshacer = false) => {
    setGuardando(true);
    setError(null);
    try {
      await cerrarSena(llamada.id, {
        cierreMes, cashUsd: cash === '' ? 0 : Number(cash),
        evento: llamada.eventoId || '', abrir: deshacer, mes, lista: false,
      });
      onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (yaCerrada && !abierto) {
    return (
      <div className="cerrar-sena hecha">
        <div>
          <b>Cerrada en {etiqueta(llamada.cierreMes)}</b>
          <span className="dim">
            {' '}· entraron {formatValue(llamada.cierreCashUsd || 0, 'usd')} ese mes
          </span>
          <div className="dim">
            La seña de {formatValue(sena, 'usd')} sigue contando en el mes de la llamada.
          </div>
        </div>
        <button type="button" className="btn sm ghost" onClick={() => setAbierto(true)}>
          Corregir
        </button>
      </div>
    );
  }

  if (!abierto) {
    return (
      <div className="cerrar-sena">
        <button type="button" className="btn sm" onClick={() => {
          setAbierto(true);
          if (!cash && falta) setCash(String(falta));
        }}>
          Cerrar llamada
        </button>
        <span className="dim">
          Terminó de cerrar: anotá en qué mes entró el resto de la plata.
        </span>
      </div>
    );
  }

  return (
    <div className="cerrar-sena abierta">
      <div className="cerrar-sena-campos">
        <label className="campo">
          <span>Mes del cierre</span>
          <select value={cierreMes} onChange={(e) => setCierreMes(e.target.value)}>
            {listaMeses(mesActualId(), 11, 1).map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Cash que entró al cerrar (USD)</span>
          <input type="number" inputMode="decimal" value={cash} placeholder="0"
            onChange={(e) => setCash(e.target.value)} />
        </label>
      </div>
      <p className="dim cerrar-sena-nota">
        La seña de {formatValue(sena, 'usd')} queda donde está, en el mes de la llamada.
        {cash !== '' && Number(cash) > 0
          ? ` Los ${formatValue(Number(cash), 'usd')} van al cash de ${etiqueta(cierreMes)}.`
          : ''}
        {falta && cash !== '' && Number(cash) !== falta
          ? ` Según el programa faltaban ${formatValue(falta, 'usd')}.`
          : ''}
      </p>
      {error ? <div className="ronda-evento error">{error}</div> : null}
      <div className="cerrar-sena-acciones">
        {yaCerrada ? (
          <button type="button" className="btn sm ghost" onClick={() => guardar(true)}
            disabled={guardando}>
            Deshacer el cierre
          </button>
        ) : null}
        <button type="button" className="btn sm ghost" onClick={() => setAbierto(false)}
          disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="btn sm" onClick={() => guardar(false)} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar el cierre'}
        </button>
      </div>
    </div>
  );
}

function etiqueta(id) {
  return listaMeses(mesActualId(), 23, 2).find((m) => m.id === id)?.label ?? id;
}
