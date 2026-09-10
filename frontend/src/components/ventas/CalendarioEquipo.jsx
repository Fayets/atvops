import { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatFecha, formatFechaHora } from '../../lib/format.js';

const ESTADO = {
  confirmado: { tone: 'ok', label: 'confirmó' },
  pendiente: { tone: 'plain', label: 'sin responder' },
  tentativo: { tone: 'warn', label: 'tal vez' },
  rechazado: { tone: 'alert', label: 'rechazó' },
  interno: { tone: 'off', label: 'interno' },
};

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

function inicioSemana(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lun=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function mismaFecha(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parseAt(iso) {
  return new Date(iso);
}

/**
 * Calendario del equipo: semana o mes con las llamadas reales del Google Calendar de ATV.
 * Avisa por `onRango` qué días está mostrando, para que la página traiga del calendario
 * ese rango y no queden días vacíos al navegar hacia atrás o hacia adelante.
 * `estados` trae, por id de evento, el resultado que el closer ya cargó: esas reuniones
 * quedan pintadas y con doble click se les edita el estado sin salir del calendario.
 * @param {{ llamados: object[], onSelect: (l: object) => void, sub?: string,
 *           actualizando?: boolean, onActualizar?: () => void,
 *           onRango?: (desde: string, hasta: string) => void,
 *           estados?: Record<string, object>, onEditar?: (l: object, estado: object) => void }} props
 */
export default function CalendarioEquipo({ llamados, onSelect, sub, actualizando, onActualizar, onRango,
                                           estados, onEditar }) {
  const [modo, setModo] = useState('semana');
  const [ancla, setAncla] = useState(() => new Date());

  const semana = useMemo(() => {
    const ini = inicioSemana(ancla);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ini);
      d.setDate(ini.getDate() + i);
      return d;
    });
  }, [ancla]);

  const mes = useMemo(() => {
    const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
    const ini = inicioSemana(primero);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(ini);
      d.setDate(ini.getDate() + i);
      return d;
    });
  }, [ancla]);

  const porDia = useMemo(() => {
    /** @type {Record<string, object[]>} */
    const map = {};
    for (const l of llamados) {
      const d = parseAt(l.fechaAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(l);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.fechaAt.localeCompare(b.fechaAt));
    }
    return map;
  }, [llamados]);

  const keyDe = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // Una reunión "cargada" es la que ya tiene resultado en el CRM: se pinta distinto.
  const estadoDe = (l) => estados?.[l.id];
  const clasesDe = (l) => {
    const e = estadoDe(l);
    if (!e) return '';
    return e.resultado ? ' cargada' : (e.estado === 'sin_crm' ? ' sin-crm' : '');
  };
  const abrirEditor = (l) => {
    const e = estadoDe(l);
    if (e && onEditar) onEditar(l, e);
  };

  // El rango visible, en fecha local, para pedirle al backend exactamente esos días.
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const visibles = modo === 'semana' ? semana : mes;
  const desde = iso(visibles[0]);
  const hasta = iso(visibles[visibles.length - 1]);
  useEffect(() => {
    onRango?.(desde, hasta);
  }, [desde, hasta, onRango]);

  const navegar = (dir) => {
    const n = new Date(ancla);
    if (modo === 'semana') n.setDate(n.getDate() + dir * 7);
    else n.setMonth(n.getMonth() + dir);
    setAncla(n);
  };

  const titulo =
    modo === 'semana'
      ? `${formatFecha(semana[0].toISOString())} – ${formatFecha(semana[6].toISOString())}`
      : ancla.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <Card
      className="ventas-cal-card"
      title="Calendario del equipo"
      sub={sub ?? 'Google Calendar de ATV'}
      actions={
        <div className="ventas-cal-actions">
          {onActualizar && (
            <button
              type="button"
              className={`btn sm recargar${actualizando ? ' girando' : ''}`}
              onClick={onActualizar}
              disabled={actualizando}
              aria-label="Actualizar"
            >
              ⟳
            </button>
          )}
          <button type="button" className="btn sm" onClick={() => navegar(-1)}>
            ‹
          </button>
          <button type="button" className="btn sm" onClick={() => setAncla(new Date())}>
            Hoy
          </button>
          <button type="button" className="btn sm" onClick={() => navegar(1)}>
            ›
          </button>
          <div className="tabs sm">
            <button type="button" className={`tab${modo === 'semana' ? ' active' : ''}`} onClick={() => setModo('semana')}>
              Semana
            </button>
            <button type="button" className={`tab${modo === 'mes' ? ' active' : ''}`} onClick={() => setModo('mes')}>
              Mes
            </button>
          </div>
        </div>
      }
      foot={titulo}
    >
      <div className={`ventas-cal-body${actualizando ? ' is-loading' : ''}`}>
        {modo === 'semana' ? (
          <div className="ventas-cal-semana">
            {semana.map((d) => {
              const items = porDia[keyDe(d)] ?? [];
              return (
                <div key={keyDe(d)} className="ventas-cal-dia">
                  <div className="ventas-cal-dia-head">
                    <span>{DIAS[(d.getDay() + 6) % 7]}</span>
                    <strong>{d.getDate()}</strong>
                  </div>
                  <div className="ventas-cal-eventos">
                    {items.length === 0 ? (
                      <div className="dim" style={{ fontSize: 11 }}>Sin llamadas</div>
                    ) : (
                      items.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          className={`ventas-cal-ev estado-${l.estado}${clasesDe(l)}`}
                          onClick={() => onSelect(l)}
                          onDoubleClick={() => abrirEditor(l)}
                          title={estadoDe(l)?.resultado
                            ? `${estadoDe(l).resultado} · doble click para cambiarlo`
                            : (estadoDe(l) ? 'Doble click para cargar el resultado' : undefined)}
                        >
                          <span className="hora">{l.todoElDia ? 'día' : formatFechaHora(l.fechaAt).split(', ')[1]}</span>
                          <span className="who">{l.prospecto}</span>
                          <span className="meta">
                            {estadoDe(l)?.resultado || `${l.oferta}${l.facturacion ? ` · ${l.facturacion}` : ''}`}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ventas-cal-mes">
            {DIAS.map((d) => (
              <div key={d} className="ventas-cal-mes-label">
                {d}
              </div>
            ))}
            {mes.map((d) => {
              const items = porDia[keyDe(d)] ?? [];
              const fuera = d.getMonth() !== ancla.getMonth();
              return (
                <div
                  key={keyDe(d)}
                  className={`ventas-cal-mes-celda${fuera ? ' fuera' : ''}${mismaFecha(d, ancla) ? ' hoy' : ''}`}
                >
                  <div className="num-dia">{d.getDate()}</div>
                  {items.slice(0, 3).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={`ventas-cal-ev mini estado-${l.estado}${clasesDe(l)}`}
                      onClick={() => onSelect(l)}
                      onDoubleClick={() => abrirEditor(l)}
                      title={`${l.prospecto} · ${estadoDe(l)?.resultado || l.oferta}`}
                    >
                      {l.prospecto.split(' ')[0]}
                    </button>
                  ))}
                  {items.length > 3 && <div className="dim" style={{ fontSize: 10 }}>+{items.length - 3}</div>}
                </div>
              );
            })}
          </div>
        )}

        {actualizando && (
          <div className="ventas-cal-loading" aria-live="polite" aria-busy="true">
            <div className="ventas-cal-loading-mark">
              <img src="/atv-logo.png" alt="" width={44} height={44} />
            </div>
            <span>Cargando calendario…</span>
          </div>
        )}
      </div>
    </Card>
  );
}

export { ESTADO };
