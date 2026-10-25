import { useState } from 'react';
import { FormResultado } from './ListaLlamadas.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';
import { descartarLlamada, guardarResultadoLlamada } from '../../data/api.js';

/**
 * Las llamadas del closer en una tabla, con el estado editable en la misma fila.
 *
 * Antes había que abrir cada tarjeta para cambiar un resultado. Acá el selector está en
 * la fila: elegir el estado lo guarda. La única parada es la venta, que no se puede
 * guardar sin programa: ahí la fila espera a que se elija uno.
 */

const VENTA = ['Cerrado', 'Seña'];
const TONO_ESTADO = {
  Cerrado: 'ok', 'Seña': 'ok',
  Seguimiento: 'warn', 'Re-agenda': 'warn', Agendado: 'warn',
  'No tiene la plata': 'warn', 'Lo voy a pensar': 'warn',
  'No show': 'alert', 'No contesta': 'alert', Descalificado: 'alert', Cancelada: 'alert', Descartada: 'alert',
};
// Qué le pasa a la llamada cuando el closer todavía no cargó nada.
const SIN_CARGAR = {
  agendado: 'Por venir', sin_reportar: 'Falta cargar', sin_crm: 'Falta cargar', descartada: 'Descartada',
};

// El CRM guarda el resultado en minúscula y a veces sin tilde ("sena", "reagenda"): se
// compara sin tildes ni separadores para encontrar el estado que le corresponde.
const _clave = (t) => (t ?? '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const canonico = (valor, estados) => estados.find((e) => _clave(e) === _clave(valor)) ?? '';
// El tono de un resultado, también de los que ya no se pueden elegir: el CRM los guarda
// en minúscula ("no contesta") y la tabla tiene que pintarlos como el backend los cuenta.
const tonoDe = (texto) => {
  const k = _clave(texto);
  return Object.keys(TONO_ESTADO).find((e) => _clave(e) === k);
};
const conMayuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

const cuando = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

function Fila({ llamada, programas, estados, equipo, abierta, onAbrir, onCerrar, onGuardado, mes }) {
  // Lo que el closer está eligiendo en la fila, antes de que el guardado vuelva.
  const [borrador, setBorrador] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const cargado = canonico(llamada.resultado, estados);
  // Un resultado que ya no se puede elegir pero que la llamada tiene cargado —"No
  // contesta", "No tiene la plata"— se sigue mostrando: el backend lo cuenta como no show
  // o como show, y dejarlo en "Falta cargar" haría que la fila contradiga a las métricas.
  // No vale para "agendado", que el backend ya clasifica como sin cargar.
  const legado = (!cargado && (llamada.resultado || '').trim()
    && !['sin_reportar', 'agendado', 'sin_crm'].includes(llamada.estado))
    ? llamada.resultado.trim() : '';
  const v = {
    resultado: cargado || legado, programa: llamada.programa || '', cashUsd: llamada.cashUsd ?? '',
    ...(borrador ?? {}),
  };
  const esVenta = VENTA.includes(v.resultado);
  const faltaPrograma = esVenta && !v.programa;
  const descartada = llamada.estado === 'descartada';

  const guardar = async (cambios) => {
    const datos = { ...v, ...cambios };
    // Una venta sin programa la rechaza el servidor: la fila espera a que se elija uno.
    if (VENTA.includes(datos.resultado) && !datos.programa) { setBorrador(datos); return; }
    setBorrador(datos);
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await guardarResultadoLlamada(llamada.id, {
        resultado: datos.resultado,
        programa: datos.programa,
        cashUsd: datos.cashUsd === '' ? 0 : Number(datos.cashUsd),
        nota: llamada.reporte || '',
        closer: llamada.closer || '',
        evento: llamada.eventoId || '',
        prospecto: llamada.prospecto || '',
      }, mes));
      setBorrador(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (recuperar) => {
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await descartarLlamada(llamada.id, { recuperar, mes }));
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  const tono = TONO_ESTADO[tonoDe(cargado || legado)] ?? (cargado || legado ? 'plain' : 'off');

  return (
    <>
      <tr className={`llamada-fila${descartada ? ' descartada' : ''}${abierta ? ' abierta' : ''}`}>
        <td className="dim">{cuando(llamada.fechaAt)}</td>
        <td className="strong">
          {llamada.prospecto}
          {llamada.segunda && <span className="llamada-segunda dim"> · 2ª</span>}
        </td>
        <td>
          {descartada ? (
            <Pill tone="off" dot>descartada</Pill>
          ) : (
            <select
              className={`sel-estado${cargado || legado ? ` ${tono}` : ''}${!cargado && !legado && SIN_CARGAR[llamada.estado] === 'Falta cargar' ? ' pendiente' : ''}`}
              value={v.resultado}
              disabled={guardando}
              onChange={(e) => {
                // Volver a la opción de arriba no es un resultado: el servidor la rechaza.
                if (!e.target.value) { setBorrador(null); setError(null); return; }
                guardar({ resultado: e.target.value, ...(VENTA.includes(e.target.value) ? {} : { programa: '', cashUsd: '' }) });
              }}
            >
              <option value="">{SIN_CARGAR[llamada.estado] ?? 'Falta cargar'}</option>
              {legado && <option value={legado}>{conMayuscula(legado)}</option>}
              {estados.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
        </td>
        <td>
          {esVenta ? (
            <select
              className={`sel-estado${faltaPrograma ? ' pendiente' : ''}`}
              value={v.programa}
              disabled={guardando}
              onChange={(e) => guardar({ programa: e.target.value })}
            >
              <option value="">Elegí el programa</option>
              {programas.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>
          ) : <span className="dim">—</span>}
        </td>
        <td className="right">
          {esVenta ? (
            <input
              className="cash-celda num"
              type="number"
              inputMode="decimal"
              value={v.cashUsd}
              disabled={guardando}
              placeholder="0"
              aria-label="Cash cobrado"
              onChange={(e) => setBorrador({ ...v, cashUsd: e.target.value })}
              onBlur={(e) => (Number(e.target.value || 0) !== (llamada.cashUsd ?? 0)) && guardar({ cashUsd: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : <span className="dim">—</span>}
        </td>
        <td>
          {/* Fathom en vez del setter: casi ninguna llamada lo tiene cargado y la
              grabación es lo que el closer abre para escucharse. */}
          {llamada.fathomUrl
            ? <a className="link-fathom" href={llamada.fathomUrl} target="_blank" rel="noreferrer">Escuchar</a>
            : <span className="dim">—</span>}
        </td>
        <td className="right">
          <span className="llamada-acciones-fila">
            {guardando && <span className="dim">guardando…</span>}
            {!descartada && (
              <button className="btn sm" onClick={abierta ? onCerrar : onAbrir}>
                {abierta ? 'Cerrar' : 'Ficha'}
              </button>
            )}
            <button className="btn sm ghost" onClick={() => borrar(descartada)} disabled={guardando}>
              {descartada ? 'Recuperar' : 'Borrar'}
            </button>
          </span>
        </td>
      </tr>
      {(error || faltaPrograma) && (
        <tr className="llamada-aviso">
          <td colSpan={7}>
            <span className={error ? 'ronda-evento error' : 'dim'}>
              {error || 'Elegí el programa para guardar la venta.'}
            </span>
          </td>
        </tr>
      )}
      {abierta && (
        <tr className="llamada-ficha">
          <td colSpan={7}>
            <div className="llamada-detalle dim">
              {[llamada.soloCalendario && 'solo en el calendario', llamada.segunda && 'segunda reunión',
                llamada.facturaHoy && `factura ${llamada.facturaHoy}`, llamada.origen,
                llamada.setter && `set por ${llamada.setter}`,
                llamada.saldoUsd > 0 && `debe ${formatValue(llamada.saldoUsd, 'usd')}`]
                .filter(Boolean).join(' · ') || 'Sin datos'}
            </div>
            <FormResultado
              llamada={llamada}
              programas={programas}
              estados={estados}
              equipo={equipo}
              onGuardado={onGuardado}
              onCerrar={onCerrar}
              mes={mes}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** Tabla de llamadas: una fila por reunión, el estado se cambia sin abrir nada. */
export default function TablaLlamadas({ llamadas, programas, estados, equipo = [], onActualizado, mes }) {
  const [abierta, setAbierta] = useState(null);
  if (!llamadas.length) return <div className="empty">No hay llamadas para mostrar.</div>;
  return (
    <div className="table-wrap">
      <table className="data tabla-llamadas">
        <thead>
          <tr>
            <th>Cuándo</th>
            <th>Prospecto</th>
            <th>Estado</th>
            <th>Programa</th>
            <th className="right">Cash</th>
            <th>Fathom</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {llamadas.map((l) => (
            <Fila
              key={l.id}
              llamada={l}
              programas={programas}
              estados={estados}
              equipo={equipo}
              abierta={abierta === l.id}
              onAbrir={() => setAbierta(l.id)}
              onCerrar={() => setAbierta(null)}
              onGuardado={(nuevo) => { setAbierta(null); onActualizado(nuevo); }}
              mes={mes}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
