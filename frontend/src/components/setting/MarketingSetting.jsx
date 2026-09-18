import Card from '../ui/Card.jsx';
import { pct } from '../../lib/setting.js';

/**
 * La mirada de marketing: qué trajo cada fuente, si la diferencia entre fuentes ya se
 * puede afirmar, y en qué se distingue un lead de un lado y del otro.
 *
 * El orden es a propósito: primero los conteos, después si esos conteos alcanzan. Una
 * tasa sacada de cinco casos parece igual de firme que una de cincuenta, y no lo es.
 */

const COLUMNAS = [
  { k: 'pitches', t: 'pitches' },
  { k: 'pitchesPendientes', t: 'sin responder', tenue: true },
  { k: 'agendas', t: 'agendó' },
  { k: 'ghosted', t: 'ghosteó', tenue: true },
  { k: 'denied', t: 'dijo que no', tenue: true },
  { k: 'shows', t: 'shows' },
  { k: 'noShows', t: 'no show', tenue: true },
  { k: 'cierres', t: 'closes' },
];

const TASAS = [{ k: 'booking', t: 'book' }, { k: 'show', t: 'show' }, { k: 'close', t: 'close' }];

const SENALES = [
  { k: 'tasaCaida', titulo: 'Se caen en la conversación', nota: 'ghosted + denied sobre los resueltos · menos es mejor', sufijo: '%' },
  { k: 'followUps', titulo: 'Follow-ups para agendar', nota: 'promedio · más alto = más conversación' },
  { k: 'cashPorPitch', titulo: 'Cash por pitch', nota: 'cobrado ÷ pitches', sufijo: ' USD' },
  { k: 'diasAAgendar', titulo: 'Días hasta la agenda', nota: 'desde el pitch · menos es mejor' },
];

const val = (v, sufijo = '') => (v == null ? '—' : `${v}${sufijo}`);

export default function MarketingSetting({ m }) {
  const f = m?.fuentes;
  if (!f) return null;
  const filas = [
    { id: 'organico', label: 'org', d: f.organico },
    { id: 'ads', label: 'ads', d: f.ads },
    { id: 'total', label: 'total', d: f.total },
  ];

  return (
    <>
      <Card
        title="Oportunidades por fuente"
        flush
        foot="Las tasas van al costado y en gris a propósito: con estos volúmenes todavía se mueven mucho y no valen lo que un conteo. Lo firme es la izquierda."
      >
        <div className="tfuentes">
          <table>
            <thead>
              <tr>
                <th />
                {COLUMNAS.map((c) => <th key={c.k} className={c.tenue ? 'tenue' : ''}>{c.t}</th>)}
                <th className="sep" />
                {TASAS.map((t) => <th key={t.k} className="col-tasa">{t.t}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.id} className={fila.id === 'total' ? 'total' : ''}>
                  <td className="fuente"><span className={`fuente-marca ${fila.id}`}>{fila.label}</span></td>
                  {COLUMNAS.map((c) => (
                    <td key={c.k} className={`num${c.tenue ? ' dim' : ''}`}>{fila.d[c.k]}</td>
                  ))}
                  <td className="sep" />
                  {TASAS.map((t) => <td key={t.k} className="num col-tasa">{pct(fila.d[t.k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {f.sinFuente > 0 && (
          <p className="dim nota-pendientes">
            {f.sinFuente} {f.sinFuente === 1 ? 'lead no tiene' : 'leads no tienen'} fuente marcada y quedan fuera de la comparación.
          </p>
        )}
      </Card>

      <Card
        title="Qué tan firmes son estos números"
        foot="Una tasa sacada de 5 datos y otra sacada de 26 se ven iguales en pantalla y no valen lo mismo. Esto no dice cuál gana: dice si ya se puede afirmar que alguna gana."
      >
        <div className="firmeza">
          {f.confianza.map((c) => (
            <div key={c.clave} className="firmeza-fila">
              <span className={`firmeza-punto${c.concluyente ? ' si' : ''}`} />
              <span className="firmeza-nombre">{c.label}</span>
              <span className="firmeza-texto dim">
                {c.concluyente
                  ? 'la diferencia ya no se explica por azar'
                  : c.necesarios
                    ? `todavía puede ser azar — harían falta ~${c.necesarios} resueltos por fuente`
                    : 'las dos fuentes van casi igual: la fuente no explica esta etapa'}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Calidad del lead" sub="En qué se distingue el lead que entra por cada lado">
        <div className="fuente-senales">
          {SENALES.map((s) => (
            <div key={s.k} className="fuente-senal">
              <span className="fuente-senal-titulo">{s.titulo}</span>
              <span className="fuente-senal-nota dim">{s.nota}</span>
              <div className="fuente-senal-valores">
                <span><span className="fuente-marca organico">org</span> <b className="num">{val(f.organico[s.k], s.sufijo)}</b></span>
                <span><span className="fuente-marca ads">ads</span> <b className="num">{val(f.ads[s.k], s.sufijo)}</b></span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
