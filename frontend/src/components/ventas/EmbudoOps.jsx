import { formatValue } from '../../lib/format.js';

/**
 * El embudo del setting visto desde Ops: chats, pitches, agendas y shows.
 *
 * Es la versión corta del que ve el setter (`EmbudoSetting`): sin metas, sin detalle y
 * sin el botón de marcar pitch. Las cuatro etapas se llenan solas y cada una viene de un
 * lado distinto —los chats de los avisos de ManyChat (o, mientras no lleguen, de las
 * respuestas a historias), los pitches del reporte del setter, las agendas del calendario,
 * los shows de las reuniones que ocurrieron—. Conversaciones no está acá a propósito: es
 * el detalle del día a día y vive en la vista del setter.
 *
 * La tasa va montada en la juntura entre dos fichas, no al costado: así se lee como lo
 * que es, el salto de una etapa a la otra, y no como una quinta columna.
 */

/** Los rangos sanos de cada salto. Sin esto la tasa es un número sin veredicto. */
const RANGOS = {
  pitch: { ok: 30, warn: 20 },
  booking: { ok: 25, warn: 15 },
  show: { ok: 80, warn: 65 },
};

/** Una tasa solo existe si el denominador existe: 0 sobre 0 no es 0%. */
function tasa(arriba, abajo) {
  if (!abajo) return null;
  return Math.round((arriba / abajo) * 1000) / 10;
}

/**
 * El color juzga el número contra su rango. Más de 100% no es un récord: es que las dos
 * etapas no están contando los mismos leads —agendas que entraron sin pitch cargado, por
 * ejemplo—. Pintarlo de verde sería mentir, así que se queda sin veredicto.
 */
function veredicto(valor, rango) {
  if (valor == null || valor > 100) return '';
  if (valor >= rango.ok) return ' es-ok';
  if (valor >= rango.warn) return ' es-warn';
  return ' es-alert';
}

/** De dónde salió el número de chats. Si no salió de ningún lado, hay que decirlo. */
const FUENTE_CHATS = {
  conversaciones: 'automático · ManyChat',
  historias: 'automático · respuestas a historias',
};

function Ficha({ etapa, n, pie, atenuado }) {
  return (
    <div className={`embudo-ficha${atenuado ? ' atenuada' : ''}`}>
      <span className="embudo-etapa">{etapa}</span>
      <span className="embudo-n">{n == null ? '—' : formatValue(n, 'count')}</span>
      <span className="embudo-pie">{pie}</span>
    </div>
  );
}

/** El sello sobre la unión de dos fichas. */
function Salto({ valor, rango, label }) {
  const juicio = veredicto(valor, rango);
  return (
    <>
      <div className="embudo-hueco" />
      <div className="embudo-juntura">
        <div className={`embudo-pastilla${juicio}`}>
          <span className="embudo-tasa">{valor == null ? '—' : formatValue(valor, 'pct')}</span>
          <span className="embudo-salto-label">{label}</span>
        </div>
      </div>
      <div className="embudo-hueco" />
    </>
  );
}

/**
 * @param {{ setting: object }} props El objeto que devuelve GET /api/ventas/setting.
 */
export default function EmbudoOps({ setting = {} }) {
  const chats = Number(setting.chats ?? 0);
  const pitches = Number(setting.pitches ?? 0);
  const agendas = Number(setting.agendas ?? 0);
  const shows = Number(setting.shows ?? 0);
  const fuente = FUENTE_CHATS[setting.chatsFuente] || '';

  // El show rate lo calcula ventas contra las llamadas que YA pasaron, no contra todas
  // las agendas del mes: dividir por las futuras da rojo hasta el día 30.
  const showRate = setting.showRate ?? tasa(shows, agendas);

  return (
    <section className="card embudo-card">
      <div className="embudo-fila">
        <Ficha etapa="Chats" n={fuente ? chats : null} pie={fuente || 'sin conectar'} atenuado={!fuente} />
        <Salto valor={tasa(pitches, chats)} rango={RANGOS.pitch} label="a pitch" />
        <Ficha etapa="Pitches" n={pitches} pie={pitches ? 'del reporte del setter' : 'sin cargar'} />
        <Salto valor={tasa(agendas, pitches)} rango={RANGOS.booking} label="booking" />
        <Ficha etapa="Agendas" n={agendas} pie="del calendario" />
        <Salto valor={showRate} rango={RANGOS.show} label="show" />
        <Ficha etapa="Shows" n={shows} pie="llamadas que ocurrieron" />
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
