import { useState } from 'react';
import { asignarCloserLlamada, descartarLlamada, guardarResultadoLlamada } from '../../data/api.js';
import '../../styles/llamadas.css';

/**
 * Lo que comparten las dos listas de llamadas —la del director y la del closer—: cómo se
 * lee el status de una llamada y cómo se guarda desde la fila.
 *
 * Es la lógica que tenía la tabla del closer, sacada a un lugar común. Las dos listas
 * miran la misma reunión: si cada una la leyera a su manera, el mismo status se vería
 * distinto según quién mire.
 */

export const VENTA = ['Cerrado', 'Seña'];

// Qué le pasa a la llamada cuando nadie cargó nada todavía.
export const SIN_CARGAR = {
  agendado: 'Por venir', sin_reportar: 'Falta cargar', sin_crm: 'Falta cargar', descartada: 'Descartada',
};

// El CRM guarda el resultado en minúscula y a veces sin tilde ("sena", "reagenda"): se
// compara sin tildes ni separadores para encontrar el estado que le corresponde.
export const clave = (t) => (t ?? '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
export const canonico = (valor, estados) => estados.find((e) => clave(e) === clave(valor)) ?? '';
const conMayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/**
 * El closer del equipo que corresponde a lo cargado. Hay llamadas con "Nick Xanderz" y
 * otras con "Nick": sin comparar por nombre de pila, el selector las mostraba sin dueño.
 */
export function closerDe(nombre, equipo) {
  const exacto = canonico(nombre, equipo);
  if (exacto) return exacto;
  const pila = clave((nombre ?? '').toString().trim().split(/\s+/)[0]);
  return pila ? (equipo.find((n) => clave(n.split(/\s+/)[0]) === pila) ?? '') : '';
}

/**
 * Cómo se muestra el status de una llamada. Un resultado que ya no se puede elegir pero
 * que la llamada tiene cargado —"No contesta", "No tiene la plata"— se sigue mostrando:
 * el backend lo cuenta, y dejarlo en "Falta cargar" haría que la fila contradiga a las
 * métricas. No vale para "agendado", que el backend ya clasifica como sin cargar.
 */
export function statusDe(llamada, estados) {
  const cargado = canonico(llamada.resultado, estados);
  const legado = (!cargado && (llamada.resultado || '').trim()
    && !['sin_reportar', 'agendado', 'sin_crm'].includes(llamada.estado))
    ? conMayuscula(llamada.resultado.trim()) : '';
  const resultado = cargado || legado;
  return {
    resultado, legado,
    // La etiqueta con la que se filtra y se cuenta: el resultado, o por qué no lo tiene.
    etiqueta: llamada.estado === 'descartada' ? 'Descartada'
      : resultado || SIN_CARGAR[llamada.estado] || 'Falta cargar',
  };
}

/** La clase de color de cada status: un color por estado, como en la lista de atv-mkt. */
export const claseStatus = (etiqueta) => `st-${clave(etiqueta) || 'faltacargar'}`;

/**
 * Guardar desde la fila. `lista` = false cuando quien mira no es el closer: el backend
 * devuelve solo "guardado" y la pantalla se recarga sola (`onGuardado` sin argumento).
 */
export function useLlamada(llamada, { estados, mes, lista = true, onGuardado }) {
  // Lo que se está eligiendo en la fila, antes de que vuelva el guardado.
  const [borrador, setBorrador] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const { resultado } = statusDe(llamada, estados);
  const v = {
    resultado, programa: llamada.programa || '', cashUsd: llamada.cashUsd ?? '',
    ...(borrador ?? {}),
  };
  const esVenta = VENTA.includes(v.resultado);
  const faltaPrograma = esVenta && !v.programa;

  const correr = async (fn) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fn();
      setBorrador(null);
      onGuardado(lista ? r : undefined);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const guardar = (cambios) => {
    const datos = { ...v, ...cambios };
    // Una venta sin programa la rechaza el servidor: la fila espera a que se elija uno.
    setBorrador(datos);
    if (VENTA.includes(datos.resultado) && !datos.programa) return;
    // Se mandan los datos que la llamada ya tiene: el servidor pisa cash, programa y nota
    // con lo que reciba, y cambiar el status no tiene por qué borrarlos.
    correr(() => guardarResultadoLlamada(llamada.id, {
      resultado: datos.resultado,
      programa: datos.programa,
      cashUsd: datos.cashUsd === '' ? 0 : Number(datos.cashUsd),
      nota: llamada.reporte || '',
      closer: llamada.closer || '',
      evento: llamada.eventoId || '',
      prospecto: llamada.prospecto || '',
    }, mes, { lista }));
  };

  return {
    v, esVenta, faltaPrograma, guardando, error,
    setBorrador,
    guardar,
    // Elegir status: los que no son venta limpian programa y cash, como en el servidor.
    elegir: (valor) => {
      if (!valor) { setBorrador(null); setError(null); return; }
      guardar({ resultado: valor, ...(VENTA.includes(valor) ? {} : { programa: '', cashUsd: '' }) });
    },
    // Quién tomó la llamada. Una llamada del calendario nace sin dueño, y hasta que
    // alguien lo diga no cuenta para nadie. Se puede asignar antes de que pase.
    asignar: (nombre) => correr(() => asignarCloserLlamada(llamada.id, nombre, mes, { lista })),
    borrar: (recuperar) => correr(() => descartarLlamada(llamada.id, { recuperar, mes, lista })),
  };
}

/** El selector de status, pintado con el color del estado que tiene. */
export function SelectStatus({ llamada, estados, f, compacto = false }) {
  const { legado, etiqueta } = statusDe(llamada, estados);
  return (
    <select
      className={`sel-status ${claseStatus(f.v.resultado || etiqueta)}${compacto ? ' compacto' : ''}`}
      value={f.v.resultado}
      disabled={f.guardando}
      aria-label={`Status de ${llamada.prospecto}`}
      onChange={(e) => f.elegir(e.target.value)}
    >
      <option value="">{SIN_CARGAR[llamada.estado] ?? 'Falta cargar'}</option>
      {legado && <option value={legado}>{legado}</option>}
      {estados.map((e) => <option key={e} value={e}>{e}</option>)}
    </select>
  );
}

/** El programa: solo se elige cuando la llamada es una venta. */
export function SelectPrograma({ programas, f }) {
  if (!f.esVenta) return <span className="dim">{f.v.programa || '—'}</span>;
  return (
    <select
      className={`sel-status${f.faltaPrograma ? ' st-faltacargar pendiente' : ''}`}
      value={f.v.programa}
      disabled={f.guardando}
      aria-label="Programa"
      onChange={(e) => f.guardar({ programa: e.target.value })}
    >
      <option value="">Elegí el programa</option>
      {programas.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
    </select>
  );
}

/** Quién tomó la llamada. Sin dueño no entra en los números de nadie. */
export function SelectCloser({ llamada, equipo, f }) {
  const actual = closerDe(llamada.closer, equipo);
  return (
    <select
      className={`sel-status sel-closer${actual ? '' : ' pendiente'}`}
      value={actual}
      disabled={f.guardando || llamada.estado === 'descartada'}
      aria-label={`Quién tomó la llamada de ${llamada.prospecto}`}
      onChange={(e) => f.asignar(e.target.value)}
    >
      <option value="">¿Quién la tomó?</option>
      {equipo.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

/** El cash de una venta, editable en la celda; se guarda al salir. */
export function CeldaCash({ llamada, f }) {
  if (!f.esVenta) return <span className="dim">—</span>;
  return (
    <input
      className="cash-celda num"
      type="number"
      inputMode="decimal"
      value={f.v.cashUsd}
      disabled={f.guardando}
      placeholder="0"
      aria-label={`Cash de ${llamada.prospecto}`}
      onChange={(e) => f.setBorrador({ ...f.v, cashUsd: e.target.value })}
      onBlur={(e) => (Number(e.target.value || 0) !== (llamada.cashUsd ?? 0)) && f.guardar({ cashUsd: e.target.value })}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
