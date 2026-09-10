import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Las secuencias de historias, cada día en su fila.
 *
 * Se leen como se publicaron: de izquierda a derecha, en orden. Entre pieza y pieza va
 * cuánta gente se cayó, que es el dato que decide si la secuencia sirvió: una caída del
 * 30% en la tercera dice más que el total de vistas del día.
 */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—');
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '');
const n = (v) => formatValue(v ?? 0, 'count');

/** Un número de la secuencia. Todos ocupan lo mismo para que la fila quede pareja. */
function Metrica({ label, valor, tono }) {
  return (
    <div className="seq-metrica">
      <span className="seq-metrica-label">{label}</span>
      <span className={`seq-metrica-valor num${tono ? ` ${tono}` : ''}`}>{valor}</span>
    </div>
  );
}

function Secuencia({ s }) {
  const historias = s.historias ?? [];
  const primera = historias[0];
  const ultima = historias[historias.length - 1];
  const caida = primera?.reach && ultima?.reach ? primera.reach - ultima.reach : null;
  const desde = hora(primera?.fecha);
  const hasta = hora(ultima?.fecha);

  return (
    <Card
      title={dia(s.fecha)}
      sub={`${s.piezas} ${s.piezas === 1 ? 'pieza' : 'piezas'}${desde ? ` · ${desde} a ${hasta}` : ''}`}
      actions={s.retencion != null && (
        <Pill tone={s.retencion >= 70 ? 'ok' : s.retencion >= 50 ? 'warn' : 'alert'} dot>
          {s.retencion}% llega al final
        </Pill>
      )}
      flush
      foot={caida != null
        ? `Empezó con ${n(primera.reach)} de alcance y terminó con ${n(ultima.reach)}: se fueron ${n(caida)} en el camino.`
        : 'Instagram todavía no devolvió las métricas de estas historias.'}
    >
      <div className="seq-metricas">
        <Metrica label="Alcance" valor={n(s.alcance)} />
        <Metrica label="Vistas" valor={n(s.vistas)} />
        <Metrica label="Vistas prom." valor={n(s.vistasPromedio)} />
        <Metrica label="Respuestas" valor={n(s.respuestas)} tono={s.respuestas ? 'ok' : ''} />
        <Metrica label="Compartidos" valor={n(s.compartidos)} />
        <Metrica label="Visitas al perfil" valor={n(s.visitasPerfil)} />
        <Metrica label="Interacciones" valor={n(s.interacciones)} />
      </div>

      <div className="seq-fila">
        {historias.map((h, i) => (
          <div key={h.id} className="seq-tramo">
            {i > 0 && (
              <div className={`seq-caida num${(h.caida ?? 0) > 10 ? ' alta' : ''}`}
                title={`Perdió ${h.caida ?? 0}% del alcance de la pieza anterior`}>
                {h.caida == null ? '·' : `−${h.caida}%`}
              </div>
            )}
            <a
              href={h.url || undefined}
              target={h.url ? '_blank' : undefined}
              rel="noreferrer"
              className="seq-pieza"
              title={`Pieza ${i + 1} de ${s.piezas} · ${hora(h.fecha)}`}
            >
              <span className="seq-n num">{i + 1}</span>
              {h.retencion != null && <span className="seq-ret num">{h.retencion}%</span>}
              {h.thumbnail
                ? <img src={h.thumbnail} alt="" loading="lazy" />
                : <span className="seq-sinfoto dim">sin foto</span>}
              <span className="seq-datos">
                <span className="seq-dato"><b className="num">{n(h.reach)}</b><i>alcance</i></span>
                <span className="seq-dato"><b className="num">{n(h.views)}</b><i>vistas</i></span>
                <span className="seq-dato"><b className={`num${h.replies ? ' seq-respuestas' : ''}`}>{n(h.replies)}</b><i>resp.</i></span>
                <span className="seq-dato"><b className="num">{n(h.shares)}</b><i>comp.</i></span>
              </span>
            </a>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Secuencias({ items }) {
  if (!items.length) {
    return (
      <Card title="Historias" sub="Todavía no se guardó ninguna secuencia">
        <div className="empty">
          Instagram borra las historias a las 24 horas. Se guardan las que estén activas en cada
          sincronización, que corre cada tres horas.
        </div>
      </Card>
    );
  }
  return <>{items.map((s) => <Secuencia key={s.fecha} s={s} />)}</>;
}
