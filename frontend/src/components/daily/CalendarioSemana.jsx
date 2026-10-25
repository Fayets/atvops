import { useState } from 'react';
import { DIAS_CORTOS, fechaCorta, sumarDias } from '../../lib/daily.js';

/**
 * Elegir a qué semana van las tareas.
 *
 * Un mes entero, por filas de lunes a domingo: se toca cualquier día y queda elegida su
 * semana completa. No se eligen días sueltos a propósito —la daily carga una semana— y
 * el día de cada tarea se corrige en la lista de al lado.
 *
 * Las semanas que ya terminaron quedan apagadas: el servidor no las acepta, y mostrarlas
 * elegibles sería ofrecer algo que después falla.
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** El lunes de la semana de esa fecha. */
export function lunesDe(iso) {
  const d = new Date(`${iso}T12:00:00`);
  // getDay(): 0 es domingo. La semana empieza el lunes.
  return sumarDias(iso, -((d.getDay() + 6) % 7));
}

/** Las seis filas de lunes que cubren ese mes. */
function filasDelMes(anio, mes) {
  const primero = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const arranque = lunesDe(primero);
  return Array.from({ length: 6 }, (_, i) => sumarDias(arranque, i * 7));
}

export default function CalendarioSemana({ semana, hoy, onElegir }) {
  const [anio, mes] = semana.split('-').map(Number);
  const [viendo, setViendo] = useState({ anio, mes: mes - 1 });
  const mover = (n) => setViendo(({ anio: a, mes: m }) => {
    const total = a * 12 + m + n;
    return { anio: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
  });

  return (
    <div className="dl-cal">
      <div className="dl-cal-cab">
        <button type="button" className="btn ghost sm" onClick={() => mover(-1)} aria-label="Mes anterior">←</button>
        <b>{MESES[viendo.mes]} {viendo.anio}</b>
        <button type="button" className="btn ghost sm" onClick={() => mover(1)} aria-label="Mes siguiente">→</button>
      </div>
      <div className="dl-cal-dias">{DIAS_CORTOS.map((d) => <span key={d}>{d}</span>)}</div>
      {filasDelMes(viendo.anio, viendo.mes).map((lunes) => {
        const pasada = sumarDias(lunes, 6) < hoy;
        const elegida = lunes === semana;
        return (
          <button
            key={lunes}
            type="button"
            className={`dl-cal-sem${elegida ? ' elegida' : ''}`}
            disabled={pasada}
            aria-pressed={elegida}
            aria-label={`Semana del ${fechaCorta(lunes)} al ${fechaCorta(sumarDias(lunes, 6))}`}
            onClick={() => onElegir(lunes)}
          >
            {Array.from({ length: 7 }, (_, i) => {
              const f = sumarDias(lunes, i);
              const otroMes = Number(f.slice(5, 7)) !== viendo.mes + 1;
              return (
                <span key={f} className={`${otroMes ? 'fuera' : ''}${f === hoy ? ' hoy' : ''}`}>
                  {Number(f.slice(8))}
                </span>
              );
            })}
          </button>
        );
      })}
    </div>
  );
}
