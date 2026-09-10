import { useState } from 'react';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';
import { descartarLlamada, guardarResultadoLlamada } from '../../data/api.js';

const VENTA = ['Cerrado', 'Seña'];
const TONO = {
  cierre: 'ok', show: 'plain', no_show: 'alert', sin_reportar: 'warn', agendado: 'off', descartada: 'off',
  sin_crm: 'off',
};
// El color del estado elegido: verde si vendió, rojo si se cayó, ámbar si sigue vivo.
const TONO_ESTADO = {
  Cerrado: 'ok', 'Seña': 'ok',
  Seguimiento: 'warn', 'Re-agenda': 'warn', Agendado: 'warn',
  'No show': 'alert', Descalificado: 'alert', Cancelada: 'alert', Descartada: 'alert',
};
const LABEL = {
  cierre: 'venta', show: 'reportada', no_show: 'no show', sin_reportar: 'falta cargar',
  agendado: 'agendada', descartada: 'descartada', sin_crm: 'solo en el calendario',
};

// El CRM guarda el resultado en minúscula y a veces sin tilde ("sena", "reagenda"),
// así que se compara sin tildes ni separadores para encontrar el estado que le corresponde.
const _clave = (t) => (t ?? '').toString().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const canonico = (valor, estados) => estados.find((e) => _clave(e) === _clave(valor)) ?? '';

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const dia = (iso) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Formulario de una llamada: qué pasó, qué compró y cuánto dejó. */
export function FormResultado({ llamada, programas, estados, onGuardado, onCerrar, mes, sinLista }) {
  const [resultado, setResultado] = useState(canonico(llamada.resultado, estados));
  const [programa, setPrograma] = useState(llamada.programa || '');
  const [cash, setCash] = useState(llamada.cashUsd || '');
  const [nota, setNota] = useState(llamada.reporte || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const esVenta = VENTA.includes(resultado);
  const precio = programas.find((p) => p.nombre === programa)?.precioUsd ?? 0;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      // El saldo no se pide: lo que quedó debiendo se ve en Cobranza, no acá.
      // El evento viaja para dejar atada la reunión a esta llamada del CRM.
      onGuardado(await guardarResultadoLlamada(llamada.id, {
        resultado, programa, cashUsd: cash === '' ? 0 : Number(cash), nota,
        evento: llamada.eventoId || '', prospecto: llamada.prospecto || '',
      }, mes, { lista: !sinLista }));
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <div className="llamada-form">
      <div className="llamada-estados">
        {estados.map((e) => (
          <button
            key={e}
            type="button"
            className={`btn sm estado-chip${resultado === e ? ` elegido ${TONO_ESTADO[e] ?? 'plain'}` : ''}`}
            onClick={() => setResultado(e)}
          >
            {e}
          </button>
        ))}
      </div>

      {esVenta && (
        <div className="llamada-venta">
          <label className="campo">
            <span>Programa</span>
            <select value={programa} onChange={(e) => setPrograma(e.target.value)}>
              <option value="">Elegí uno</option>
              {programas.map((p) => (
                <option key={p.id} value={p.nombre}>{p.nombre} · {formatValue(p.precioUsd, 'usd')}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Cash cobrado (USD)</span>
            <input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
          </label>
          {precio > 0 && (
            <div className="llamada-precio dim">
              Facturación {formatValue(precio, 'usd')}
              {cash !== '' && Number(cash) !== precio
                ? ` · quedan ${formatValue(Math.max(precio - Number(cash), 0), 'usd')} por cobrar`
                : ''}
            </div>
          )}
        </div>
      )}

      <label className="campo">
        <span>Nota de la llamada</span>
        <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué pasó, objeción, próximo paso" />
      </label>

      {error && <div className="ronda-evento error">{error}</div>}

      <div className="llamada-acciones">
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn primary" onClick={guardar} disabled={guardando || !resultado}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

/** Sacar una llamada de la lista, y devolverla si fue sin querer. */
function Borrar({ llamada, onGuardado, mes }) {
  const [confirmando, setConfirmando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const descartada = llamada.estado === 'descartada';

  const mandar = async (recuperar) => {
    setTrabajando(true);
    setError(null);
    try {
      onGuardado(await descartarLlamada(llamada.id, { recuperar, mes }));
    } catch (e) {
      setError(e.message);
      setTrabajando(false);
      setConfirmando(false);
    }
  };

  if (descartada) {
    return (
      <button className="btn sm" onClick={() => mandar(true)} disabled={trabajando} title="Volver a la lista">
        {trabajando ? '…' : 'Recuperar'}
      </button>
    );
  }
  if (!confirmando) {
    return (
      <button className="btn sm ghost" onClick={() => setConfirmando(true)} title="Sacarla de la lista y de las métricas">
        Borrar
      </button>
    );
  }
  return (
    <span className="llamada-confirmar">
      <span className="dim">{error || '¿La borro?'}</span>
      <button className="btn sm alerta" onClick={() => mandar(false)} disabled={trabajando}>
        {trabajando ? 'Borrando…' : 'Sí'}
      </button>
      <button className="btn sm" onClick={() => setConfirmando(false)} disabled={trabajando}>No</button>
    </span>
  );
}

function Llamada({ llamada, programas, estados, abierta, onAbrir, onCerrar, onGuardado, mes }) {
  // Si el closer ya cargó un estado, se muestra ese; si no, en qué situación está la llamada.
  // Reunión que está en el calendario y el CRM no tiene: se muestra para que cuente en el
  // mes, pero no se le puede cargar resultado porque no hay dónde guardarlo.
  const soloCalendario = llamada.estado === 'sin_crm';
  const cargado = canonico(llamada.resultado, estados);
  const etiqueta = cargado || LABEL[llamada.estado] || llamada.estado;
  const tono = llamada.estado === 'descartada'
    ? 'off'
    : (cargado ? (TONO_ESTADO[cargado] ?? 'plain') : (TONO[llamada.estado] ?? 'plain'));
  return (
    <div className={`llamada${abierta ? ' abierta' : ''}`}>
      <div className="llamada-cab">
        <div className="llamada-cuando num">
          <div>{hora(llamada.fechaAt)}</div>
          <div className="dim">{dia(llamada.fechaAt)}</div>
        </div>
        <div className="llamada-quien">
          <div className="strong">{llamada.prospecto}</div>
          <div className="dim">
            {soloCalendario
              ? `${llamada.segunda ? 'Segunda reunión' : 'Reunión'} del calendario · se crea en el CRM al cargarle el resultado`
              : ([llamada.segunda && 'segunda reunión', llamada.facturaHoy && `factura ${llamada.facturaHoy}`,
                  llamada.origen, llamada.setter && `set por ${llamada.setter}`]
                  .filter(Boolean).join(' · ') || 'Sin datos')}
          </div>
          {llamada.estado === 'cierre' && (
            <div className="llamada-venta-resumen">
              {llamada.programa || 'Sin programa'} · cash {formatValue(llamada.cashUsd, 'usd')}
              {llamada.saldoUsd > 0 ? ` · debe ${formatValue(llamada.saldoUsd, 'usd')}` : ''}
              {llamada.facturacionUsd > 0 ? ` · factura ${formatValue(llamada.facturacionUsd, 'usd')}` : ''}
            </div>
          )}
        </div>
        <div className="llamada-derecha">
          <Pill tone={tono} dot>{etiqueta}</Pill>
          {llamada.estado !== 'descartada' && (
            <button className="btn sm" onClick={abierta ? onCerrar : onAbrir}>
              {abierta ? 'Cerrar' : (!llamada.resultado || soloCalendario || llamada.estado === 'sin_reportar') ? 'Cargar' : 'Editar'}
            </button>
          )}
          <Borrar llamada={llamada} onGuardado={onGuardado} mes={mes} />
        </div>
      </div>
      {abierta && (
        <FormResultado
          llamada={llamada}
          programas={programas}
          estados={estados}
          onGuardado={onGuardado}
          onCerrar={onCerrar}
          mes={mes}
        />
      )}
    </div>
  );
}


/** Lista de llamadas con su resultado, editable fila por fila. */
export default function ListaLlamadas({ llamadas, programas, estados, onActualizado, mes }) {
  const [abierta, setAbierta] = useState(null);
  if (!llamadas.length) return <div className="empty">No hay llamadas para mostrar.</div>;
  return (
    <div className="llamadas">
      {llamadas.map((l) => (
        <Llamada
          key={l.id}
          llamada={l}
          programas={programas}
          estados={estados}
          abierta={abierta === l.id}
          onAbrir={() => setAbierta(l.id)}
          onCerrar={() => setAbierta(null)}
          onGuardado={(nuevo) => { setAbierta(null); onActualizado(nuevo); }}
          mes={mes}
        />
      ))}
    </div>
  );
}
