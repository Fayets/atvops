import { useMemo, useState } from 'react';
import CalendarioEquipo, { ESTADO } from './CalendarioEquipo.jsx';
import DetalleLlamada from './DetalleLlamada.jsx';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatFecha, formatFechaHora, formatValue, hace } from '../../lib/format.js';

const REPORTE_TONE = {
  completado: 'ok',
  pendiente: 'warn',
  vencido: 'alert',
};

const EVENTO_TONE = {
  cierre: 'alert',
  show: 'ok',
  no_show: 'warn',
  agendado: 'plain',
  perdido: 'off',
  reporte: 'ok',
};

const EVENTO_TIPOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'cierre', label: 'Cierre' },
  { value: 'show', label: 'Show' },
  { value: 'no_show', label: 'No show' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'perdido', label: 'Perdido' },
];

function urgenciaFollow(dias) {
  if (dias < 3) return 'ok';
  if (dias <= 7) return 'warn';
  return 'alert';
}

/**
 * Vista operativa día a día del Director de Ventas.
 * @param {{ data: object }} props
 */
export default function VentasOperativa({ data, agenda, agendaError, actualizando, onActualizar }) {
  const [detalle, setDetalle] = useState(null);
  const [filtroEvento, setFiltroEvento] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const llamados = agenda?.llamados ?? [];

  const pipeline = useMemo(() => {
    const ahora = new Date();
    const hasta = new Date(ahora);
    hasta.setDate(hasta.getDate() + 7);
    return llamados
      .filter((l) => {
        const t = new Date(l.fechaAt);
        return t >= ahora && t <= hasta && l.estado !== 'rechazado';
      })
      .filter((l) => filtroTipo === 'todos' || l.oferta === filtroTipo)
      .sort((a, b) => a.fechaAt.localeCompare(b.fechaAt));
  }, [llamados, filtroTipo]);

  const actividad = useMemo(() => {
    const list = [...(data.actividad ?? [])].sort((a, b) => b.at.localeCompare(a.at));
    if (filtroEvento === 'todos') return list;
    return list.filter((e) => e.tipo === filtroEvento);
  }, [data.actividad, filtroEvento]);

  const followUps = useMemo(
    () => [...(data.followUps ?? [])].sort((a, b) => b.diasSinContacto - a.diasSinContacto),
    [data.followUps],
  );

  const tiposUnicos = useMemo(
    () => [...new Set(llamados.map((l) => l.oferta).filter(Boolean))].sort(),
    [llamados],
  );

  return (
    <div className="ventas-operativa">
      {agendaError ? (
        <Card title="Calendario del equipo" sub="Google Calendar de ATV">
          <div className="empty">{agendaError.message}</div>
        </Card>
      ) : (
        <CalendarioEquipo
          llamados={llamados}
          onSelect={setDetalle}
          sub={agenda
            ? `${agenda.calendarId} · ${llamados.length} eventos entre ${agenda.desde} y ${agenda.hasta}`
            : 'Cargando el Google Calendar de ATV…'}
          actualizando={actualizando}
          onActualizar={onActualizar}
        />
      )}

      <div className="split even">
        <Card title="Reportes de Closers" sub="Estado del reporte diario" flush>
          {(data.reportesClosers ?? []).map((r) => (
            <div key={r.id} className="lista-item ventas-reporte">
              <Pill tone={REPORTE_TONE[r.estado]} dot>
                {r.estado}
              </Pill>
              <span className="who">{r.nombre}</span>
              <span className="q">
                {r.metricas.llamadas} llam · {r.metricas.shows} shows · {r.metricas.cierres} cierres ·{' '}
                {formatValue(r.metricas.cashUsd, 'usd')}
              </span>
              <span className="right dim" style={{ fontSize: 12 }}>
                {hace(r.actualizadoAt, new Date('2026-09-09T19:00:00-03:00'))}
              </span>
            </div>
          ))}
        </Card>

        <Card title="Reportes de Setters" sub="Estado del reporte diario" flush>
          {(data.reportesSetters ?? []).map((r) => (
            <div key={r.id} className="lista-item ventas-reporte">
              <Pill tone={REPORTE_TONE[r.estado]} dot>
                {r.estado}
              </Pill>
              <span className="who">{r.nombre}</span>
              <span className="q">
                {r.metricas.conversaciones} conv · {r.metricas.aplicaciones} apps · {r.metricas.agendadas}{' '}
                agendadas
              </span>
              <span className="right dim" style={{ fontSize: 12 }}>
                {hace(r.actualizadoAt, new Date('2026-09-09T19:00:00-03:00'))}
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div className="split">
        <Card
          title="Actividad en tiempo real"
          sub="Feed del día"
          actions={
            <select
              className="select sm"
              value={filtroEvento}
              onChange={(e) => setFiltroEvento(e.target.value)}
              aria-label="Filtrar eventos"
            >
              {EVENTO_TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          }
          flush
        >
          {actividad.length === 0 ? (
            <div className="empty">Sin eventos con ese filtro.</div>
          ) : (
            actividad.map((e) => (
              <div key={e.id} className="lista-item ventas-feed">
                <Pill tone={EVENTO_TONE[e.tipo] ?? 'plain'} dot>
                  {e.tipo.replace('_', ' ')}
                </Pill>
                <span className="q">{e.texto}</span>
                <span className="right dim" style={{ fontSize: 11 }}>
                  {formatFechaHora(e.at).split(', ')[1] || formatFechaHora(e.at)}
                </span>
              </div>
            ))
          )}
        </Card>

        <Card
          title="Pipeline · próximos 7 días"
          sub="Llamadas agendadas en el calendario"
          actions={
            <select
              className="select sm"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              aria-label="Filtrar por tipo de llamada"
            >
              <option value="todos">Todos los tipos</option>
              {tiposUnicos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          }
          flush
        >
          {pipeline.length === 0 ? (
            <div className="empty">No hay llamadas en los próximos 7 días.</div>
          ) : (
            pipeline.map((l) => {
              const est = ESTADO[l.estado] ?? ESTADO.pendiente;
              return (
                <button
                  key={l.id}
                  type="button"
                  className="lista-item clickable"
                  onClick={() => setDetalle(l)}
                >
                  <Pill tone={est.tone} dot>
                    {est.label}
                  </Pill>
                  <span className="who">{l.prospecto}</span>
                  <span className="q">
                    {formatFechaHora(l.fechaAt)} · {l.oferta}
                    {l.facturacion ? ` · factura ${l.facturacion}` : ''}
                  </span>
                </button>
              );
            })
          )}
        </Card>
      </div>

      <Card
        title="Follow-ups pendientes"
        sub="Ordenados por urgencia (más días sin contacto primero)"
        flush
        foot="Verde <3 d · amarillo 3–7 d · rojo >7 d"
      >
        {followUps.map((f) => (
          <div key={f.id} className="lista-item">
            <Pill tone={urgenciaFollow(f.diasSinContacto)} dot>
              {f.diasSinContacto}d sin contacto
            </Pill>
            <span className="who">{f.prospecto}</span>
            <span className="q">
              {f.proximoPaso} · {f.closer} · último {formatFecha(f.ultimoContactoAt)}
            </span>
          </div>
        ))}
      </Card>

      {detalle && <DetalleLlamada llamada={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}
