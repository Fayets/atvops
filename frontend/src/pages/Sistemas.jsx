import Ring from '../components/charts/Ring.jsx';
import Card from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import Bar from '../components/ui/Bar.jsx';
import Stepper from '../components/ui/Stepper.jsx';
import GrietasPanel from '../components/home/GrietasPanel.jsx';
import PedidosPanel from '../components/home/PedidosPanel.jsx';
import { ejecutarActivacionIa, getActivacionIa, getGrietas, getOnboarding, getSistemas } from '../data/api.js';
import { useState } from 'react';
import { SOURCES } from '../data/sources.js';
import { formatFecha, formatFechaHora, hace } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';

const ESTADO = {
  conectada: { tone: 'ok', label: 'conectada' },
  manual: { tone: 'warn', label: 'carga manual' },
  sin_conectar: { tone: 'off', label: 'sin conectar' },
};

const SECCION = {
  home: 'Home',
  clientes: 'Clientes',
  ventas: 'Ventas',
  marketing: 'Marketing',
  onboarding: 'Onboarding',
  sistemas: 'Sistemas',
};

export default function Sistemas() {
  const { data, loading, error } = useResource(getSistemas);
  const onboarding = useResource(getOnboarding);
  const qa = useResource(getGrietas);
  const [tickIa, setTickIa] = useState(0);
  const ia = useResource(getActivacionIa, [tickIa]);
  const [corriendo, setCorriendo] = useState(false);
  const staff = (onboarding.data?.procesos ?? []).filter((p) => p.tipo === 'staff');
  const kpiStaff = onboarding.data?.kpis.find((k) => k.id === 'onboarding_staff');

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  /** @type {import('../components/ui/DataTable.jsx').Columna[]} */
  const columnas = [
    { key: 'nombre', label: 'Campo', render: (f) => <span className="strong">{f.nombre}</span> },
    { key: 'seccion', label: 'Sección', render: (f) => <span className="dim">{SECCION[f.seccion]}</span> },
    {
      key: 'sourceId',
      label: 'Hoy viene de',
      render: (f) => (
        <Pill tone={ESTADO[SOURCES[f.sourceId].status].tone} dot>
          {SOURCES[f.sourceId].nombre}
        </Pill>
      ),
    },
    {
      key: 'objetivo',
      label: 'Debería venir de',
      render: (f) =>
        SOURCES[f.sourceId].status === 'conectada' ? (
          <span className="dim">— ya está</span>
        ) : f.objetivo ? (
          <span>{SOURCES[f.objetivo].nombre}</span>
        ) : (
          <span className="dim">ATV Ops (interno)</span>
        ),
    },
    {
      key: 'estado',
      label: 'Estado',
      align: 'right',
      value: (f) => (SOURCES[f.sourceId].status === 'conectada' ? 1 : 0),
      render: (f) =>
        SOURCES[f.sourceId].status === 'conectada' ? (
          <Pill tone="ok">automatizado</Pill>
        ) : (
          <Pill tone="warn">manual</Pill>
        ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="QA de datos · Franco"
        title="Sistemas"
        desc="El inventario honesto del tablero: qué fuente alimenta cada número, cuál sincroniza sola y cuál depende de que alguien la cargue. De acá sale el KPI de datos automatizados; no es un número escrito a mano."
      />

      {ia.data && (
        <Card
          title="Activación con Claude Code"
          sub={`${ia.data.modelo} · corre a las ${ia.data.horarios.join(' y ')} (Argentina)`}
          actions={
            <button
              className="btn primary"
              disabled={corriendo || ia.data.en_ejecucion || !ia.data.cli_disponible}
              onClick={async () => {
                setCorriendo(true);
                try {
                  await ejecutarActivacionIa();
                } catch (e) {
                  alert(e.message);
                } finally {
                  setCorriendo(false);
                  setTickIa((t) => t + 1);
                }
              }}
            >
              {corriendo || ia.data.en_ejecucion ? 'Analizando…' : 'Correr ahora'}
            </button>
          }
          foot={
            !ia.data.cli_disponible
              ? `No se encuentra el CLI (${ia.data.cli}) en este servidor.`
              : !ia.data.token_configurado
                ? 'Falta CLAUDE_CODE_OAUTH_TOKEN en el .env: el CLI no puede autenticarse.'
                : `Próxima corrida ${formatFechaHora(ia.data.proximo_at)}.`
          }
        >
          <div className="semaforo-mini" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="celda">
              <div className="n num">{ia.data.clientes_con_analisis}</div>
              <div className="k">clientes analizados</div>
            </div>
            <div className="celda">
              <div className="n num" style={{ color: 'var(--ok)' }}>{ia.data.clientes_activados_ia}</div>
              <div className="k">activados según Claude</div>
            </div>
            <div className="celda">
              <div className="n num">{ia.data.mes.corridas}</div>
              <div className="k">corridas este mes</div>
            </div>
            <div className="celda">
              <div className="n num">US$ {ia.data.mes.costo_usd.toFixed(2)}</div>
              <div className="k">{Math.round((ia.data.mes.tokens_entrada + ia.data.mes.tokens_salida) / 1000)}k tokens este mes</div>
            </div>
          </div>
          {ia.data.ultima_corrida && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-2)' }}>
              Última corrida {hace(ia.data.ultima_corrida.ejecutado_at, new Date())} ({ia.data.ultima_corrida.origen}):{' '}
              {ia.data.ultima_corrida.clientes_analizados} analizados · {ia.data.ultima_corrida.clientes_omitidos} sin cambios ·{' '}
              {ia.data.ultima_corrida.errores} errores · {ia.data.ultima_corrida.duracion_s}s
              {ia.data.ultima_corrida.detalle && (
                <div style={{ marginTop: 6, color: 'var(--warn)', whiteSpace: 'pre-wrap' }}>{ia.data.ultima_corrida.detalle}</div>
              )}
            </div>
          )}
        </Card>
      )}

      {qa.data && (
        <div className="split">
          <GrietasPanel grietas={qa.data.grietas} />
          <PedidosPanel pedidos={qa.data.pedidos} semanas={qa.data.pedidosSemana} />
        </div>
      )}

      {loading || !data ? (
        <SkeletonBlock height={420} />
      ) : (
        <>
          <div className="split">
            <Card title="Cobertura de automatización" sub="Campos que llegan solos desde su fuente">
              <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
                <Ring pct={data.cobertura.pct}>
                  <div className="num" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em' }}>
                    {data.cobertura.pct}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>automatizado</div>
                </Ring>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 200, flex: 1 }}>
                  <div>
                    <div className="eyebrow">Automatizados</div>
                    <div className="num" style={{ fontSize: 20, fontWeight: 600 }}>
                      {data.cobertura.automatizados} <span style={{ color: 'var(--text-3)', fontSize: 13 }}>de {data.cobertura.total} campos</span>
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow">Dependen de una persona</div>
                    <div className="num" style={{ fontSize: 20, fontWeight: 600, color: 'var(--warn)' }}>
                      {data.cobertura.manuales}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                    Conectar el payment processor sube este número{' '}
                    {Math.round(((data.cobertura.deuda.find((d) => d.sourceId === 'payments')?.campos.length ?? 0) / data.cobertura.total) * 100)}{' '}
                    puntos de una sola vez: es la palanca más grande que hay.
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Deuda por fuente" sub="Campos manuales agrupados por dónde deberían vivir" flush>
              <div className="lista">
                {data.cobertura.deuda.map((d) => (
                  <div key={d.sourceId} className="lista-item">
                    <span className="who">{SOURCES[d.sourceId].nombre}</span>
                    <span className="q">{d.campos.map((c) => c.nombre).join(' · ')}</span>
                    <span className="right">
                      <Pill tone={SOURCES[d.sourceId].status === 'conectada' ? 'ok' : 'warn'}>
                        {d.campos.length} {d.campos.length === 1 ? 'campo' : 'campos'}
                      </Pill>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Fuentes de datos" sub={`${data.fuentes.length} integraciones`} flush>
            {data.fuentes.map((f) => (
              <div key={f.id} className="fuente-card">
                <div className="fuente-top">
                  <h3>{f.nombre}</h3>
                  <Pill tone={ESTADO[f.status].tone} dot>
                    {ESTADO[f.status].label}
                  </Pill>
                  <div className="meta">
                    <span>Responsable: {f.responsable}</span>
                    <span>
                      Última sync:{' '}
                      {f.lastSyncAt ? (
                        <span title={formatFechaHora(f.lastSyncAt)}>{hace(f.lastSyncAt)}</span>
                      ) : (
                        <span style={{ color: 'var(--text-3)' }}>nunca</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="fuente-desc">{f.descripcion}</div>

                <div className="fuente-campos">
                  {data.campos.filter((c) => c.sourceId === f.id).length > 0 ? (
                    data.campos
                      .filter((c) => c.sourceId === f.id)
                      .map((c) => (
                        <span key={c.id} className="chip">
                          {c.nombre}
                        </span>
                      ))
                  ) : (
                    <>
                      <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--text-3)' }}>
                        Todavía no alimenta ningún campo · cuando se conecte se lleva:
                      </span>
                      {data.campos
                        .filter((c) => c.objetivo === f.id)
                        .map((c) => (
                          <span key={c.id} className="chip" style={{ borderStyle: 'dashed', opacity: 0.75 }}>
                            {c.nombre}
                          </span>
                        ))}
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="chip" style={{ background: 'transparent' }}>
                    {f.metodo ?? 'Sin método de ingesta'}
                  </span>
                </div>

                {f.proximoPaso && <div className="fuente-paso">Próximo paso · {f.proximoPaso}</div>}
              </div>
            ))}
          </Card>

          <Card
            title="Onboarding de staff"
            sub="De contrato firmado a primer día productivo"
            actions={kpiStaff ? <Pill tone={kpiStaff.value <= 10 ? 'ok' : 'warn'} dot>{Math.round(kpiStaff.value)} días de mediana</Pill> : null}
            flush
            foot="Vive en Sistemas y no en Fulfillment porque es capacidad operativa: cuánto tarda ATV en poder sostener un cliente más."
          >
            <div className="proceso-grid" style={{ padding: 'var(--space-5)' }}>
              {staff.map((p) => {
                const hechos = p.pasos.filter((x) => x.estado === 'completado').length;
                const cerrado = Boolean(p.cerradoAt);
                return (
                  <div key={p.id} style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--radius)' }}>
                    <div className="proceso-head">
                      <div>
                        <h3>{p.sujeto}</h3>
                        <div className="rol">{p.rol}</div>
                      </div>
                      <div style={{ marginLeft: 'auto' }}>
                        <Pill tone={cerrado ? 'ok' : p.diasTranscurridos <= p.slaDias ? 'plain' : 'alert'} dot>
                          {cerrado ? `cerrado en ${p.diasTranscurridos} d` : `día ${p.diasTranscurridos} de ${p.slaDias}`}
                        </Pill>
                      </div>
                    </div>
                    <div className="proceso-sla">
                      <div className="row">
                        <span>
                          {hechos} de {p.pasos.length} pasos
                        </span>
                        <span>Arrancó el {formatFecha(p.inicioAt)}</span>
                      </div>
                      <Bar pct={(hechos / p.pasos.length) * 100} tone={cerrado ? 'ok' : 'brand'} />
                    </div>
                    <div className="card-body">
                      <Stepper pasos={p.pasos} diasTranscurridos={p.diasTranscurridos} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card
            title="Inventario de campos"
            sub="Cada número del tablero y de dónde sale"
            flush
            foot="Cuando un campo pasa de manual a automatizado, el KPI de la home sube solo: se calcula sobre esta tabla."
          >
            <DataTable columns={columnas} rows={data.campos} initialSort={{ key: 'estado', dir: 'asc' }} />
          </Card>
        </>
      )}
    </div>
  );
}
