import { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../ui/Loading.jsx';
import { getMisReportes, guardarReporteDia } from '../../data/api.js';

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const mesLargo = (mes) =>
  new Date(`${mes}-01T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
const diaLargo = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Formulario del día: los números que carga el setter en su reporte. */
function FormDia({ dia, campos, rol, onGuardado, onCerrar }) {
  const [valores, setValores] = useState(() =>
    Object.fromEntries(campos.map((c) => [c.id, dia.valores?.[c.id] || ''])),
  );
  const [nota, setNota] = useState(dia.nota ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await guardarReporteDia(dia.fecha, { ...valores, nota }, rol));
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card reporte-dia" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Reporte del ${dia.fecha}`}>
        <header>
          <div>
            <h3>{diaLargo(dia.fecha)}</h3>
            <p className="dim">{dia.cargado ? 'Ya cargado: podés corregirlo.' : 'Cargá lo que hiciste ese día.'}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>

        <div className="reporte-campos">
          {campos.map((c) => (
            <label key={c.id} className="campo">
              <span>{c.label}</span>
              <input
                type="number"
                inputMode="numeric"
                value={valores[c.id]}
                onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
                placeholder="0"
              />
            </label>
          ))}
        </div>

        <label className="campo">
          <span>Cómo estuvo el día (opcional)</span>
          <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué funcionó, qué no, algo para recordar" />
        </label>

        {error && <div className="pendiente-error">{error}</div>}

        <button className="btn primary" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar el día'}
        </button>
      </div>
    </div>
  );
}

/**
 * Calendario de reportes: cada día sin cargar sale en rojo y al tocarlo se completa;
 * cuando queda cargado, se pone en verde.
 */
export default function CalendarioReportes({ rol = 'setter', mes: mesInicial }) {
  const [mes, setMes] = useState(mesInicial ?? new Date().toISOString().slice(0, 7));
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(null);

  const traer = (m) => {
    // Se marca cargando siempre: la grilla sigue visible y el botón gira mientras trae.
    setCargando(true);
    return getMisReportes({ mes: m, rol })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    let vivo = true;
    getMisReportes({ mes, rol })
      .then((d) => vivo && setData(d))
      .catch((e) => vivo && setError(e))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [mes, rol]);

  const celdas = useMemo(() => {
    if (!data?.dias?.length) return [];
    const primero = new Date(`${data.dias[0].fecha}T12:00:00`);
    const huecos = (primero.getDay() + 6) % 7;
    return [...Array(huecos).fill(null), ...data.dias];
  }, [data]);

  const moverMes = (dir) => {
    const d = new Date(`${mes}-01T12:00:00`);
    d.setMonth(d.getMonth() + dir);
    setMes(d.toISOString().slice(0, 7));
  };

  if (error) {
    return <Card title="Mis reportes"><ErrorState error={error} /></Card>;
  }

  const faltan = data?.resumen?.faltan ?? 0;

  return (
    <Card
      className="reportes-card"
      title="Mis reportes"
      sub={
        data?.miembro
          ? `${data.resumen.cargados} días cargados · ${faltan} sin cargar en ${mesLargo(mes)}`
          : (data?.detalle ?? 'Cargando…')
      }
      actions={
        <div className="ventas-cal-actions">
          <button type="button" className="btn sm" onClick={() => moverMes(-1)} aria-label="Mes anterior">‹</button>
          <button type="button" className="btn sm" onClick={() => setMes(new Date().toISOString().slice(0, 7))}>Hoy</button>
          <button type="button" className="btn sm" onClick={() => moverMes(1)} aria-label="Mes siguiente">›</button>
          <button
            type="button"
            className={`btn sm recargar${cargando ? ' girando' : ''}`}
            onClick={() => traer(mes)}
            aria-label="Actualizar"
          >
            ⟳
          </button>
        </div>
      }
      foot={
        !data?.miembro
          ? undefined
          : faltan > 0
            ? 'Los días en rojo todavía no tienen reporte: tocá uno para completarlo.'
            : 'Estás al día.'
      }
    >
      {cargando && !data ? (
        <SkeletonBlock height={260} />
      ) : !data?.miembro ? (
        <div className="empty">{data?.detalle}</div>
      ) : (
        <div className="reportes-grilla">
          {DIAS.map((d) => <div key={d} className="reportes-label">{d}</div>)}
          {celdas.map((dia, i) =>
            dia === null ? (
              <div key={`hueco-${i}`} className="reportes-dia vacio" />
            ) : (
              <button
                key={dia.fecha}
                type="button"
                className={`reportes-dia${dia.futuro ? ' futuro' : dia.cargado ? ' cargado' : ' falta'}${dia.hoy ? ' hoy' : ''}`}
                onClick={() => !dia.futuro && setAbierto(dia)}
                disabled={dia.futuro}
                title={dia.futuro ? 'Todavía no pasó' : dia.cargado ? 'Cargado, tocá para corregir' : 'Falta cargar'}
              >
                <span className="reportes-num">{Number(dia.fecha.slice(8))}</span>
                {!dia.futuro && <span className="reportes-dato">{dia.cargado ? dia.total : '—'}</span>}
              </button>
            ),
          )}
        </div>
      )}

      {abierto && (
        <FormDia
          dia={abierto}
          campos={data.campos}
          rol={rol}
          onGuardado={(nuevo) => { setData(nuevo); setAbierto(null); }}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </Card>
  );
}
