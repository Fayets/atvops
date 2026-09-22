import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
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
 *           estados?: Record<string, object>, onEditar?: (l: object, estado: object) => void,
 *           onOcultar?: (l: object) => void, ocultos?: Record<string, boolean>,
 }} props
 */
export default function CalendarioEquipo({ llamados, onSelect, sub, actualizando, onActualizar, onRango,
                                           estados, onEditar, onAgregar, onOcultar, onMostrar, ocultos }) {
  const [modo, setModo] = useState('semana');
  const [verOcultas, setVerOcultas] = useState(false);
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
      if (ocultos?.[l.id]) continue;   // el equipo la sacó del calendario
      const d = parseAt(l.fechaAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(l);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => a.fechaAt.localeCompare(b.fechaAt));
    }
    return map;
  }, [llamados, ocultos]);

  const keyDe = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // Cada reunión se pinta según lo que le pasó: celeste la que ya tiene resultado
  // cargado, roja la descartada (no cuenta para las agendas), punteada la que todavía
  // no está en el CRM.
  const estadoDe = (l) => estados?.[l.id];
  const clasesDe = (l) => {
    const e = estadoDe(l);
    if (!e) return '';
    if (e.estado === 'descartada') return ' descartada';
    if (e.resultado) return ' cargada';
    return e.estado === 'sin_crm' ? ' sin-crm' : '';
  };

  // Número de agenda del mes, contado sobre lo que el calendario muestra.
  //
  // Antes venía de la lista de llamadas del closer y se buscaba por cinco claves
  // distintas. Las dos listas no son la misma —el calendario es del equipo y tiene
  // reuniones que no están en el CRM— así que el correlativo salía con agujeros (faltaba
  // la 21) y había tarjetas sin número (la de Víctor). Un contador que saltea no se puede
  // leer: si el número está, tiene que ser la posición real entre lo que se ve.
  //
  // Se numera exactamente lo que se pinta como agenda: fuera las ocultas y las
  // descartadas, que la propia tarjeta marca como que no cuentan.
  // Los días que se están dibujando, que es sobre lo que se cuenta.
  const visibles = modo === 'semana' ? semana : mes;

  // El número de agenda lo pone el servidor, que tiene el mes entero. Calcularlo acá
  // con lo que está cargado hacía que el mismo prospecto cambiara de número según qué
  // semana estuvieras mirando, y que quedaran saltos.
  const numeroDe = (l) => estadoDe(l)?.numeroAgenda ?? null;
  // Un click abre el detalle y dos abren el editor, así que el simple espera un momento
  // para no dispararse también cuando en realidad fue doble click.
  const clickPendiente = useRef(null);
  const cancelarClick = () => {
    if (clickPendiente.current) {
      clearTimeout(clickPendiente.current);
      clickPendiente.current = null;
    }
  };
  useEffect(() => cancelarClick, []);

  const alClick = (l) => {
    cancelarClick();
    clickPendiente.current = setTimeout(() => {
      clickPendiente.current = null;
      onSelect(l);
    }, 230);
  };
  const abrirEditor = (l) => {
    cancelarClick();
    const e = estadoDe(l);
    // Una reunión que no es de venta (un 1a1, una weekly) no tiene resultado que cargar:
    // lo único que se puede hacer con ella es dejar de verla en el calendario.
    if (e) onEditar?.(l, e);
    else onOcultar?.(l);
  };

  // Pedimos desde el 1° del mes más temprano visible: el contador de agendas
  // es del mes entero, no solo de la semana en pantalla.
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Se pide el mes entero, no hasta el último día visible: el número de agenda lo calcula
  // el servidor sobre el mes, y si acá falta la última semana, las reuniones que ya tienen
  // número no llegan y el correlativo se ve con saltos.
  const inicioMesVisible = new Date(visibles[0].getFullYear(), visibles[0].getMonth(), 1);
  const ultimoVisible = visibles[visibles.length - 1];
  const finMesVisible = new Date(ultimoVisible.getFullYear(), ultimoVisible.getMonth() + 1, 0);
  const desde = iso(inicioMesVisible);
  const hasta = iso(finMesVisible);
  useEffect(() => {
    onRango?.(desde, hasta);
  }, [desde, hasta, onRango]);

  // TODAS las que el equipo sacó del calendario, no solo las de la semana que se está
  // mirando: una reunión ocultada por error en marzo es imposible de encontrar si hay
  // que adivinar en qué semana estaba. Si no se pudieran devolver, un doble click de
  // más las escondería para siempre.
  const escondidas = Object.entries(ocultos ?? {})
    .map(([id, datos]) => ({
      id,
      prospecto: datos?.prospecto || llamados?.find((l) => l.id === id)?.prospecto || 'Sin nombre',
      fechaAt: datos?.inicioAt || llamados?.find((l) => l.id === id)?.fechaAt || null,
    }))
    .sort((a, b) => (b.fechaAt ?? '').localeCompare(a.fechaAt ?? ''));


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
          {onAgregar && (
            <button type="button" className="btn sm" onClick={onAgregar} title="Cargar una reunión que no está en el calendario">
              + Reunión
            </button>
          )}
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
      foot={
        <span className="cal-pie">
          <span>{titulo}</span>
          {/* Las ocultas no van desplegadas en el pie: son ruido permanente para algo
              que se toca una vez cada tanto. Viven detrás del engranaje. */}
          {escondidas.length > 0 && (
            <button
              type="button"
              className={`cal-ajustes${verOcultas ? ' abierto' : ''}`}
              onClick={() => setVerOcultas((v) => !v)}
              aria-expanded={verOcultas}
              title={`${escondidas.length} ${escondidas.length === 1 ? 'reunión oculta' : 'reuniones ocultas'}`}
            >
              <Icon name="config" />
              <span>{escondidas.length}</span>
            </button>
          )}
        </span>
      }
    >
      {verOcultas && (
        <div className="cal-ocultas-panel">
          <div className="cal-ocultas-head">
            <strong>Reuniones ocultas</strong>
            <span className="dim">No cuentan en ninguna métrica. Tocá una para devolverla al calendario.</span>
          </div>
          {escondidas.map((l) => (
            <div key={l.id} className="cal-oculta-fila">
              <span className="cal-oculta-nombre">{l.prospecto}</span>
              <span className="dim">{l.fechaAt ? formatFecha(l.fechaAt) : 'sin fecha'}</span>
              <button type="button" className="btn sm" onClick={() => onMostrar?.(l)}>Devolver</button>
            </div>
          ))}
        </div>
      )}
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
                      items.map((l) => {
                        const n = numeroDe(l);
                        return (
                        <button
                          key={l.id}
                          type="button"
                          className={`ventas-cal-ev estado-${l.estado}${clasesDe(l)}`}
                          onClick={() => alClick(l)}
                          onDoubleClick={() => abrirEditor(l)}
                          title={estadoDe(l)?.estado === 'descartada'
                            ? 'Descartada · no cuenta para las agendas. Doble click para recuperarla'
                            : (estadoDe(l)?.estado === 'reprogramada'
                              ? 'Reprogramada el mismo día · cuenta en agendas, no en no-show'
                              : (estadoDe(l)?.resultado
                              ? `${estadoDe(l).resultado} · doble click para cambiarlo`
                              : (estadoDe(l)
                                ? 'Doble click para cargar el resultado'
                                : 'No es una llamada de venta · doble click para sacarla del calendario')))}
                        >
                          <span className="hora">{l.todoElDia ? 'día' : formatFechaHora(l.fechaAt).split(', ')[1]}</span>
                          {n != null && (
                            <span className="num-agenda" aria-label={`Agenda ${n} del mes`}>{n}</span>
                          )}
                          <span className="who">{l.prospecto}</span>
                          <span className="meta">
                            {estadoDe(l)?.estado === 'descartada'
                              ? 'descartada · no cuenta'
                              : (estadoDe(l)?.estado === 'reprogramada'
                                ? 'reprogramada'
                                : (estadoDe(l)?.resultado || `${l.oferta}${l.facturacion ? ` · ${l.facturacion}` : ''}`))}
                          </span>
                        </button>
                        );
                      })
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
                  {items.slice(0, 3).map((l) => {
                    const n = numeroDe(l);
                    return (
                    <button
                      key={l.id}
                      type="button"
                      className={`ventas-cal-ev mini estado-${l.estado}${clasesDe(l)}`}
                      onClick={() => alClick(l)}
                      onDoubleClick={() => abrirEditor(l)}
                      title={`${n != null ? `#${n} · ` : ''}${l.prospecto} · ${estadoDe(l)?.resultado || l.oferta}`}
                    >
                      {n != null && <span className="num-agenda">{n}</span>}
                      {l.prospecto.split(' ')[0]}
                    </button>
                    );
                  })}
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
