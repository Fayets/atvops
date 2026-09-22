import { formatValue } from '../../lib/format.js';

/**
 * De dónde salió cada chat del mes, puerta por puerta.
 *
 * El KPI muestra un total que es una suma, así que tiene que poder abrirse: qué secuencia
 * de historias trajo cuántas respuestas y qué palabra abrió cuántos DM. Sin esto el número
 * se discute —"¿1.380 de dónde?"— en vez de usarse para decidir qué contenido repetir.
 *
 * Cada puerta muestra sus filas aunque esté en cero: una puerta vacía es información, y
 * esconderla haría parecer que no existe.
 */

const n = (v) => formatValue(v ?? 0, 'count');

const fecha = (iso) =>
  (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—');

/* Las palabras del CRM son muchas y con cola larga —hay leads guardados con varias
   palabras juntas—. Se muestran las que mueven la aguja y el resto se dice en una línea,
   sin esconderlo: la suma tiene que seguir cerrando a la vista. */
const TOPE = 10;

/** Cómo se llama una fila en cada puerta, para que la cola diga qué son las que faltan. */
const FILA = {
  historias: ['secuencia', 'secuencias'],
  reels: ['palabra', 'palabras'],
  otras: ['chat', 'chats'],
};

function Puerta({ parte, total }) {
  const todas = parte.filas ?? [];
  const filas = todas.slice(0, TOPE);
  const cola = todas.slice(TOPE);
  const enLaCola = cola.reduce((acc, f) => acc + (Number(f.cuantos) || 0), 0);
  const peso = total ? Math.round((parte.cuantos / total) * 100) : null;

  return (
    <section className="chats-puerta">
      <header>
        <div>
          <h4>{parte.fuente}</h4>
          <span className="dim">{parte.detalle}</span>
        </div>
        <div className="chats-puerta-n">
          <span className="num">{n(parte.cuantos)}</span>
          {peso != null && <span className="dim">{peso}% del total</span>}
        </div>
      </header>

      {todas.length === 0 ? (
        <div className="empty">Esta puerta no trajo nada este mes.</div>
      ) : (
        <div className="chats-filas">
          {filas.map((f, i) => (
            <div key={`${f.quien}-${f.cuando ?? i}`} className="chats-fila">
              {f.cuando && <span className="num dim">{fecha(f.cuando)}</span>}
              <span className="chats-quien">
                {f.foto && <img src={f.foto} alt="" loading="lazy" />}
                {f.quien}
              </span>
              <span className="dim">{f.dato ?? ''}</span>
              <span className="num strong">{n(f.cuantos)}</span>
            </div>
          ))}
          {cola.length > 0 && (
            <div className="chats-fila cola">
              <span className="chats-quien dim">
                y {n(cola.length)} {(FILA[parte.clave] ?? FILA.otras)[cola.length === 1 ? 0 : 1]} más
              </span>
              <span className="dim" />
              <span className="num strong dim">{n(enLaCola)}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * @param {{ chats: { total: number, partes: Array<object> }, onCerrar: () => void }} props
 */
export default function DeDondeVienenLosChats({ chats, onCerrar }) {
  const partes = chats?.partes ?? [];
  const total = Number(chats?.total ?? 0);

  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card chats-detalle" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="De dónde vienen los chats">
        <header>
          <div>
            <h3>De dónde vienen los {n(total)} chats</h3>
            <span className="dim">
              Un chat es una conversación que arrancó porque el contenido la pidió.
            </span>
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>

        <div className="chats-puertas">
          {partes.map((p) => <Puerta key={p.clave} parte={p} total={total} />)}
        </div>

        <footer className="dim">
          Las historias suman solo si están marcadas con CTA en Marketing → Historias. Las
          palabras las escucha ManyChat, que no mira historias: por eso las puertas se suman
          sin contar a nadie dos veces.
        </footer>
      </div>
    </div>
  );
}
