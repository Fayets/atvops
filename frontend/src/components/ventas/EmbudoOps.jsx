import { useState } from 'react';
import DeDondeVienenLosChats from '../marketing/DeDondeVienenLosChats.jsx';
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

function Ficha({ etapa, n, pie, atenuado, onVer }) {
  const Tag = onVer ? 'button' : 'div';
  return (
    <Tag
      type={onVer ? 'button' : undefined}
      className={`embudo-ficha${atenuado ? ' atenuada' : ''}${onVer ? ' clickable' : ''}`}
      onClick={onVer}
    >
      <span className="embudo-etapa">{etapa}</span>
      <span className="embudo-n">{n == null ? '—' : formatValue(n, 'count')}</span>
      <span className="embudo-pie">{pie}</span>
    </Tag>
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
  const [verChats, setVerChats] = useState(false);
  const chats = Number(setting.chats ?? 0);
  const pitches = Number(setting.pitches ?? 0);
  const agendas = Number(setting.agendas ?? 0);
  const shows = Number(setting.shows ?? 0);
  const partes = setting.chatsPartes ?? [];
  const conChats = partes.some((p) => Number(p.cuantos) > 0);

  // El show rate lo calcula ventas contra las llamadas que YA pasaron, no contra todas
  // las agendas del mes: dividir por las futuras da rojo hasta el día 30.
  const showRate = setting.showRate ?? tasa(shows, agendas);

  // Cero chats teniendo secuencias publicadas casi siempre es olvido de marcar el CTA,
  // no un mes sin historias. Vale la pena decirlo distinto.
  const secuencias = Number(setting.secuenciasDelPeriodo ?? 0);
  const sinMarcar = secuencias > 0 && Number(setting.secuenciasConCta ?? 0) === 0;

  return (
    <section className="card embudo-card">
      <div className="embudo-fila">
        <Ficha
          etapa="Chats"
          n={conChats ? chats : null}
          pie={conChats ? 'tocá para ver de dónde' : 'ninguna puerta trajo chats'}
          atenuado={!conChats}
          onVer={conChats ? () => setVerChats(true) : undefined}
        />
        <Salto valor={tasa(pitches, chats)} rango={RANGOS.pitch} label="a pitch" />
        <Ficha etapa="Pitches" n={pitches} pie={pitches ? 'del reporte del setter' : 'sin cargar'} />
        <Salto valor={tasa(agendas, pitches)} rango={RANGOS.booking} label="booking" />
        <Ficha etapa="Agendas" n={agendas} pie="del calendario" />
        <Salto valor={showRate} rango={RANGOS.show} label="show" />
        <Ficha etapa="Shows" n={shows} pie="llamadas que ocurrieron" />
      </div>

      {/* Un solo aviso, el primero que rompe: dos carteles juntos no los lee nadie. */}
      {!conChats && sinMarcar ? (
        <div className="embudo-aviso">
          <i className="dot warn" />
          <span>
            <strong>
              Hay {formatValue(secuencias, 'count')} {secuencias === 1 ? 'secuencia' : 'secuencias'} de
              historias este mes y ninguna marcada con CTA.
            </strong>{' '}
            Solo suman chats las que pedían algo: se marcan con el botón CTA en Marketing → Historias.
          </span>
        </div>
      ) : !conChats ? (
        <div className="embudo-aviso">
          <i className="dot warn" />
          <span>
            <strong>Ninguna puerta trajo chats este mes.</strong> Entran por historias con CTA,
            reels marcados a mano, YouTube y lo que venga por otro canal.
          </span>
        </div>
      ) : null}

      {verChats && (
        <DeDondeVienenLosChats
          chats={{ total: chats, partes }}
          onCerrar={() => setVerChats(false)}
        />
      )}
    </section>
  );
}
