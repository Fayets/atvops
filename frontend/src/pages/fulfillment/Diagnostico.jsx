import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Pill from '../../components/ui/Pill.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import { getFulfillment } from '../../data/api.js';
import { hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';

/**
 * Una sola tabla para trabajar la cartera.
 *
 * Reemplaza a Activación, Engagement y Retención y riesgo, que mostraban los mismos
 * clientes recortados por criterios distintos: buscar a alguien obligaba a recorrer las
 * tres. Acá está la cartera entera y los filtros hacen el recorte.
 *
 * Orden por defecto: los de score más bajo primero. Es la lista de a quién tocar hoy.
 */

const BLOCKER_LABEL = {
  tecnico: 'Técnico', ausencia: 'Ausencia', no_implementa: 'No implementa',
  expectativa: 'Expectativa', espera_equipo: 'Espera al equipo',
};

const FASE = (c) => {
  if (c.estado !== 'activo') return 'Baja';
  if (!c.activacion?.activado) return c.onboardingDias != null && c.onboardingDias <= 31 ? 'Onboarding' : 'Sin activar';
  return 'Activo';
};

const tono = (score) => (score >= 70 ? 'ok' : score >= 50 ? 'warn' : 'alert');

const FILTROS = [
  { id: 'todos', label: 'Todos', filtra: () => true },
  { id: 'rojo', label: 'En rojo', filtra: (c) => (c.salud?.score ?? 0) < 50 },
  { id: 'silencio', label: 'Silencio ≥7 días', filtra: (c) => (c.engagement?.diasSinMensaje ?? 0) >= 7 },
  { id: 'sin_activar', label: 'Sin activar', filtra: (c) => !c.activacion?.activado && c.estado === 'activo' },
  { id: 'blocker', label: 'Con blocker', filtra: (c) => Boolean(c.activacion?.blocker) },
  { id: 'baja', label: 'Intención de baja', filtra: (c) => Boolean(c.churnIntent) },
];

export default function Diagnostico() {
  const { data, loading, error } = useResource(() => getFulfillment(), []);
  const [filtro, setFiltro] = useState('todos');
  const [programa, setPrograma] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  const clientes = useMemo(() => {
    // `getFulfillment()` devuelve el panel entero; la cartera está en `clientes`.
    const todos = Array.isArray(data) ? data : (data?.clientes ?? []);
    const f = FILTROS.find((x) => x.id === filtro) ?? FILTROS[0];
    const texto = busqueda.trim().toLowerCase();
    return todos
      .filter((c) => f.filtra(c))
      .filter((c) => programa === 'todos' || c.categoria === programa)
      .filter((c) => !texto || String(c.nombre || '').toLowerCase().includes(texto)
        || String(c.canal || '').toLowerCase().includes(texto))
      .sort((a, b) => (a.salud?.score ?? 0) - (b.salud?.score ?? 0));
  }, [data, filtro, programa, busqueda]);

  const programas = useMemo(
    () => [...new Set((Array.isArray(data) ? data : (data?.clientes ?? []))
      .map((c) => c.categoria).filter(Boolean))].sort(),
    [data],
  );

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment"
        title="Diagnóstico"
        desc="La cartera entera, del más urgente al más tranquilo."
        actions={<SourceTag sourceId="discord_transcripts" />}
      />

      {loading && !data ? (
        <SkeletonBlock height={420} />
      ) : (
        <Card
          title={`${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'}`}
          sub={filtro === 'todos' && programa === 'todos' && !busqueda ? '' : 'con los filtros puestos'}
          flush
        >
          <div className="diag-filtros">
            <input
              className="diag-busca"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente o canal"
              aria-label="Buscar"
            />
            <select className="diag-select" value={programa}
              onChange={(e) => setPrograma(e.target.value)} aria-label="Programa">
              <option value="todos">Todos los programas</option>
              {programas.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="diag-sep" aria-hidden="true" />
            {FILTROS.map((f) => {
              const cuantos = (Array.isArray(data) ? data : (data?.clientes ?? [])).filter(f.filtra).length;
              return (
                <button key={f.id} type="button"
                  className={`chip${filtro === f.id ? ' activo' : ''}`}
                  onClick={() => setFiltro(f.id)}>
                  {f.label} <span className="num">{cuantos}</span>
                </button>
              );
            })}
          </div>

          {clientes.length === 0 ? (
            <div className="empty">Ningún cliente con esos filtros.</div>
          ) : (
            <div className="diag-tabla">
              <div className="diag-fila cabecera">
                <span>Cliente</span>
                <span>Score</span>
                <span>Fase</span>
                <span>Blocker</span>
                <span>Silencio</span>
                <span>Msgs/sem</span>
                <span>Última actividad</span>
              </div>
              {clientes.map((c) => {
                const score = c.salud?.score ?? 0;
                const dias = c.engagement?.diasSinMensaje ?? 0;
                return (
                  <Link key={c.id} to={`/fulfillment/clientes/${encodeURIComponent(c.id)}`} className="diag-fila">
                    <span className="strong">
                      {c.nombre}
                      {c.churnIntent && <Pill tone="alert" dot>quiere irse</Pill>}
                    </span>
                    <span className={`num zona-${tono(score)}`}>{score}</span>
                    <span className="dim">{FASE(c)}</span>
                    <span className="dim">{BLOCKER_LABEL[c.activacion?.blocker] ?? '—'}</span>
                    <span className={`num${dias >= 7 ? ' zona-alert' : ' dim'}`}>{dias ? `${dias} d` : '—'}</span>
                    <span className="num dim">{c.engagement?.mensajesClienteSemana ?? 0}</span>
                    <span className="dim">{c.ultimaActividadAt ? hace(c.ultimaActividadAt) : '—'}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
