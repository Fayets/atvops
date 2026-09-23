import { useState } from 'react';
import { formatValue } from '../../lib/format.js';

/**
 * El closing: los cuatro números, el PIF con sus dos lecturas y la disposición.
 *
 * La disposición es la parte más diagnóstica: dice DÓNDE se cae el embudo sin tener que
 * adivinar. Mucho No show es setting o follow-up previo; mucho Descalificado es setting;
 * mucho "No tiene la plata" es calificación u oferta; mucho "Lo voy a pensar" es el closer.
 *
 * El close rate solo mira Cerrado / shows. Las señas no entran: la venta todavía no está
 * hecha. Tocando la tarjeta se ve la proyección si esas señas cierran antes de fin de mes.
 */

// Verdes para la plata que entró, rojo y naranja para lo que se perdió, grises para lo
// que sigue abierto. Es el único lugar del tablero donde el color opina, porque acá la
// pregunta es justamente si el resultado fue bueno o malo.
const COLOR = {
  Cerrado: '#15803d',
  'Seña': '#4d9c6d',
  'No show': '#b91c1c',
  Descalificado: '#b45309',
  'No tiene la plata': '#d97706',
  'Lo voy a pensar': '#57534e',
  Seguimiento: '#a8a29e',
};
const TINTA_CLARA = new Set(['Seguimiento']);

function Kpi({ titulo, valor, pie, tono, onVer, verLabel }) {
  return (
    <div
      className={`card kpi-closing${onVer ? ' clickable' : ''}`}
      onClick={onVer}
      role={onVer ? 'button' : undefined}
      tabIndex={onVer ? 0 : undefined}
      onKeyDown={onVer ? (e) => (e.key === 'Enter' || e.key === ' ') && onVer() : undefined}
    >
      <div className="kpi-closing-titulo">{titulo}</div>
      <div className={`kpi-closing-valor${tono ? ` ${tono}` : ''}`}>{valor}</div>
      <div className="kpi-closing-pie">{pie}</div>
      {onVer && <div className="kpi-closing-ver">{verLabel ?? 'ver proyección'}</div>}
    </div>
  );
}

/** Proyección si las señas del mes también cierran. */
function ProyeccionCloseRate({ d, onCerrar }) {
  const cierres = d.cierres ?? 0;
  const senas = d.senas ?? 0;
  const shows = d.shows ?? 0;
  const proyectado = d.closeRateProyectado;
  const real = d.closeRate;

  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div
        className="modal-card close-proyeccion"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Proyección close rate"
      >
        <header className="modal-cab">
          <div>
            <h3>Proyección close rate</h3>
            <p className="dim">
              Si se cierran las señas que hay este mes. El close rate de la tarjeta solo
              cuenta llamadas Cerrado: la seña todavía no es una venta hecha.
            </p>
          </div>
          <button type="button" className="btn sm" onClick={onCerrar}>Cerrar</button>
        </header>

        <div className="close-proyeccion-cuerpo">
          <div className="close-proyeccion-kpi">
            <div className="kpi-closing-titulo">Proyección</div>
            <div className="kpi-closing-valor">
              {proyectado == null ? '—' : `${formatValue(proyectado, 'num')}%`}
            </div>
            <div className="kpi-closing-pie">
              {senas > 0
                ? `${cierres + senas} cierres (${cierres} + ${senas} ${senas === 1 ? 'seña' : 'señas'}) sobre ${shows} shows`
                : `Sin señas abiertas · igual al close rate (${real == null ? '—' : `${formatValue(real, 'num')}%`})`}
            </div>
          </div>

          <div className="close-proyeccion-vs">
            <div>
              <span className="dim">Hoy (solo Cerrado)</span>
              <strong className="num">{real == null ? '—' : `${formatValue(real, 'num')}%`}</strong>
            </div>
            <div>
              <span className="dim">Señas del mes</span>
              <strong className="num">{senas}</strong>
            </div>
            <div>
              <span className="dim">Si cierran</span>
              <strong className="num">
                {proyectado == null || real == null
                  ? '—'
                  : `+${formatValue(Math.max(0, proyectado - real), 'num')} pts`}
              </strong>
            </div>
          </div>

          {senas > 0 && (
            <p className="close-proyeccion-nota">
              Hay {senas} {senas === 1 ? 'seña' : 'señas'} en juego. Convertirlas antes de
              fin de mes sube el close rate de{' '}
              <b>{real == null ? '—' : `${formatValue(real, 'num')}%`}</b> a{' '}
              <b>{proyectado == null ? '—' : `${formatValue(proyectado, 'num')}%`}</b>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{ data: object }} props
 */
export default function BloqueClosing({ data = {} }) {
  const d = data ?? {};
  const [verProyeccion, setVerProyeccion] = useState(false);
  const disp = d.disposiciones ?? { total: 0, sinReportar: 0, tajadas: [] };
  const conVolumen = (disp.tajadas ?? []).filter((t) => t.n > 0);
  const masGrande = conVolumen[0]
    ? [...conVolumen].sort((a, b) => b.n - a.n)[0]
    : null;

  // El show rate se calcula sobre lo resuelto. Si hay muchas sin reportar, el número es
  // frágil y hay que decirlo: un 84% con un tercio de las llamadas sin saber qué pasó no
  // es un show rate sólido.
  const resueltas = (d.shows ?? 0) + (d.noShows ?? 0);
  const showFragil = d.sinReportar > resueltas / 3;
  const senas = d.senas ?? 0;

  return (
    <div className="closing">
      <div className="closing-kpis">
        <Kpi
          titulo="Close rate"
          valor={d.closeRate == null ? '—' : `${formatValue(d.closeRate, 'num')}%`}
          pie={`${d.cierres ?? 0} cierres sobre ${d.shows ?? 0} shows${
            senas ? ` · ${senas} ${senas === 1 ? 'seña' : 'señas'} no cuentan` : ' · solo Cerrado'
          }`}
          onVer={() => setVerProyeccion(true)}
          verLabel={senas ? 'proyección si cierran las señas' : 'ver proyección'}
        />
        <Kpi
          titulo="AOV"
          valor={formatValue(d.averageSaleUsd ?? 0, 'usd')}
          pie="cash sobre cierres, no sobre señas"
        />
        <Kpi
          titulo="Cash collected"
          valor={formatValue(d.cashUsd ?? 0, 'usd')}
          pie={`de ${d.ventas ?? 0} ventas · lo que entró de verdad`}
        />
        <Kpi
          titulo="Show rate"
          valor={d.showRate == null ? '—' : `${formatValue(d.showRate, 'num')}%`}
          pie={`${d.shows ?? 0} de ${resueltas} resueltas${d.sinReportar ? ` · ${d.sinReportar} sin reportar` : ''}`}
          tono={showFragil ? 'warn' : ''}
        />
      </div>

      <section className="card pif">
        <div className="pif-titulo">
          <div className="pif-etiqueta">PIF rate</div>
          <div className="dim">pagado completo</div>
        </div>
        <div className="pif-lectura">
          <div className="pif-n warn">{d.pifPorDeuda == null ? '—' : `${formatValue(d.pifPorDeuda, 'num')}%`}</div>
          <div className="pif-detalle">
            por deuda
            <span className="dim">{(d.ventas ?? 0) - (d.ventasConPlan ?? 0)} de {d.ventas ?? 0} no debe nada</span>
          </div>
        </div>
        <div className="pif-sep" />
        <div className="pif-lectura">
          <div className="pif-n dim">{d.pifPorEstado == null ? '—' : `${formatValue(d.pifPorEstado, 'num')}%`}</div>
          <div className="pif-detalle">
            por estado
            <span className="dim">{d.cierres ?? 0} de {d.ventas ?? 0} figuran Cerrado</span>
          </div>
        </div>
        <div className="pif-nota">
          {d.ventasConPlan > 0 ? (
            <>
              <strong>{d.ventasConPlan} de {d.ventas} ventas tienen plan de pago.</strong> La diferencia
              entre los dos números es plata que todavía no está.
            </>
          ) : (
            'Todas las ventas del mes están saldadas.'
          )}
        </div>
      </section>

      <section className="card disp">
        <header className="disp-head">
          <h3>Disposición en llamada</h3>
          <span className="dim">
            {disp.total} llamadas resueltas · dónde se cae el embudo
          </span>
        </header>

        {disp.total === 0 ? (
          <div className="empty">Todavía no hay llamadas con resultado este mes.</div>
        ) : (
          <>
            <div className="disp-barra">
              {conVolumen.map((t) => (
                <div
                  key={t.disposicion}
                  className="disp-tajada"
                  style={{ width: `${t.pct}%`, background: COLOR[t.disposicion] ?? '#a8a29e' }}
                  title={`${t.disposicion}: ${t.n}`}
                >
                  <span style={{ color: TINTA_CLARA.has(t.disposicion) ? '#1c1917' : '#ffffff' }}>
                    {t.pct >= 7 ? `${t.pct}%` : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Las tajadas en cero también se listan: si se esconden, nadie se entera de
                que existen ni de por qué van a empezar a aparecer. */}
            <div className="disp-leyenda">
              {(disp.tajadas ?? []).map((t) => (
                <div key={t.disposicion} className={`disp-item${t.n === 0 ? ' vacio' : ''}`}>
                  <i style={{ background: COLOR[t.disposicion] ?? '#a8a29e' }} />
                  <span>{t.disposicion}</span>
                  <strong>{t.n}</strong>
                </div>
              ))}
            </div>
          </>
        )}

        <footer className="disp-pie">
          {masGrande && (
            <div>
              <strong>{masGrande.disposicion} se lleva el {masGrande.pct}%</strong>
              {masGrande.disposicion === 'Seguimiento'
                ? ' — es el cajón donde se esconde todo. Se va a abrir a medida que Fathom lea las llamadas y separe la plata de la duda.'
                : '.'}
            </div>
          )}
          {disp.sinReportar > 0 && (
            <div className="disp-pie-aparte">
              <strong>{disp.sinReportar} llamadas sin reportar</strong> no entran en el reparto.
              Repartirlas maquillaría justo el número que se mira para decidir.
            </div>
          )}
        </footer>
      </section>

      {verProyeccion && <ProyeccionCloseRate d={d} onCerrar={() => setVerProyeccion(false)} />}
    </div>
  );
}
