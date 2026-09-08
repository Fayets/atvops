import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Pill from '../../components/ui/Pill.jsx';
import { ejecutarRondaPendientes, getPendientes, getUpdateTexto } from '../../data/api.js';
import { formatFechaHora, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import { useRol } from '../../lib/RolContext.jsx';

const tonoHoras = (h) => (h >= 48 ? 'alert' : h >= 12 ? 'warn' : 'plain');
const horasTexto = (h) => (h >= 48 ? `${Math.round(h / 24)} d` : `${Math.round(h)} h`);
const ESTADO = {
  esperando_equipo: { icono: '⚠️', label: 'Esperando al equipo', tone: 'alert' },
  en_proceso: { icono: '🔲', label: 'En proceso', tone: 'warn' },
  esperando_cliente: { icono: '⏸️', label: 'Esperando al cliente', tone: 'off' },
};

function Pedido({ p }) {
  const e = ESTADO[p.estado] ?? ESTADO.esperando_equipo;
  return (
    <div className={`pendiente${p.estado === 'esperando_cliente' ? ' cortesia' : ''}`}>
      <Pill tone={p.estado === 'esperando_equipo' ? tonoHoras(p.horasAbierto) : e.tone}>{e.icono} {horasTexto(p.horasAbierto)}</Pill>
      <div className="pendiente-cuerpo">
        <div>
          <Link to={`/fulfillment/chats/${p.canalId}`} className="strong">#{p.canal}</Link>
          <span className="pendiente-etiqueta"> · {p.tipo}: {p.tema}</span>
        </div>
        <div className="pendiente-extracto" title={p.nota || ''}>{p.nota || e.label}</div>
      </div>
      <Link to={`/fulfillment/clientes/${p.clienteId}`} className="dim" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>ficha</Link>
    </div>
  );
}

/**
 * Registro de pedidos abiertos: lo que cada cliente pidió y todavía no se resolvió,
 * mantenido por Claude ronda a ronda. Reemplaza la revisión manual de Mauri.
 */
export default function Pendientes() {
  const { rol } = useRol();
  const [tick, setTick] = useState(0);
  const { data, loading, error } = useResource(getPendientes, [tick]);
  const [corriendo, setCorriendo] = useState(false);
  const [update, setUpdate] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [verSinRespuesta, setVerSinRespuesta] = useState(false);

  const correrRonda = async () => {
    setCorriendo(true);
    try {
      await ejecutarRondaPendientes();
      setTick((t) => t + 1);
    } catch (e) {
      alert(e.message);
    } finally {
      setCorriendo(false);
    }
  };

  const copiarUpdate = async () => {
    const texto = await getUpdateTexto();
    setUpdate(texto);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sin permiso de portapapeles: queda el texto visible para copiar a mano */
    }
  };

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const columnas = [
    { key: 'responsable', label: 'Responsable', render: (m) => <span className="strong">{m.responsable}</span> },
    { key: 'esperandoEquipo', label: 'Esperando al equipo', align: 'right', render: (m) => <span className="num" style={{ color: m.esperandoEquipo ? 'var(--brand-hi)' : 'var(--text-3)' }}>{m.esperandoEquipo}</span> },
    { key: 'masViejoHs', label: 'El más viejo', align: 'right', render: (m) => <span className="num">{m.masViejoHs ? horasTexto(m.masViejoHs) : '—'}</span> },
    { key: 'enProceso', label: 'En proceso', align: 'right', render: (m) => <span className="num">{m.enProceso}</span> },
    { key: 'esperandoCliente', label: 'Esperando al cliente', align: 'right', render: (m) => <span className="num dim">{m.esperandoCliente}</span> },
    { key: 'resueltos7d', label: 'Resueltos (7 d)', align: 'right', render: (m) => <span className="num dim">{m.resueltos7d}</span> },
    { key: 'medianaResolucionHs', label: 'Mediana de resolución', align: 'right', render: (m) => (m.medianaResolucionHs != null ? <Pill tone={m.medianaResolucionHs <= 24 ? 'ok' : m.medianaResolucionHs <= 72 ? 'warn' : 'alert'}>{horasTexto(m.medianaResolucionHs)}</Pill> : <span className="dim">—</span>) },
  ];

  const vivo = data?.sinRespuesta;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment · cerebro"
        title="Pedidos abiertos"
        desc="Cada cosa que un cliente pidió y todavía no se resolvió de verdad, aunque la charla haya seguido. Claude lee solo los mensajes nuevos en las rondas de las 09, 13, 16 y 19 y mantiene el registro al día; el resultado también queda en markdown en el cerebro."
        actions={
          <>
            <button className="btn" onClick={copiarUpdate} disabled={!data}>
              {copiado ? 'Copiado ✓' : 'Copiar update para #updates'}
            </button>
            {['admin', 'founder', 'csm', 'operaciones'].includes(rol) && (
              <button className="btn primary" onClick={correrRonda} disabled={corriendo}>
                {corriendo ? 'Leyendo canales…' : 'Correr ronda ahora'}
              </button>
            )}
          </>
        }
      />

      {!data || loading ? (
        <SkeletonBlock height={480} />
      ) : (
        <>
          <div className="kpi-grid">
            <article className="kpi sm">
              <div className="kpi-label">Esperando al equipo</div>
              <div className="kpi-value-row"><span className="kpi-value num" style={{ color: data.esperandoEquipo ? 'var(--brand-hi)' : 'var(--ok)' }}>{data.esperandoEquipo}</span></div>
              <div className="kpi-nota">pedidos sin respuesta ni entrega</div>
            </article>
            <article className="kpi sm">
              <div className="kpi-label">En proceso</div>
              <div className="kpi-value-row"><span className="kpi-value num">{data.enProceso}</span></div>
              <div className="kpi-nota">el equipo respondió pero no entregó</div>
            </article>
            <article className="kpi sm">
              <div className="kpi-label">Esperando al cliente</div>
              <div className="kpi-value-row"><span className="kpi-value num">{data.esperandoCliente}</span></div>
              <div className="kpi-nota">{data.resueltos7d} resueltos en los últimos 7 días</div>
            </article>
            <article className="kpi sm">
              <div className="kpi-label">Última ronda</div>
              <div className="kpi-value-row"><span className="kpi-value num" style={{ fontSize: 18 }}>{data.ultimaRonda ? hace(data.ultimaRonda.ejecutadoAt, new Date()) : 'nunca'}</span></div>
              <div className="kpi-nota">
                {data.ultimaRonda
                  ? `${data.ultimaRonda.canales_leidos ?? 0} canales leídos · ${data.ultimaRonda.cambios ?? 0} cambios · US$ ${(data.ultimaRonda.costo_usd ?? 0).toFixed(3)}`
                  : `rondas a las ${data.horarios.join(', ')}`}
                {data.mes?.rondas ? ` · mes: ${data.mes.rondas} rondas, US$ ${data.mes.costo_usd.toFixed(2)}` : ''}
              </div>
            </article>
          </div>

          {data.ultimaRonda?.error && (
            <Card title="Errores de la última ronda" sub="Canales que Claude no pudo leer; se reintentan en la próxima ronda">
              <pre className="update-texto" style={{ margin: 0 }}>{data.ultimaRonda.error}</pre>
            </Card>
          )}

          {update && (
            <Card title="Update para #updates" sub="Mismo formato que usa el equipo · ya está en el portapapeles" actions={<button className="btn" onClick={() => setUpdate(null)}>Cerrar</button>}>
              <textarea className="update-texto" readOnly value={update} rows={Math.min(24, update.split('\n').length + 1)} />
            </Card>
          )}

          <div className="pendientes-grid">
            {data.porResponsable.map((b) => (
              <Card key={b.responsable} title={`@${b.responsable}`} sub={`${b.esperando_equipo.length} esperando al equipo · ${b.en_proceso.length} en proceso · ${b.esperando_cliente.length} esperando al cliente`} flush>
                <div className="lista">
                  {[...b.esperando_equipo, ...b.en_proceso, ...b.esperando_cliente].map((p) => <Pedido key={p.id} p={p} />)}
                </div>
              </Card>
            ))}
            {!data.porResponsable.length && (
              <Card>
                <div className="empty">
                  {data.ultimaRonda ? 'No hay pedidos abiertos.' : 'Todavía no corrió ninguna ronda. Tocá “Correr ronda ahora” para que Claude lea los canales y arme el registro.'}
                </div>
              </Card>
            )}
          </div>

          <Card title="Carga por responsable" sub="Pedidos abiertos ahora y cuánto tardan en resolverse los que cerraron esta semana" flush>
            <DataTable columns={columnas} rows={data.metricas} rowKey={(m) => m.responsable} initialSort={{ key: 'esperandoEquipo', dir: 'desc' }} />
          </Card>

          {data.resueltosRecientes.length > 0 && (
            <Card title="Resueltos en los últimos 7 días" sub={`${data.resueltosRecientes.length} pedidos cerrados`} flush>
              <div className="lista">
                {data.resueltosRecientes.map((p) => (
                  <div key={p.id} className="pendiente">
                    <Pill tone="ok">✅ {horasTexto(p.horasAbierto)}</Pill>
                    <div className="pendiente-cuerpo">
                      <div><Link to={`/fulfillment/chats/${p.canalId}`} className="strong">#{p.canal}</Link><span className="pendiente-etiqueta"> · {p.tipo}: {p.tema}</span></div>
                      <div className="pendiente-extracto">{p.nota}</div>
                    </div>
                    <span className="dim" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>@{p.responsable || '—'}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {vivo && (
            <Card
              title="Señal en vivo: canales donde el último mensaje es del cliente"
              sub={`${vivo.total} canales · sale de los transcripts al instante, sin Claude · es solo una pista, no significa que el pedido siga abierto`}
              flush
              actions={<button className="btn" onClick={() => setVerSinRespuesta((v) => !v)}>{verSinRespuesta ? 'Ocultar' : 'Ver'}</button>}
            >
              {verSinRespuesta && (
                <div className="lista">
                  {vivo.pendientes.map((p) => (
                    <div key={p.canalId} className={`pendiente${p.cortesia ? ' cortesia' : ''}`}>
                      <Pill tone={p.cortesia ? 'off' : tonoHoras(p.horas)}>{p.cortesia ? '✓ cortesía' : `⏳ ${horasTexto(p.horas)}`}</Pill>
                      <div className="pendiente-cuerpo">
                        <div><Link to={`/fulfillment/chats/${p.canalId}`} className="strong">#{p.canal}</Link><span className="pendiente-etiqueta"> · @{p.coach}</span></div>
                        <div className="pendiente-extracto">{p.extracto || '(adjunto sin texto)'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <div className="dim" style={{ fontSize: 12 }}>Generado {formatFechaHora(data.generadoAt)} · cerebro en <code>{data.cerebroDir}</code></div>
        </>
      )}
    </div>
  );
}
