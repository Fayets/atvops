import { useEffect, useMemo, useState } from 'react';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { getLabClosing } from '../data/api.js';
import { formatValue } from '../lib/format.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';

/**
 * Laboratorio Closing: las llamadas grabadas, una tarjeta por llamada.
 *
 * Se lee como la carpeta de "Documentos recientes": una hoja en miniatura con lo que la
 * IA sacó de la grabación, y abajo quién, cuándo y cómo salió. Tocar la tarjeta abre la
 * ficha: la grabación a la izquierda, el análisis a la derecha. No se calcula nada
 * nuevo acá —todo viene de lo que dejó el webhook de Fathom y de lo que cargó el closer—;
 * lo que cambia es poder mirar una llamada entera sin ir a buscarla a tres lugares.
 */

const FILTROS = [
  { clave: 'todas', label: 'Todas' },
  { clave: 'cerradas', label: 'Cerradas' },
  { clave: 'seguimiento', label: 'Seguimiento' },
  { clave: 'otras', label: 'Sin venta' },
  { clave: 'sin_resultado', label: 'Sin resultado' },
];

const TONO_GRUPO = { cerradas: 'ok', seguimiento: 'warn', otras: 'off', sin_resultado: 'off' };

const usd = (n) => (n == null ? null : formatValue(n, 'usd'));
const corta = (iso) => (iso
  ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  : '—');
const larga = (iso) => (iso
  ? new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    + ' · ' + new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  : '—');

/** El encaje con el programa: puntaje, veredicto y color. */
function encajeDe(ia) {
  const n = ia?.encajePuntaje;
  if (n == null) return { texto: 'sin datos', tono: 'off', n: null };
  const v = (ia.encaje || '').toLowerCase();
  const tono = v === 'ok' ? 'ok' : v === 'no' ? 'alert' : 'warn';
  return { texto: `${n} / 10 · ${ia.encaje || ''}`.trim(), tono, n };
}

/** Qué dos cosas resume la hoja en miniatura de cada tarjeta. */
function hojaDe(l) {
  const ia = l.ia || {};
  const enc = encajeDe(ia);
  const bloques = [];
  if (ia.encajeMotivo) bloques.push({ titulo: 'Encaje', texto: ia.encajeMotivo });
  if (ia.objecion) bloques.push({ titulo: 'Objeción', texto: ia.objecion });
  else if (ia.resumen) bloques.push({ titulo: l.grupo === 'cerradas' ? 'Por qué cerró' : 'Quién es', texto: ia.resumen });
  if (bloques.length < 2 && ia.proximoPaso) bloques.push({ titulo: 'Próximo paso', texto: ia.proximoPaso });
  if (bloques.length === 0 && ia.nota) bloques.push({ titulo: 'Qué pasó', texto: ia.nota });
  return { enc, bloques: bloques.slice(0, 2) };
}

function Tarjeta({ l, onAbrir }) {
  const { enc, bloques } = hojaDe(l);
  return (
    <button type="button" className={`lab-tarjeta${l.cargada ? '' : ' sin-cargar'}`} onClick={onAbrir}>
      <div className="lab-hoja">
        <div className="lab-hoja-papel">
          <div className="lab-hoja-fila">
            <span className="lab-hoja-k">Encaje</span>
            <span className={`lab-hoja-encaje ${enc.tono}`}>{enc.texto}</span>
          </div>
          {bloques.map((b) => (
            <div key={b.titulo}>
              <div className="lab-hoja-k">{b.titulo}</div>
              <div className="lab-hoja-t">{b.texto}</div>
            </div>
          ))}
          {bloques.length === 0 && <div className="lab-hoja-t dim">La IA todavía no leyó esta grabación.</div>}
        </div>
        <span className="lab-fathom" title="Grabada en Fathom" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 1.5l8 4.5-8 4.5z" /></svg>
        </span>
      </div>
      <div className="lab-pie">
        <div className="lab-nombre">{l.prospecto}</div>
        <div className="lab-meta">
          <span className={`lab-estado ${TONO_GRUPO[l.grupo] || 'off'}`}><i />{l.estado}</span>
          <span>·</span><span>{corta(l.fechaAt)}</span>
          {l.closer && <><span>·</span><span>{l.closer}</span></>}
        </div>
      </div>
    </button>
  );
}

function Campo({ titulo, children, tenue }) {
  if (!children) return null;
  return (
    <div className="lab-campo">
      <div className="lab-k">{titulo}</div>
      <div className={`lab-v${tenue ? ' dim' : ''}`}>{children}</div>
    </div>
  );
}

function Ficha({ l, onCerrar }) {
  const ia = l.ia || {};
  const enc = encajeDe(ia);
  const iniciales = l.prospecto.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card lab-ficha" onClick={(e) => e.stopPropagation()} role="dialog"
        aria-label={`Ficha de ${l.prospecto}`}>
        <section className="lab-ficha-izq">
          {l.fathomEmbed ? (
            <iframe className="lab-video" src={l.fathomEmbed} title={`Grabación de ${l.prospecto}`}
              allow="fullscreen" />
          ) : (
            <div className="lab-portada">
              <span className="lab-portada-ini">{iniciales}</span>
              <span className="lab-portada-txt">
                {l.fathomUrl ? 'Grabación en Fathom' : 'Sin grabación'}
              </span>
            </div>
          )}
          <div className="lab-ficha-datos">
            <div className="lab-ficha-cab">
              <div>
                <h2>{l.prospecto}</h2>
                <div className="dim">{larga(l.fechaAt)}{l.closer ? ` · con ${l.closer}` : ''}</div>
              </div>
              <span className={`lab-estado grande ${TONO_GRUPO[l.grupo] || 'off'}`}><i />{l.estado}</span>
            </div>
            <div className="lab-ficha-grid">
              <div><div className="lab-k">Programa</div><div className="lab-n">{l.programa || ia.plan || '—'}</div></div>
              <div><div className="lab-k">Cash</div>
                <div className="lab-n" style={l.cashUsd || ia.cashUsd ? { color: 'var(--ok)' } : undefined}>
                  {usd(l.cashUsd || ia.cashUsd || null) || '—'}
                </div></div>
              <div><div className="lab-k">Factura hoy</div>
                <div className="lab-n">{ia.facturacionUsd ? `${usd(ia.facturacionUsd)} / mes` : '—'}</div></div>
            </div>
            <div className="lab-ficha-acciones">
              {l.fathomUrl && (
                <a className="btn" href={l.fathomUrl} target="_blank" rel="noreferrer">
                  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1.5l8 4.5-8 4.5z" /></svg>
                  Ver en Fathom
                </a>
              )}
              <a className="btn ghost" href="/ventas/llamadas">Abrir en Llamadas</a>
            </div>
          </div>
        </section>

        <section className="lab-ficha-der">
          <header>
            <div>
              <div className="lab-k">Laboratorio de closing</div>
              <h3>Qué pasó adentro de la llamada</h3>
            </div>
            <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
          </header>

          {Object.keys(ia).some((k) => ia[k] != null) ? (
            <div className="lab-analisis">
              <div className="lab-encaje">
                <div className={`lab-encaje-n ${enc.tono}`}>
                  {enc.n != null ? <><b>{enc.n}</b><span>de 10</span></> : <span>s/d</span>}
                </div>
                <div>
                  <div className="lab-encaje-t">
                    Encaje con el programa: <span className={enc.tono}>{enc.n != null ? (ia.encaje || '') : 'sin datos'}</span>
                  </div>
                  <div className="lab-v">{ia.encajeMotivo || 'La transcripción no dio datos para juzgarlo.'}</div>
                </div>
              </div>

              <div className="lab-dos">
                <Campo titulo="Quién es">{ia.resumen}</Campo>
                <Campo titulo="Qué pasó">{ia.nota}</Campo>
              </div>
              <Campo titulo="Objeción" tenue={!ia.objecion}>{ia.objecion || 'No apareció ninguna.'}</Campo>
              <Campo titulo="Desvío de la oferta">{ia.desvioOferta}</Campo>
              {ia.proximoPaso && (
                <div className="lab-proximo">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                  <div>
                    <div className="lab-k">Próximo paso</div>
                    <div className="lab-v">{ia.proximoPaso}</div>
                  </div>
                </div>
              )}

              <footer className="lab-coincide">
                {l.coincide ? (
                  l.coincide.todo ? (
                    <><span>Lo que cargó {l.closer || 'el closer'} coincide con la grabación: {l.resultado}{l.programa ? ` · ${l.programa}` : ''}{l.cashUsd ? ` · ${usd(l.cashUsd)}` : ''}</span><span className="ok">✓ coincide</span></>
                  ) : (
                    <><span>
                      Cargado: {l.resultado}{l.programa ? ` · ${l.programa}` : ''}{l.cashUsd != null ? ` · ${usd(l.cashUsd)}` : ''}.
                      {' '}La grabación dice: {ia.estado}{ia.plan ? ` · ${ia.plan}` : ''}{ia.cashUsd != null ? ` · ${usd(ia.cashUsd)}` : ''}.
                    </span><span className="warn">no coincide</span></>
                  )
                ) : l.cargada ? (
                  <span>La IA no pudo leer un resultado en la grabación.</span>
                ) : (
                  <span>{l.closer || 'El closer'} todavía no cargó esta llamada.{ia.estado ? ` La grabación dice: ${ia.estado}.` : ''}</span>
                )}
                {l.reporteAt && <span className="dim">· leída el {corta(l.reporteAt)}</span>}
              </footer>
            </div>
          ) : (
            <p className="dim">La IA todavía no leyó esta grabación.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function LabClosing() {
  const { mes } = useMes();
  const { data, error, loading } = useResource(() => getLabClosing(mes), [mes]);
  const [filtro, setFiltro] = useState('todas');
  const [closer, setCloser] = useState('');
  const [abierta, setAbierta] = useState(null);

  const llamadas = useMemo(() => (data?.llamadas ?? []).filter((l) => (
    (filtro === 'todas' || l.grupo === filtro) && (!closer || l.closer === closer)
  )), [data, filtro, closer]);

  if (loading && !data) return <div className="page"><SkeletonBlock /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  const conteo = data?.conteo ?? {};
  const closers = data?.closers ?? [];
  const seleccionada = abierta != null ? (data?.llamadas ?? []).find((l) => l.id === abierta) : null;

  return (
    <div className="page">
      <div className="lab-cab">
        <div>
          <div className="lab-titulo">Llamadas con grabación</div>
          <div className="dim">
            {conteo.todas ?? 0} {conteo.todas === 1 ? 'llamada analizada' : 'llamadas analizadas'} en el mes · cada una abre su ficha con lo que pasó adentro
          </div>
        </div>
        <div className="lab-filtros">
          {FILTROS.filter((f) => f.clave === 'todas' || conteo[f.clave]).map((f) => (
            <button key={f.clave} type="button" className={`chip${filtro === f.clave ? ' active' : ''}`}
              onClick={() => setFiltro(f.clave)}>
              {f.label} · {conteo[f.clave] ?? 0}
            </button>
          ))}
          {closers.length > 1 && (
            <select className="lab-select" value={closer} onChange={(e) => setCloser(e.target.value)} aria-label="Closer">
              <option value="">Closer: todos</option>
              {closers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

      {llamadas.length === 0 ? (
        <div className="card lab-vacio">
          <h3>No hay llamadas grabadas {filtro !== 'todas' || closer ? 'con ese filtro' : 'este mes'}</h3>
          <p className="dim">
            Las llamadas entran solas cuando Fathom termina de grabar y la IA lee la transcripción.
          </p>
        </div>
      ) : (
        <div className="lab-grilla">
          {llamadas.map((l) => <Tarjeta key={l.id} l={l} onAbrir={() => setAbierta(l.id)} />)}
        </div>
      )}

      <p className="dim" style={{ fontSize: 12 }}>
        Cada tarjeta es una llamada que Fathom grabó y la IA analizó. Las que el closer todavía no
        cargó van con borde punteado. Tocá una para abrir la ficha.
      </p>

      {seleccionada && <Ficha l={seleccionada} onCerrar={() => setAbierta(null)} />}
    </div>
  );
}
