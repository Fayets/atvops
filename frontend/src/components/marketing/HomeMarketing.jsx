import { Link } from 'react-router-dom';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import SourceTag from '../ui/SourceTag.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * El panorama del mes para marketing: cuántas conversaciones abrió el contenido y de
 * dónde salieron. Es lo que el director de marketing necesita ver al entrar, en vez del
 * cuadro de mando de operaciones.
 */

const fecha = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—');

function Numero({ label, valor, nota, format = 'count', tono }) {
  return (
    <article className="kpi sm">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value-row">
        <span className="kpi-value num">{formatValue(valor ?? 0, format)}</span>
        {tono && <Pill tone={tono} dot>{tono === 'ok' ? 'en ritmo' : tono === 'warn' ? 'atención' : 'atrasado'}</Pill>}
      </div>
      {nota && <div className="kpi-nota">{nota}</div>}
    </article>
  );
}

/** Una fuente del embudo: cuánto contenido salió y cuántas conversaciones trajo. */
function Fuente({ titulo, volumen, volumenLabel, conversaciones, nota, sinFuente }) {
  return (
    <div className="mkt-fuente">
      <div className="mkt-fuente-cab">
        <span className="strong">{titulo}</span>
        <span className="dim">{volumen} {volumenLabel}</span>
      </div>
      <div className="mkt-fuente-valor num">
        {sinFuente ? <span className="dim">sin medir</span> : formatValue(conversaciones ?? 0, 'count')}
      </div>
      <div className="dim mkt-fuente-nota">{nota}</div>
    </div>
  );
}

/**
 * @param {{ marketing: object, decreto: object, contexto: {diaHoy: number, diasMes: number},
 *           nombreMes: string }} props
 */
export default function HomeMarketing({ marketing, decreto, contexto, nombreMes }) {
  const conv = marketing?.conversaciones ?? {};
  const c = marketing?.contenido ?? {};
  const historias = marketing?.historias ?? {};
  const yt = c.youtube ?? {};

  const diaHoy = contexto?.diaHoy ?? 1;
  const diasMes = contexto?.diasMes ?? 30;
  const transcurrido = Math.min(100, Math.round((diaHoy / diasMes) * 100));

  const metaChats = decreto?.chats ?? 0;
  const metaConversaciones = decreto?.conversaciones ?? 0;
  const abiertas = conv.total ?? 0;
  const pct = metaConversaciones ? Math.round((abiertas / metaConversaciones) * 100) : null;
  const tono = pct == null ? undefined : pct >= transcurrido ? 'ok' : pct >= transcurrido * 0.6 ? 'warn' : 'alert';
  const faltan = Math.max(metaConversaciones - abiertas, 0);
  const semanasRestantes = Math.max(Math.ceil((diasMes - diaHoy) / 7), 1);

  // El contenido que más conversaciones trajo, sin importar cuándo se publicó.
  const top = [...(c.publicaciones ?? [])]
    .filter((p) => p.keyword)
    .sort((a, b) => (b.conversaciones ?? 0) - (a.conversaciones ?? 0))
    .slice(0, 5);

  return (
    <>
      <Card
        title={`Cómo viene ${nombreMes}`}
        sub={`Día ${diaHoy} de ${diasMes} · ${transcurrido}% del mes transcurrido`}
        actions={<SourceTag sourceId="mkt_crm" updatedAt={marketing?.syncAt} />}
      >
        <div className="kpis sm">
          <Numero
            label="Conversaciones abiertas"
            valor={abiertas}
            tono={tono}
            nota={metaConversaciones
              ? `${formatValue(metaConversaciones, 'count')} es la meta · faltan ${formatValue(faltan, 'count')}, ${formatValue(Math.ceil(faltan / semanasRestantes), 'count')} por semana`
              : 'Sin meta cargada en el decreto'}
          />
          <Numero
            label="Chats abiertos"
            valor={0}
            nota={metaChats ? `meta ${formatValue(metaChats, 'count')} · todavía sin fuente que los cuente` : 'sin fuente conectada'}
          />
          <Numero label="Reels publicados" valor={c.reels} nota={`${formatValue(c.reproducciones ?? 0, 'count')} reproducciones`} />
          <Numero label="Alcance" valor={c.alcance} nota={`${formatValue(c.interacciones ?? 0, 'count')} interacciones`} />
        </div>
      </Card>

      <Card
        title="De dónde salen las conversaciones"
        sub="Cada formato, con el volumen que salió y lo que trajo"
        flush
        foot="Las de Instagram las abre el bot cuando alguien comenta la palabra de un reel: se cuentan solas."
      >
        <div className="mkt-fuentes">
          <Fuente
            titulo="Reels"
            volumen={c.reels ?? 0}
            volumenLabel={c.reels === 1 ? 'publicado' : 'publicados'}
            conversaciones={abiertas}
            nota={`${formatValue(c.reproducciones ?? 0, 'count')} reproducciones este mes`}
          />
          <Fuente
            titulo="Historias"
            volumen={historias.secuencias ?? 0}
            volumenLabel={historias.secuencias === 1 ? 'secuencia' : 'secuencias'}
            conversaciones={historias.chats}
            nota={`${historias.conCta ?? 0} con llamada a la acción`}
          />
          <Fuente
            titulo="YouTube"
            volumen={yt.videos ?? 0}
            volumenLabel={yt.videos === 1 ? 'video' : 'videos'}
            conversaciones={yt.chats}
            nota={`${formatValue(yt.vistas ?? 0, 'count')} vistas`}
            sinFuente={!yt.videos}
          />
        </div>
      </Card>

      <Card
        title="El contenido que más trajo"
        sub={top.length ? 'Ordenado por conversaciones abiertas este mes' : 'Todavía sin contenido con palabra clave este mes'}
        flush
        foot={<Link to="/marketing">Ver todo el contenido →</Link>}
      >
        {top.length === 0 ? (
          <div className="empty">Un reel sin palabra clave cargada no se puede atribuir.</div>
        ) : (
          <div className="conv-tabla">
            <div className="conv-fila cabecera">
              <span>Fecha</span>
              <span>Reel</span>
              <span>Palabra</span>
              <span>Reproducciones</span>
              <span>Conversaciones</span>
            </div>
            {top.map((p) => (
              <div key={p.url ?? p.titulo} className="conv-fila">
                <span className="num dim">{fecha(p.fecha)}</span>
                <span className="conv-titulo">
                  {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.titulo}</a> : p.titulo}
                </span>
                <span className="conv-palabra"><code>{p.keyword}</code></span>
                <span className="num dim">{formatValue(p.reproducciones, 'count')}</span>
                <span className="num conv-valor">{formatValue(p.conversaciones ?? 0, 'count')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
