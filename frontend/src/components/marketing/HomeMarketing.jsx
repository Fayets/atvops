import { Link } from 'react-router-dom';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';
import { chatsDelMes } from '../../lib/chats.js';

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
function Fuente({ titulo, volumen, volumenLabel, conversaciones, nota }) {
  return (
    <div className="mkt-fuente">
      <div className="mkt-fuente-cab">
        <span className="strong">{titulo}</span>
        <span className="dim">{volumen} {volumenLabel}</span>
      </div>
      <div className="mkt-fuente-valor num">
        {formatValue(conversaciones ?? 0, 'count')}
      </div>
      <div className="dim mkt-fuente-nota">{nota}</div>
    </div>
  );
}

/**
 * @param {{ decreto: object, contexto: {diaHoy: number, diasMes: number},
 *           instagram: object, conversaciones: object, nombreMes: string }} props
 */
export default function HomeMarketing({ decreto, contexto, instagram, conversaciones, nombreMes }) {
  // Todo sale de Ops: los chats de conversaciones_services (las mismas partes que ve Ventas)
  // y el volumen de la cuenta de Instagram. La base de ATV Marketing ya no existe.
  const reels = instagram?.reels ?? [];
  const secuencias = instagram?.secuencias ?? [];
  const suma = (lista, campo) => lista.reduce((t, x) => t + (x[campo] ?? 0), 0);
  const conCta = secuencias.filter((x) => x.cta);
  const propio = {
    reels: reels.length,
    reproducciones: suma(reels, 'views'),
    alcance: suma(reels, 'reach') + secuencias.reduce((t, x) => t + (x.alcance ?? 0), 0),
    interacciones: suma(reels, 'total_interactions') + suma(secuencias, 'interacciones'),
  };

  const diaHoy = contexto?.diaHoy ?? 1;
  const diasMes = contexto?.diasMes ?? 30;
  const transcurrido = Math.min(100, Math.round((diaHoy / diasMes) * 100));

  const metaConversaciones = decreto?.conversaciones ?? 0;
  const chats = chatsDelMes(conversaciones);
  const abiertas = chats.total;
  const parte = (clave) => chats.partes.find((x) => x.clave === clave) ?? { cuantos: 0, filas: [] };
  const pReels = parte('reels');
  const pHistorias = parte('historias');
  const otras = chats.partes.filter((x) => !['reels', 'historias'].includes(x.clave) && Number(x.cuantos) > 0);
  const pct = metaConversaciones ? Math.round((abiertas / metaConversaciones) * 100) : null;
  const tono = pct == null ? undefined : pct >= transcurrido ? 'ok' : pct >= transcurrido * 0.6 ? 'warn' : 'alert';
  const faltan = Math.max(metaConversaciones - abiertas, 0);
  const semanasRestantes = Math.max(Math.ceil((diasMes - diaHoy) / 7), 1);

  // Los reels que más chats abrieron este mes (por la fecha del comentario, no de publicación).
  const top = (pReels.filas ?? []).slice(0, 5);

  return (
    <>
      <Card title={`Cómo viene ${nombreMes}`} sub={`Día ${diaHoy} de ${diasMes} · ${transcurrido}% del mes transcurrido`}>
        <div className="kpi-grid">
          <Numero
            label="Chats abiertos"
            valor={abiertas}
            tono={tono}
            nota={metaConversaciones
              ? `${formatValue(metaConversaciones, 'count')} es la meta · faltan ${formatValue(faltan, 'count')}, ${formatValue(Math.ceil(faltan / semanasRestantes), 'count')} por semana`
              : 'Sin meta cargada en el decreto'}
          />
          <Numero label="Reels publicados" valor={propio.reels} nota={`${formatValue(propio.reproducciones, 'count')} reproducciones`} />
          <Numero label="Secuencias con CTA" valor={conCta.length}
            nota={`de ${formatValue(secuencias.length, 'count')} ${secuencias.length === 1 ? 'secuencia' : 'secuencias'} del mes`} />
          <Numero label="Alcance" valor={propio.alcance} nota={`${formatValue(propio.interacciones, 'count')} interacciones`} />
        </div>
      </Card>

      <Card title="De dónde salen los chats" sub="Lo que trajo cada puerta este mes" flush
        foot="Reels: personas distintas que comentaron la palabra. Historias: respuestas a las secuencias con CTA.">
        <div className="mkt-fuentes">
          <Fuente titulo="Reels" volumen={(pReels.filas ?? []).length}
            volumenLabel={(pReels.filas ?? []).length === 1 ? 'reel con chats' : 'reels con chats'}
            conversaciones={pReels.cuantos} nota="comentaron la palabra del reel" />
          <Fuente titulo="Historias con CTA" volumen={conCta.length}
            volumenLabel={conCta.length === 1 ? 'secuencia' : 'secuencias'}
            conversaciones={pHistorias.cuantos} nota="respuestas a las secuencias con CTA" />
          {otras.map((o) => (
            <Fuente key={o.clave} titulo={o.fuente} volumen={(o.filas ?? []).length} volumenLabel=""
              conversaciones={o.cuantos} nota={o.detalle ?? ''} />
          ))}
        </div>
      </Card>

      <Card title="Los reels que más chats trajeron" sub={top.length ? 'Este mes, ordenados por chats' : 'Ningún reel trajo chats este mes todavía'}
        flush foot={<Link to="/marketing/reels">Ver todos los reels →</Link>}>
        {top.length > 0 && (
          <div className="conv-tabla mkt-top">
            <div className="conv-fila cabecera">
              <span>Publicado</span>
              <span>Reel</span>
              <span>Palabra</span>
              <span>Chats</span>
            </div>
            {top.map((f) => (
              <div key={`${f.cuando}-${f.quien}`} className="conv-fila">
                <span className="num dim">{fecha(f.cuando)}</span>
                <span className="conv-titulo">{f.quien}</span>
                <span className="conv-palabra"><code>{f.dato}</code></span>
                <span className="num conv-valor">{formatValue(f.cuantos ?? 0, 'count')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
