import { formatValue } from '../../lib/format.js';

/**
 * El embudo del setting visto desde Ops: chats, pitches y agendas.
 *
 * Es la versión corta del que ve el setter (`EmbudoSetting`): las tres etapas se llenan
 * solas y cada una viene de un lado distinto —los chats de los avisos de ManyChat (o,
 * mientras no lleguen, de las respuestas a historias), los pitches del reporte del setter,
 * las agendas del calendario—. Conversaciones no está acá a propósito: es el detalle del
 * día a día y vive en la vista del setter, no en Ops.
 */

/** Una tasa solo se muestra si el denominador existe: 0 sobre 0 no es 0%. */
function tasa(arriba, abajo) {
  if (!abajo) return null;
  return Math.round((arriba / abajo) * 100);
}

/** De dónde salió el número de chats. Si no salió de ningún lado, hay que decirlo. */
const FUENTE_CHATS = {
  conversaciones: 'automático · ManyChat',
  historias: 'automático · respuestas a historias',
};

function Escalon({ etapa, n, pie, atenuado }) {
  return (
    <div className={`embudo-escalon${atenuado ? ' atenuado' : ''}`}>
      <div className="embudo-etapa">{etapa}</div>
      <div className="embudo-n">{n == null ? '—' : formatValue(n, 'num')}</div>
      <div className="embudo-pie">{pie}</div>
    </div>
  );
}

function Paso({ valor, label }) {
  return (
    <div className="embudo-paso">
      <div className={`embudo-tasa${valor == null ? ' vacia' : ''}`}>{valor == null ? '—' : `${valor}%`}</div>
      <div className="embudo-paso-label">{label}</div>
    </div>
  );
}

/**
 * @param {{ setting: object }} props El objeto que devuelve GET /api/ventas/setting.
 */
export default function EmbudoOps({ setting = {} }) {
  const chats = Number(setting.chats ?? 0);
  const pitches = Number(setting.pitches ?? 0);
  const agendas = Number(setting.agendas ?? 0);
  const fuente = FUENTE_CHATS[setting.chatsFuente] || '';

  return (
    <section className="card embudo-card">
      <div className="embudo-fila">
        <Escalon etapa="Chats" n={fuente ? chats : null} pie={fuente || 'sin conectar'} atenuado={!fuente} />
        <Paso valor={tasa(pitches, chats)} label="a pitch" />
        <Escalon etapa="Pitches" n={pitches} pie={pitches ? 'del reporte del setter' : 'sin cargar'} />
        <Paso valor={tasa(agendas, pitches)} label="booking" />
        <Escalon etapa="Agendas" n={agendas} pie="del calendario" />
      </div>

      {/* Un solo aviso, el primero que rompe: dos carteles juntos no los lee nadie. */}
      {!fuente ? (
        <div className="embudo-aviso">
          <i className="dot warn" />
          <span>
            <strong>Todavía no entra ningún chat.</strong> Los avisa el flujo de ManyChat cuando
            alguien escribe la palabra de un reel o de la bio: hasta que ese bloque apunte acá, la
            primera etapa queda vacía.
          </span>
        </div>
      ) : !pitches ? (
        <div className="embudo-aviso">
          <i className="dot warn" />
          <span>
            <strong>Nadie cargó pitches este mes.</strong> El pitch lo reporta quien manda el link
            de agenda: sin eso, no se ve dónde se cae el embudo entre el chat y la agenda.
          </span>
        </div>
      ) : null}
    </section>
  );
}
