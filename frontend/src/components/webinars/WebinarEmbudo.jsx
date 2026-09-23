import { Link } from 'react-router-dom';
import { formatValue } from '../../lib/format.js';

const SEMAFORO_LABEL = {
  ok: 'verde',
  warn: 'amarillo',
  alert: 'rojo',
  off: 'sin datos',
};

function fmtMetrica(valor, formato) {
  if (valor == null) return '—';
  if (formato === 'pct') return `${valor}%`;
  if (formato === 'usd') return formatValue(valor, 'usd');
  return formatValue(valor, 'count');
}

function FlechaTransicion({ label, valor }) {
  const texto = valor == null ? '—' : `${valor}%`;
  return (
    <div className="wb-flecha">
      <div className="wb-flecha-linea" aria-hidden />
      <span className="wb-flecha-pill">
        <span className="wb-flecha-arrow" aria-hidden>↓</span>
        {label}: <strong>{texto}</strong>
      </span>
      <div className="wb-flecha-linea" aria-hidden />
    </div>
  );
}

function FaseBloque({ fase, ancho, href }) {
  if (!fase) return null;
  const portada = fase.portada;
  const body = (
    <>
      <div className="wb-fase-glow" aria-hidden />
      <header className="wb-fase-head">
        <div className="wb-fase-portada">
          <span
            className="wb-semaforo"
            title={SEMAFORO_LABEL[fase.semaforo]}
            aria-label={SEMAFORO_LABEL[fase.semaforo]}
          />
          <div>
            <span className="wb-fase-valor">{fmtMetrica(portada?.valor, portada?.formato)}</span>
            <span className="wb-fase-label">{portada?.label || fase.portadaLabel}</span>
          </div>
        </div>
        <div className="wb-fase-meta">
          <span className="wb-fase-n">Fase {fase.n} · {fase.titulo}</span>
          <p>{fase.desde} → {fase.hasta}</p>
          <span className="wb-fase-cta">Ver detalle →</span>
        </div>
      </header>
      <ul className="wb-fase-grid">
        {fase.metricas.map((m) => (
          <li key={m.key}>
            <span className="wb-m-num">{fmtMetrica(m.valor, m.formato)}</span>
            <span className="wb-m-lab" title={m.ayuda || undefined}>{m.label}</span>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div className={`wb-fase-wrap ${ancho}`}>
      {href ? (
        <Link to={href} className={`wb-fase fase-${fase.id} sem-${fase.semaforo}`}>
          {body}
        </Link>
      ) : (
        <article className={`wb-fase fase-${fase.id} sem-${fase.semaforo}`}>
          {body}
        </article>
      )}
    </div>
  );
}

/**
 * Embudo visual Registro → Día → Post (gradientes + anchos decrecientes).
 */
export default function WebinarEmbudo({ fases, webinarId }) {
  if (!fases?.length) return null;
  const [f1, f2, f3] = fases;
  const base = webinarId ? `/webinars/${webinarId}/fase` : null;
  return (
    <section className="wb-embudo" aria-label="Embudo del webinar">
      <FaseBloque fase={f1} ancho="wb-w1" href={base ? `${base}/registro` : undefined} />
      <FlechaTransicion label="Show rate" valor={f1?.valores?.showRate} />
      <FaseBloque fase={f2} ancho="wb-w2" href={base ? `${base}/dia` : undefined} />
      <FlechaTransicion label="Booking rate" valor={f2?.valores?.bookingRate} />
      <FaseBloque fase={f3} ancho="wb-w3" href={base ? `${base}/post` : undefined} />
    </section>
  );
}

export function FunnelMathBar({ metaCash, onMetaCash, proyeccion }) {
  return (
    <div className="wb-funnel-math">
      <label className="wb-meta-cash">Meta de cash (USD)
        <input
          type="number"
          min="0"
          step="100"
          value={metaCash}
          onChange={(e) => onMetaCash(e.target.value)}
          placeholder="Ej: 40000"
        />
      </label>
      {proyeccion && (
        <div className="wb-proyeccion" aria-label="Proyección del funnel">
          <div className="wb-seg s1">
            <span className="num">{proyeccion.registros ?? '—'}</span>
            <span className="dim">Registros</span>
          </div>
          <div className="wb-seg s2">
            <span className="num">{proyeccion.retenidosPitch ?? '—'}</span>
            <span className="dim">Retenidos pitch</span>
          </div>
          <div className="wb-seg s3">
            <span className="num">{proyeccion.booked ?? '—'}</span>
            <span className="dim">Booked / calls</span>
          </div>
          <div className="wb-seg s4">
            <span className="num">{proyeccion.cierresNecesarios}</span>
            <span className="dim">Cierres</span>
          </div>
          <div className="wb-seg gasto">
            <span className="num">
              {proyeccion.gastoAdsUsd != null ? formatValue(proyeccion.gastoAdsUsd, 'usd') : '—'}
            </span>
            <span className="dim">Gasto ads</span>
          </div>
        </div>
      )}
    </div>
  );
}

export { fmtMetrica, SEMAFORO_LABEL };
