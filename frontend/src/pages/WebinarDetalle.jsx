import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import {
  actualizarWebinar, crearWebinar, getCampaniasMeta, getWebinar,
} from '../data/api.js';
import { useMes } from '../lib/MesContext.jsx';
import { formatValue } from '../lib/format.js';
import {
  CAMPOS_RAW, BENCHMARKS_COLD, fasesDeWebinar, proyeccionDesdeMeta,
} from '../lib/webinarFases.js';

const CTA_OPTS = [
  { value: 'call_funnel', label: 'Call funnel' },
  { value: 'checkout', label: 'Checkout directo' },
  { value: 'formulario', label: 'Formulario de calificación' },
];

const ESTADO = {
  borrador: { tone: 'off', label: 'borrador' },
  configurado: { tone: 'info', label: 'configurado' },
  en_vivo: { tone: 'ok', label: 'en vivo' },
  finalizado: { tone: 'warn', label: 'finalizado' },
};

const SEMAFORO_LABEL = {
  ok: 'verde',
  warn: 'amarillo',
  alert: 'rojo',
  off: 'sin datos',
};

const VACIO = {
  nombre: '',
  fechaHora: '',
  tema: '',
  ctaTipo: 'call_funnel',
  precioUsd: 0,
  landingUrl: '',
  thankYouUrl: '',
  calendlyUrl: '',
  whatsappGrupo: '',
  campaniasAds: [],
  notas: '',
};

function aInputDatetime(iso) {
  if (!iso) return '';
  const s = String(iso).replace(' ', 'T');
  return s.length >= 16 ? s.slice(0, 16) : s;
}

function rawDesdeWebinar(w) {
  const crudas = w.metricasCrudas || {};
  const m = w.metricas || {};
  const out = {};
  for (const c of CAMPOS_RAW) {
    const v = crudas[c.key] ?? m[c.key];
    out[c.key] = v != null && v !== '' ? Number(v) : 0;
  }
  // Compat: shows viejo → vivos
  if (!out.vivos && (crudas.shows || m.shows)) {
    out.vivos = Number(crudas.shows || m.shows) || 0;
  }
  if (m.gastoAdsUsd != null) out.gastoAdsUsd = Number(m.gastoAdsUsd) || out.gastoAdsUsd;
  return out;
}

function fmtMetrica(valor, formato) {
  if (valor == null) return '—';
  if (formato === 'pct') return `${valor}%`;
  if (formato === 'usd') return formatValue(valor, 'usd');
  return formatValue(valor, 'count');
}

/**
 * Crear o editar un webinar: config + ads + dashboard de 3 fases.
 */
export default function WebinarDetalle({ modo } = {}) {
  const { id } = useParams();
  const esNuevo = modo === 'nuevo' || id === 'nuevo';
  const navigate = useNavigate();
  const { mes } = useMes();

  const [form, setForm] = useState(VACIO);
  const [estado, setEstado] = useState('borrador');
  const [raw, setRaw] = useState({});
  const [benchmarks, setBenchmarks] = useState({});
  const [campanias, setCampanias] = useState([]);
  const [metaCash, setMetaCash] = useState('');
  const [cargando, setCargando] = useState(!esNuevo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    getCampaniasMeta(mes).then(setCampanias).catch(() => setCampanias([]));
  }, [mes]);

  useEffect(() => {
    if (esNuevo) return undefined;
    let vivo = true;
    setCargando(true);
    getWebinar(id)
      .then((w) => {
        if (!vivo) return;
        setForm({
          nombre: w.nombre || '',
          fechaHora: aInputDatetime(w.fechaHora),
          tema: w.tema || '',
          ctaTipo: w.ctaTipo || 'call_funnel',
          precioUsd: w.precioUsd || 0,
          landingUrl: w.landingUrl || '',
          thankYouUrl: w.thankYouUrl || '',
          calendlyUrl: w.calendlyUrl || '',
          whatsappGrupo: w.whatsappGrupo || '',
          campaniasAds: w.campaniasAds || [],
          notas: w.notas || '',
        });
        setEstado(w.estado || 'borrador');
        setRaw(rawDesdeWebinar(w));
        setBenchmarks(w.benchmarks || {});
        setError(null);
      })
      .catch((e) => vivo && setError(e))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [id, esNuevo]);

  const elegidas = useMemo(
    () => new Set((form.campaniasAds || []).map((c) => String(c.id))),
    [form.campaniasAds],
  );

  const fases = useMemo(
    () => fasesDeWebinar(raw, { gastoAdsUsd: raw.gastoAdsUsd, benchmarks }),
    [raw, benchmarks],
  );

  const proyeccion = useMemo(() => {
    if (!metaCash) return null;
    const m = fases[0]?.valores || {};
    return proyeccionDesdeMeta({
      metaCash,
      precio: form.precioUsd,
      closeRate: m.closeRate || BENCHMARKS_COLD.closeRateCalls.verdeMin,
      bookingRate: m.bookingRate || 20,
      showRate: m.showRate || 30,
      costoPorRegistrante: m.costoPorRegistrante || 10,
    });
  }, [metaCash, form.precioUsd, fases]);

  const toggleCampania = (c) => {
    const cid = String(c.id);
    const ya = elegidas.has(cid);
    const next = ya
      ? form.campaniasAds.filter((x) => String(x.id) !== cid)
      : [...form.campaniasAds, { id: cid, nombre: c.nombre || cid }];
    set({ campaniasAds: next });
  };

  const payload = () => ({
    nombre: form.nombre.trim(),
    fechaHora: form.fechaHora ? form.fechaHora.replace('T', ' ') : null,
    tema: form.tema.trim() || null,
    ctaTipo: form.ctaTipo,
    precioUsd: Number(form.precioUsd) || 0,
    landingUrl: form.landingUrl.trim() || null,
    thankYouUrl: form.thankYouUrl.trim() || null,
    calendlyUrl: form.calendlyUrl.trim() || null,
    whatsappGrupo: form.whatsappGrupo.trim() || null,
    campaniasAds: form.campaniasAds,
    notas: form.notas.trim() || null,
  });

  const guardar = async () => {
    if (!form.nombre.trim()) {
      setAviso('Poné un nombre al webinar.');
      return;
    }
    setGuardando(true);
    setAviso('');
    try {
      if (esNuevo) {
        const w = await crearWebinar(payload());
        navigate(`/webinars/${w.id}`, { replace: true });
      } else {
        const w = await actualizarWebinar(id, payload());
        setEstado(w.estado || estado);
        setRaw(rawDesdeWebinar(w));
        setAviso('Guardado.');
      }
    } catch (e) {
      setAviso(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const guardarMetricas = async (patch) => {
    if (esNuevo) return;
    setGuardando(true);
    try {
      const body = { ...patch, shows: patch.vivos ?? patch.shows };
      const w = await actualizarWebinar(id, { metricas: body });
      setRaw(rawDesdeWebinar(w));
      setAviso('Métricas actualizadas.');
    } catch (e) {
      setAviso(e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
        <Link to="/webinars" className="btn ghost">← Volver</Link>
      </div>
    );
  }

  if (cargando) {
    return <div className="page"><SkeletonBlock height={360} /></div>;
  }

  const est = ESTADO[estado] || ESTADO.borrador;

  return (
    <div className="page">
      <PageHeader
        title={esNuevo ? 'Nuevo webinar' : form.nombre || 'Webinar'}
        desc={esNuevo ? 'Configurá el evento. Después podés duplicarlo y solo cambiar fecha, tema y ads.' : undefined}
        actions={(
          <div className="webinar-head-actions">
            {!esNuevo && <Pill tone={est.tone} dot>{est.label}</Pill>}
            <Link to="/webinars" className="btn ghost">Listado</Link>
            <button type="button" className="btn primary" disabled={guardando} onClick={guardar}>
              {guardando ? 'Guardando…' : esNuevo ? 'Crear' : 'Guardar'}
            </button>
          </div>
        )}
      />
      {aviso && (
        <p className={`webinar-aviso${aviso.startsWith('Guard') || aviso.startsWith('Métr') ? '' : ' error'}`}>
          {aviso}
        </p>
      )}

      {!esNuevo && (
        <section className="webinar-fases">
          {fases.map((fase) => (
            <FaseCard key={fase.id} fase={fase} />
          ))}
        </section>
      )}

      {!esNuevo && (
        <Card
          title="Funnel math"
          sub="Desde la meta de cash, qué necesita cada fase para que el webinar llegue."
        >
          <div className="webinar-funnel-math">
            <label>Meta de cash (USD)
              <input
                type="number"
                min="0"
                step="100"
                value={metaCash}
                onChange={(e) => setMetaCash(e.target.value)}
                placeholder="Ej: 40000"
              />
            </label>
            {proyeccion && (
              <div className="webinar-proyeccion">
                <div><span className="num">{proyeccion.cierresNecesarios}</span><span className="dim">cierres</span></div>
                <div><span className="num">{proyeccion.booked ?? '—'}</span><span className="dim">booked / calls</span></div>
                <div><span className="num">{proyeccion.retenidosPitch ?? '—'}</span><span className="dim">retenidos pitch</span></div>
                <div><span className="num">{proyeccion.registros ?? '—'}</span><span className="dim">registros</span></div>
                <div><span className="num">{proyeccion.gastoAdsUsd != null ? formatValue(proyeccion.gastoAdsUsd, 'usd') : '—'}</span><span className="dim">gasto ads</span></div>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="webinar-layout">
        <Card title="Configuración">
          <div className="webinar-form">
            <label>Nombre
              <input value={form.nombre} onChange={(e) => set({ nombre: e.target.value })}
                placeholder="Ej: Webinar Closing Intensivo — Sep" />
            </label>
            <label>Fecha y hora
              <input type="datetime-local" value={form.fechaHora}
                onChange={(e) => set({ fechaHora: e.target.value })} />
            </label>
            <label className="ancho">Tema / ángulo
              <input value={form.tema} onChange={(e) => set({ tema: e.target.value })}
                placeholder="Qué se vende y con qué ángulo" />
            </label>
            <label>Tipo de CTA
              <select value={form.ctaTipo} onChange={(e) => set({ ctaTipo: e.target.value })}>
                {CTA_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>Precio de la oferta (USD)
              <input type="number" min="0" step="1" value={form.precioUsd}
                onChange={(e) => set({ precioUsd: e.target.value })} />
            </label>
            <label className="ancho">Landing URL
              <input type="url" value={form.landingUrl} onChange={(e) => set({ landingUrl: e.target.value })}
                placeholder="https://…" />
            </label>
            <label className="ancho">Thank you page
              <input type="url" value={form.thankYouUrl} onChange={(e) => set({ thankYouUrl: e.target.value })}
                placeholder="https://…" />
            </label>
            <label className="ancho">Calendly del webinar
              <input type="url" value={form.calendlyUrl} onChange={(e) => set({ calendlyUrl: e.target.value })}
                placeholder="https://calendly.com/… — uno por webinar, no se comparte" />
            </label>
            <label className="ancho">Grupo de WhatsApp
              <input value={form.whatsappGrupo} onChange={(e) => set({ whatsappGrupo: e.target.value })}
                placeholder="Link o nombre del grupo" />
            </label>
            <label className="ancho">Notas internas
              <textarea rows={3} value={form.notas} onChange={(e) => set({ notas: e.target.value })} />
            </label>
          </div>
        </Card>

        <Card
          title="Campañas de ads"
          sub="Elegí cuáles mandan tráfico a este webinar. Las métricas de gasto se leen de Meta."
        >
          {campanias.length === 0 ? (
            <p className="dim">No hay campañas disponibles este mes (o falta el token de Meta Ads).</p>
          ) : (
            <ul className="webinar-ads">
              {campanias.map((c) => {
                const on = elegidas.has(String(c.id));
                return (
                  <li key={c.id}>
                    <label className={`webinar-ad${on ? ' on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleCampania(c)} />
                      <span className="webinar-ad-nombre">{c.nombre}</span>
                      <span className="dim">{c.estado}</span>
                      <span className="num dim">{formatValue(c.gastoUsd, 'usd')}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {form.campaniasAds.length > 0 && (
            <p className="dim webinar-ads-pie">
              {form.campaniasAds.length} campaña{form.campaniasAds.length === 1 ? '' : 's'} vinculada
              {form.campaniasAds.length === 1 ? '' : 's'}.
            </p>
          )}
        </Card>
      </div>

      {!esNuevo && (
        <Card
          title="Cargar números"
          sub="Raw de cada fase. Las tasas y el semáforo se calculan solos."
        >
          <MetricasForm initial={raw} disabled={guardando} onGuardar={guardarMetricas} />
        </Card>
      )}
    </div>
  );
}

function FaseCard({ fase }) {
  const portada = fase.portada;
  return (
    <article className={`webinar-fase sem-${fase.semaforo}`}>
      <header className="webinar-fase-head">
        <div className="webinar-fase-titulos">
          <span className="webinar-fase-n">Fase {fase.n}</span>
          <h2>{fase.titulo}</h2>
          <p className="dim">{fase.desde} → {fase.hasta}</p>
        </div>
        <div className="webinar-fase-portada">
          <span className="webinar-semaforo" title={SEMAFORO_LABEL[fase.semaforo]} aria-label={SEMAFORO_LABEL[fase.semaforo]} />
          <div>
            <span className="num">{fmtMetrica(portada?.valor, portada?.formato)}</span>
            <span className="dim">{portada?.label || fase.portadaLabel}</span>
          </div>
        </div>
      </header>
      <ul className="webinar-fase-metricas">
        {fase.metricas.map((m) => (
          <li key={m.key} className={m.portada ? 'portada' : ''}>
            <span className="num">{fmtMetrica(m.valor, m.formato)}</span>
            <span className="dim" title={m.ayuda || undefined}>{m.label}</span>
          </li>
        ))}
      </ul>
      {fase.cuello && <p className="webinar-fase-cuello dim">{fase.cuello}</p>}
    </article>
  );
}

function MetricasForm({ initial, disabled, onGuardar }) {
  const [f, setF] = useState(() => Object.fromEntries(CAMPOS_RAW.map((c) => [c.key, initial[c.key] ?? 0])));

  useEffect(() => {
    setF(Object.fromEntries(CAMPOS_RAW.map((c) => [c.key, initial[c.key] ?? 0])));
  }, [initial]);

  const porFase = useMemo(() => {
    const g = { registro: [], dia: [], post: [] };
    for (const c of CAMPOS_RAW) g[c.fase].push(c);
    return g;
  }, []);

  const titulos = { registro: 'Fase 1 — Registro', dia: 'Fase 2 — Día', post: 'Fase 3 — Post' };

  return (
    <div className="webinar-metricas-bloques">
      {Object.entries(porFase).map(([fase, campos]) => (
        <div key={fase} className="webinar-metricas-bloque">
          <h3>{titulos[fase]}</h3>
          <div className="webinar-metricas-form">
            {campos.map((c) => (
              <label key={c.key}>{c.label}
                <input
                  type="number"
                  min="0"
                  step={c.tipo === 'usd' ? '0.01' : '1'}
                  value={f[c.key]}
                  onChange={(e) => setF((x) => ({ ...x, [c.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn sm"
        disabled={disabled}
        onClick={() => {
          const patch = {};
          for (const c of CAMPOS_RAW) {
            patch[c.key] = Number(f[c.key]) || 0;
          }
          onGuardar(patch);
        }}
      >
        Actualizar métricas
      </button>
    </div>
  );
}
