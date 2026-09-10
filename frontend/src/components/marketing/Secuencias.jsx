import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * Las secuencias de historias, cada día en su fila.
 *
 * Se leen como se publicaron: de izquierda a derecha, en orden. Así se ve dónde cae la
 * gente y qué pieza se lleva las respuestas, que es lo que decide si la secuencia sirvió.
 */

const dia = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—');
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '');
const n = (v) => formatValue(v ?? 0, 'count');

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

  return (
    <>
      {items.map((s) => {
        const primera = s.historias[0];
        const ultima = s.historias[s.historias.length - 1];
        const caida = primera?.reach && ultima?.reach ? primera.reach - ultima.reach : null;
        return (
          <Card
            key={s.fecha}
            title={dia(s.fecha)}
            sub={`${s.piezas} ${s.piezas === 1 ? 'pieza' : 'piezas'} · ${n(s.vistas)} vistas · ${n(s.respuestas)} respuestas`}
            actions={s.retencion != null && (
              <Pill tone={s.retencion >= 70 ? 'ok' : s.retencion >= 50 ? 'warn' : 'alert'} dot>
                {s.retencion}% llega al final
              </Pill>
            )}
            flush
            foot={caida != null
              ? `Empezó con ${n(primera.reach)} de alcance y terminó con ${n(ultima.reach)}: se fueron ${n(caida)} en el camino.`
              : undefined}
          >
            <div className="seq-fila">
              {s.historias.map((h, i) => (
                <a
                  key={h.id}
                  href={h.url || undefined}
                  target={h.url ? '_blank' : undefined}
                  rel="noreferrer"
                  className="seq-pieza"
                  title={`Pieza ${i + 1} · ${hora(h.fecha)}`}
                >
                  <span className="seq-n num">{i + 1}</span>
                  {h.thumbnail
                    ? <img src={h.thumbnail} alt="" loading="lazy" />
                    : <span className="seq-sinfoto dim">sin foto</span>}
                  <span className="seq-datos">
                    <span className="num">{n(h.views)}</span>
                    <span className="dim">vistas</span>
                    {h.replies > 0 && (
                      <>
                        <span className="num seq-respuestas">{n(h.replies)}</span>
                        <span className="dim">resp.</span>
                      </>
                    )}
                  </span>
                </a>
              ))}
            </div>
          </Card>
        );
      })}
    </>
  );
}
