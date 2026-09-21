/**
 * El update leído por persona: una ficha por cada uno con los hilos que tiene
 * encima, del más viejo al más nuevo.
 *
 * Es el formato que pidió Mauri. La idea es que se lea de un saque quién está
 * tapado y qué se está durmiendo, cosa que en el bloque de texto había que
 * reconstruir leyendo entero.
 */

const TIPO_LABEL = {
  consulta: 'Consulta',
  entregable: 'Entregable',
  agenda: 'Agenda',
  feedback: 'Feedback',
  seguimiento: 'Recordatorio',
  problema: 'Problema',
};

const ESTADO_LABEL = {
  esperando_equipo: 'Esperando al equipo',
  en_proceso: 'En proceso',
  esperando_cliente: 'Esperando al cliente',
};

/** Un canal sin nombre es un id de Discord: se mencionó, pero no tiene transcript propio. */
const sinNombre = (canal) => /^\d+$/.test(canal ?? '');

/** "1d 4h" es más rápido de leer que "28,0 h" cuando lo que importa es si se durmió. */
function espera(horas) {
  if (horas == null) return '—';
  if (horas < 1) return 'recién';
  if (horas < 24) return `${Math.round(horas)}h`;
  const d = Math.floor(horas / 24);
  const h = Math.round(horas - d * 24);
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** El reloj es el único color con opinión: naranja pasadas 8 horas, rojo pasado el día. */
function tonoEspera(horas) {
  if (horas >= 24) return 'alert';
  if (horas >= 8) return 'warn';
  return '';
}

function Hilo({ hilo }) {
  const anonimo = sinNombre(hilo.canal);
  return (
    <div className="upd-hilo">
      <span className={`upd-canal${anonimo ? ' anonimo' : ''}`} title={anonimo ? 'Mencionado en otro canal, sin transcript propio' : `#${hilo.canal}`}>
        {anonimo ? 'sin canal' : `#${hilo.canal}`}
      </span>
      <span className="upd-tipo">{TIPO_LABEL[hilo.tipo] ?? hilo.tipo}</span>
      <span className="upd-tema" title={hilo.nota || ESTADO_LABEL[hilo.estado] || ''}>{hilo.tema}</span>
      <span className={`upd-espera ${tonoEspera(hilo.horasAbierto)}`}>{espera(hilo.horasAbierto)}</span>
    </div>
  );
}

function Ficha({ ficha, esCuello }) {
  const n = ficha.hilos.length;
  return (
    <section className="upd-ficha">
      <header>
        <h4>{ficha.responsable}</h4>
        {ficha.area && <span className="upd-area">{ficha.area}</span>}
        <span className={`upd-carga${esCuello ? ' alert' : ''}${n === 0 ? ' cero' : ''}`}>{n}</span>
      </header>
      {n === 0 ? (
        <div className="upd-limpio">Sin hilos abiertos.</div>
      ) : (
        <div className="upd-hilos">
          {ficha.hilos.map((h) => (
            <Hilo key={h.id} hilo={h} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * @param {{ fichas: Array<object>, resumen: object }} props
 */
export default function FichasUpdate({ fichas = [], resumen = {} }) {
  const conHilos = fichas.filter((f) => f.hilos.length > 0);
  const limpios = fichas.filter((f) => f.hilos.length === 0);
  const cuello = resumen.cuello?.responsable;
  const viejos = resumen.masViejos ?? [];
  const repetidos = resumen.repetidos ?? [];
  const sinCanal = resumen.sinCanalPropio ?? [];

  if (fichas.length === 0) return null;

  return (
    <div className="upd">
      {(cuello || viejos.length > 0 || repetidos.length > 0) && (
        <div className="upd-resumen">
          <div className="upd-resumen-col">
            <div className="upd-resumen-tit">Lo que hay que mirar</div>
            {cuello ? (
              <p>
                <strong>{cuello} es el cuello</strong> — {resumen.cuello.hilos} de los{' '}
                {conHilos.reduce((s, f) => s + f.hilos.length, 0)} hilos abiertos.
              </p>
            ) : (
              <p className="dim">La carga está repartida: nadie concentra los hilos.</p>
            )}
            {viejos.length > 0 && (
              <p className="dim">
                Lo más viejo es{' '}
                {viejos.map((v, i) => (
                  <span key={`${v.canal}-${i}`}>
                    {i > 0 && ' y '}
                    <strong>{sinNombre(v.canal) ? v.tema : `#${v.canal}`}</strong> ({espera(v.horasAbierto)}, {v.responsable})
                  </span>
                ))}
                .
              </p>
            )}
          </div>
          {repetidos.length > 0 && (
            <div className="upd-resumen-col angosta">
              <div className="upd-resumen-tit">Dos personas en el mismo cliente</div>
              {repetidos.map((r) => (
                <p key={r.canal} className="dim">
                  <strong>{sinNombre(r.canal) ? 'sin canal' : `#${r.canal}`}</strong> — {r.personas.join(' y ')}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="upd-grid">
        {conHilos.map((f) => (
          <Ficha key={f.responsable} ficha={f} esCuello={f.responsable === cuello} />
        ))}
      </div>

      {limpios.length > 0 && (
        <div className="upd-limpios">
          <span className="dim">Sin hilos abiertos:</span> {limpios.map((f) => f.responsable).join(' · ')}
        </div>
      )}

      {sinCanal.length > 0 && (
        <div className="upd-nota-pie">
          {sinCanal.length} {sinCanal.length === 1 ? 'canal quedó' : 'canales quedaron'} sin resolver: se los mencionó en
          otra conversación, pero no tienen transcript propio para leer.
        </div>
      )}
    </div>
  );
}
