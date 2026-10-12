import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import {
  armarReporte, getReporteAreas, getReporteGuardado, getReportesGuardados, guardarReporte, pedirLecturas,
} from '../data/api.js';
import { formatValue } from '../lib/format.js';
import { useResource } from '../lib/hooks.js';

/**
 * El reporte de dirección, en tres pasos: el período, las áreas, la hoja.
 *
 * La semana dejó de ser la unidad: el período es el que haga falta y se compara con el
 * anterior del mismo largo. Cada área elegida es una sección con sus números y una
 * lectura que propone la IA y que la persona corrige en el mismo lugar. Los números no se
 * tocan; lo que se guarda es la hoja entera, congelada, porque un reporte es del momento
 * en que se escribió.
 */

// Fecha local, no UTC: a la noche en Argentina `toISOString` ya da el día siguiente.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoyIso = () => iso(new Date());
const lunesDe = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

const ATAJOS = [
  { clave: 'semana', label: 'Esta semana', rango: () => { const l = lunesDe(new Date()); return [iso(l), hoyIso()]; } },
  { clave: 'semana_pasada', label: 'Semana pasada', rango: () => { const l = lunesDe(new Date()); l.setDate(l.getDate() - 7); const f = new Date(l); f.setDate(f.getDate() + 6); return [iso(l), iso(f)]; } },
  { clave: 'mes', label: 'Este mes', rango: () => { const h = new Date(); return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), hoyIso()]; } },
  { clave: 'mes_pasado', label: 'Mes pasado', rango: () => { const h = new Date(); return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))]; } },
  { clave: '30', label: 'Últimos 30 días', rango: () => { const d = new Date(); d.setDate(d.getDate() - 29); return [iso(d), hoyIso()]; } },
  { clave: 'trimestre', label: 'Trimestre', rango: () => { const h = new Date(); const q = Math.floor(h.getMonth() / 3) * 3; return [iso(new Date(h.getFullYear(), q, 1)), hoyIso()]; } },
];

const ELEGIDAS_POR_DEFECTO = ['ventas', 'marketing', 'ads', 'fulfillment', 'onboarding'];

const larga = (s) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

function fmt(valor, formato) {
  if (valor == null) return '—';
  if (formato === 'usd') return formatValue(valor, 'usd');
  if (formato === 'pct') return `${valor} %`;
  return formatValue(valor, 'count');
}

function Delta({ k }) {
  if (k.previo == null || k.valor == null) return null;
  const d = k.valor - k.previo;
  if (!d) return <span className="rep-delta dim">igual que antes</span>;
  const sube = d > 0;
  const bien = k.bueno === 'abajo' ? !sube : sube;
  const texto = k.formato === 'pct' ? `${Math.abs(d).toFixed(1)} pts` : fmt(Math.abs(d), k.formato);
  return <span className={`rep-delta ${bien ? 'ok' : 'mal'}`}>{sube ? '▲' : '▼'} {texto} vs anterior</span>;
}

function Pasos({ paso, periodo, areas, onIr }) {
  const items = [
    { n: 1, label: paso > 1 && periodo ? periodo.label : 'Período' },
    { n: 2, label: paso > 2 ? `${areas.length} ${areas.length === 1 ? 'área' : 'áreas'}` : 'Áreas' },
    { n: 3, label: 'Reporte' },
  ];
  return (
    <div className="rep-pasos">
      {items.map((it, i) => (
        <div key={it.n} className="rep-paso-item">
          {i > 0 && <div className="rep-paso-linea" />}
          <button type="button" className={`rep-paso${paso === it.n ? ' actual' : paso > it.n ? ' hecho' : ''}`}
            onClick={() => paso > it.n && onIr(it.n)} disabled={paso <= it.n}>
            <span className="rep-paso-n">{paso > it.n ? '✓' : it.n}</span>
            <span>{it.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Reporte() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [paso, setPaso] = useState(1);
  // Por defecto, del 1° del mes a hoy: es lo que se mira casi siempre.
  const [desde, setDesde] = useState(() => ATAJOS[2].rango()[0]);
  const [hasta, setHasta] = useState(() => ATAJOS[2].rango()[1]);
  const [atajo, setAtajo] = useState('mes');
  const [areas, setAreas] = useState(ELEGIDAS_POR_DEFECTO);
  const [hoja, setHoja] = useState(null);
  const [armando, setArmando] = useState(false);
  const [pidiendoLecturas, setPidiendoLecturas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(null);
  const [error, setError] = useState('');

  const catalogo = useResource(getReporteAreas, []);
  const guardados = useResource(getReportesGuardados, [guardado?.id]);

  // Abrir uno guardado: la hoja viene entera, con sus números de aquel momento.
  useEffect(() => {
    if (!id) return;
    getReporteGuardado(id).then((r) => {
      setHoja(r.hoja); setAreas(r.areas); setDesde(r.desde); setHasta(r.hasta); setGuardado(r); setPaso(3);
    }).catch((e) => setError(e?.message || 'No se pudo abrir el reporte.'));
  }, [id]);

  const elegirAtajo = (a) => { const [d, h] = a.rango(); setDesde(d); setHasta(h); setAtajo(a.clave); };
  const alternar = (clave) => setAreas((xs) => (xs.includes(clave) ? xs.filter((x) => x !== clave) : [...xs, clave]));

  const armar = async () => {
    setArmando(true); setError('');
    try {
      // Primero los datos crudos, sin IA: salen en segundos. Las lecturas se piden aparte.
      const h = await armarReporte({ desde, hasta, areas, lecturas: false });
      setHoja(h); setGuardado(null); setPaso(3);
      if (id) navigate('/reporte', { replace: true });
    } catch (e) {
      setError(e?.message || 'No se pudo armar el reporte.');
    } finally {
      setArmando(false);
    }
  };

  const pedirLecturasDeNuevo = async () => {
    if (!hoja || pidiendoLecturas) return;
    setPidiendoLecturas(true); setError('');
    try {
      const textos = await pedirLecturas(hoja);
      if (!Object.keys(textos).length) setError('La IA no devolvió lecturas. Podés escribirlas vos.');
      setHoja((h) => ({ ...h, secciones: Object.fromEntries(Object.entries(h.secciones).map(([k, s]) => [k, { ...s, lectura: textos[k] ?? s.lectura }])) }));
    } catch (e) {
      setError(e?.message || 'No se pudieron pedir las lecturas.');
    } finally {
      setPidiendoLecturas(false);
    }
  };

  const editarLectura = (clave, texto) => setHoja((h) => ({ ...h, secciones: { ...h.secciones, [clave]: { ...h.secciones[clave], lectura: texto } } }));
  const quitarSeccion = (clave) => setHoja((h) => {
    const secciones = { ...h.secciones }; delete secciones[clave];
    return { ...h, secciones, areas: h.areas.filter((a) => a !== clave) };
  });

  const guardar = async (cerrar) => {
    if (!hoja || guardando) return;
    setGuardando(true); setError('');
    try {
      const r = await guardarReporte({ id: guardado?.id, hoja, titulo: hoja.periodo.label, cerrar });
      setGuardado(r);
    } catch (e) {
      setError(e?.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const secciones = useMemo(() => (hoja ? hoja.areas.filter((a) => hoja.secciones[a]).map((a) => [a, hoja.secciones[a]]) : []), [hoja]);
  const conLectura = secciones.some(([, s]) => s.lectura);

  return (
    <div className={`page rep-page${paso === 3 ? ' rp-page' : ''}`}>
      <Pasos paso={paso} periodo={hoja?.periodo ?? (paso > 1 ? { label: `${larga(desde)} → ${larga(hasta)}` } : null)}
        areas={areas} onIr={setPaso} />

      {paso === 1 && (
        <>
          <section className="card rep-card">
            <h1>¿De qué fecha a qué fecha?</h1>
            <div className="rep-atajos">
              {ATAJOS.map((a) => (
                <button key={a.clave} type="button" className={`chip${atajo === a.clave ? ' active' : ''}`} onClick={() => elegirAtajo(a)}>{a.label}</button>
              ))}
            </div>
            <div className="rep-fechas">
              <div><label htmlFor="rep-desde" className="lab-k">Desde</label>
                <input id="rep-desde" type="date" value={desde} max={hasta} onChange={(e) => { setDesde(e.target.value); setAtajo(''); }} /></div>
              <div><label htmlFor="rep-hasta" className="lab-k">Hasta</label>
                <input id="rep-hasta" type="date" value={hasta} min={desde} max={hoyIso()} onChange={(e) => { setHasta(e.target.value); setAtajo(''); }} /></div>
            </div>
          </section>
          <div className="rep-acciones">
            <span />
            <button type="button" className="btn primary" onClick={() => setPaso(2)} disabled={!desde || !hasta || hasta < desde}>Siguiente: elegir áreas →</button>
          </div>

          {guardados.data?.length > 0 && (
            <section className="card rep-card">
              <h2>Reportes guardados</h2>
              <div className="rep-guardados">
                {guardados.data.map((r) => (
                  <button key={r.id} type="button" className="rep-guardado" onClick={() => navigate(`/reporte/${r.id}`)}>
                    <span className="strong">{r.titulo}</span>
                    <span className="dim">{larga(r.desde)} → {larga(r.hasta)} · {r.areas.length} áreas · {r.estado}{r.creadoPor ? ` · ${r.creadoPor}` : ''}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {paso === 2 && (
        <>
          <section className="card rep-card">
            <div className="rep-card-cab">
              <div>
                <h1>¿Qué áreas entran?</h1>
              </div>
              <div className="rep-links">
                <button type="button" className="btn ghost sm" onClick={() => setAreas((catalogo.data || []).map((a) => a.clave))}>Todas</button>
                <button type="button" className="btn ghost sm" onClick={() => setAreas([])}>Ninguna</button>
              </div>
            </div>
            {catalogo.error ? <ErrorState error={catalogo.error} /> : !catalogo.data ? <SkeletonBlock height={220} /> : (
              <div className="rep-areas">
                {catalogo.data.map((a) => (
                  <label key={a.clave} className={`rep-area${areas.includes(a.clave) ? ' elegida' : ''}`}>
                    <input type="checkbox" checked={areas.includes(a.clave)} onChange={() => alternar(a.clave)} />
                    <span>
                      <span className="rep-area-nombre">{a.label}</span>
                      <span className="rep-area-que">{a.que}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="dim" style={{ marginTop: 16, fontSize: 13 }}>
              {areas.length === 0 ? 'Elegí al menos un área.' : `${areas.length} ${areas.length === 1 ? 'área elegida · una sección' : `áreas elegidas · ${areas.length} secciones`}`}
            </div>
          </section>
          {error && <p className="mal" style={{ fontSize: 13 }}>{error}</p>}
          <div className="rep-acciones">
            <button type="button" className="btn" onClick={() => setPaso(1)}>← Volver al período</button>
            <button type="button" className="btn primary" onClick={armar} disabled={areas.length === 0 || armando}>
              {armando ? 'Armando el reporte…' : 'Armar el reporte →'}
            </button>
          </div>
        </>
      )}

      {paso === 3 && hoja && (
        <>
          <div className="rep-barra no-print">
            <div className="dim" style={{ fontSize: 13 }}>
              Los números salen del sistema y no se tocan. La lectura de cada sección {conLectura ? 'la propuso la IA y ' : 'la escribís vos o se la pedís a la IA, y '}<b>la corregís acá mismo</b>.
              {guardado && <span> · Guardado como <b>{guardado.titulo}</b> ({guardado.estado}).</span>}
            </div>
            <div className="rep-barra-botones">
              {!conLectura && (
                <button type="button" className="btn" onClick={pedirLecturasDeNuevo} disabled={pidiendoLecturas}>
                  {pidiendoLecturas ? 'Escribiendo lecturas… (alrededor de un minuto)' : 'Pedir lecturas a la IA'}
                </button>
              )}
              <button type="button" className="btn" onClick={() => guardar(false)} disabled={guardando}>Guardar borrador</button>
              <button type="button" className="btn" onClick={() => window.print()}>Descargar PDF</button>
              <button type="button" className="btn primary" onClick={() => guardar(true)} disabled={guardando}>
                {guardando ? 'Guardando…' : `Guardar como reporte de ${hoja.periodo.label}`}
              </button>
            </div>
          </div>
          {error && <p className="mal no-print" style={{ fontSize: 13 }}>{error}</p>}

          <article className="rp-doc rep-doc">
            <header className="doc-head">
              <img src="/atv-logo.png" alt="ATV" width={38} height={38} />
              <div>
                <div className="eyebrow">ATV · Reporte de dirección</div>
                <h1>{hoja.periodo.label}</h1>
              </div>
              <div className="doc-per">
                {larga(hoja.periodo.desde)} → {larga(hoja.periodo.hasta)}
                <span>{hoja.periodo.dias} días · comparado con {hoja.periodo.previo.label}</span>
              </div>
            </header>

            {secciones.map(([clave, s]) => (
              <section key={clave} className="doc-bloque rep-seccion">
                <h2>{s.label}
                  <button type="button" className="rep-quitar no-print" onClick={() => quitarSeccion(clave)}>quitar sección</button>
                </h2>
                {s.kpis?.length ? (
                  <div className="rep-kpis">
                    {s.kpis.map((k) => (
                      <div key={k.key} className="rep-kpi">
                        <div className="l">{k.label}</div>
                        <div className={`v${k.tono ? ` ${k.tono}` : ''}`}>{fmt(k.valor, k.formato)}</div>
                        {k.nota && <div className="n">{k.nota}</div>}
                        <Delta k={k} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="dim">{s.detalle?.nota || 'Sin datos en el período.'}</p>
                )}
                {s.detalle?.porCloser?.length > 0 && (
                  <div className="rep-detalle">
                    <div className="lab-k">Por closer</div>
                    {s.detalle.porCloser.map((c, i) => (
                      <div key={`${c.closer}-${i}`}>{c.closer} · {c.agendadas} agendas · {c.shows} shows · {c.cierres} cierres{c.senas ? ` · ${c.senas} señas` : ''} · {formatValue(c.cashUsd, 'usd')}</div>
                    ))}
                  </div>
                )}
                {s.detalle?.porSetter?.length > 0 && (
                  <div className="rep-detalle">
                    <div className="lab-k">Setting por persona</div>
                    {s.detalle.porSetter.map((p, i) => (
                      <div key={`${p.setter}-${i}`}>{p.setter} · {p.conversaciones} conversaciones · {p.agendas} agendas · {p.diasReportados} días reportados</div>
                    ))}
                  </div>
                )}
                {s.detalle?.webinars?.length > 0 && (
                  <div className="rep-detalle">
                    {s.detalle.webinars.map((w, i) => (
                      <div key={`${w.id}-${i}`}>{w.nombre} · {w.fecha} · {w.registros ?? 0} registros · {w.vivos ?? 0} en vivo · {w.llamadasAgendadas ?? 0} llamadas · {w.cierres ?? 0} cierres</div>
                    ))}
                  </div>
                )}
                {s.detalle?.personas?.length > 0 && (
                  <div className="rep-detalle">
                    {s.detalle.personas.map((p, i) => (
                      <div key={`${p.persona}-${i}`}>{p.persona} ({p.rol}) · {p.dias} días reportados{p.sinReportar ? ` · ${p.sinReportar} sin reportar` : ''}</div>
                    ))}
                  </div>
                )}
                {s.detalle?.fuentes?.length > 0 && (
                  <div className="rep-detalle">
                    {s.detalle.fuentes.map((f, i) => (
                      <div key={`${f.nombre}-${i}`}>{f.nombre} · {f.conectado ? 'conectada' : 'sin conectar'}{f.detalle ? ` · ${f.detalle}` : ''}</div>
                    ))}
                  </div>
                )}
                {s.detalle?.nota && s.kpis?.length > 0 && <div className="dim" style={{ fontSize: 12 }}>{s.detalle.nota}</div>}
                <div className="rep-lectura">
                  <label htmlFor={`lectura-${clave}`} className="lab-k">Lectura <span className="dim" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {s.lectura ? 'propuesta por la IA, editable' : 'escribila vos'}</span></label>
                  <textarea id={`lectura-${clave}`} rows={3} value={s.lectura || ''} placeholder="Qué pasó y qué significa, en dos o tres frases."
                    onChange={(e) => editarLectura(clave, e.target.value)} />
                  {s.lectura && <div className="rep-lectura-print">{s.lectura}</div>}
                </div>
              </section>
            ))}

            <footer className="rep-pie dim">
              <span>Generado el {new Date(hoja.generadoAt).toLocaleDateString('es-AR')} · fuentes: calendario del closer, registro de llamadas, Instagram y YouTube, Meta Ads, ATV Clients, ATV Onboarding, transcripts de Discord.</span>
              <button type="button" className="rep-quitar no-print" onClick={() => setPaso(2)}>+ agregar un área</button>
            </footer>
          </article>

          <div className="rep-acciones no-print">
            <button type="button" className="btn" onClick={() => setPaso(2)}>← Volver a las áreas</button>
            <span />
          </div>
        </>
      )}
    </div>
  );
}
