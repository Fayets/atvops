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
import { BENCHMARKS_COLD, BENCHMARKS_META, CAMPOS_RAW, umbralesDe } from '../lib/webinarFases.js';

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
  // Solo lo que este webinar pisa del estándar. Vacío = usar el de tráfico frío, así que
  // si mañana cambia el estándar, los webinars que no lo tocaron se actualizan solos.
  benchmarks: {},
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
  if (!out.vivos && (crudas.shows || m.shows)) {
    out.vivos = Number(crudas.shows || m.shows) || 0;
  }
  if (m.gastoAdsUsd != null) out.gastoAdsUsd = Number(m.gastoAdsUsd) || out.gastoAdsUsd;
  return out;
}

/**
 * Config de un webinar: datos, ads y carga de números.
 * El embudo vive en el home `/webinars`.
 */
export default function WebinarDetalle({ modo } = {}) {
  const { id } = useParams();
  const esNuevo = modo === 'nuevo' || id === 'nuevo';
  const navigate = useNavigate();
  const { mes } = useMes();

  const [form, setForm] = useState(VACIO);
  const [estado, setEstado] = useState('borrador');
  const [raw, setRaw] = useState({});
  const [campanias, setCampanias] = useState([]);
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
          benchmarks: w.benchmarks || {},
          landingUrl: w.landingUrl || '',
          thankYouUrl: w.thankYouUrl || '',
          calendlyUrl: w.calendlyUrl || '',
          whatsappGrupo: w.whatsappGrupo || '',
          campaniasAds: w.campaniasAds || [],
        });
        setEstado(w.estado || 'borrador');
        setRaw(rawDesdeWebinar(w));
        setError(null);
      })
      .catch((e) => vivo && setError(e))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [id, esNuevo]);

  // Orden del selector: primero las que ya están vinculadas —para no perderlas de vista
  // entre doce pausadas—, después las activas, y al final por gasto. El backend ordena
  // por gasto para el tablero de Ads, que es otra pregunta.
  const campaniasOrdenadas = useMemo(() => {
    const vinculadas = new Set((form.campaniasAds || []).map((c) => String(c.id)));
    const peso = (c) => {
      if (vinculadas.has(String(c.id))) return 0;
      if (c.estado === 'activa') return 1;
      return 2;
    };
    return [...campanias].sort(
      (a, b) => peso(a) - peso(b) || (b.gastoUsd || 0) - (a.gastoUsd || 0),
    );
  }, [campanias, form.campaniasAds]);

  const elegidas = useMemo(
    () => new Set((form.campaniasAds || []).map((c) => String(c.id))),
    [form.campaniasAds],
  );

  const toggleCampania = (c) => {
    const cid = String(c.id);
    const ya = elegidas.has(cid);
    const next = ya
      ? form.campaniasAds.filter((x) => String(x.id) !== cid)
      : [...form.campaniasAds, { id: cid, nombre: c.nombre || cid }];
    set({ campaniasAds: next });
  };

  /** Guarda un umbral. Vaciar el campo borra el override y vuelve al estándar: guardar
   *  cero ahí significaría "el verde arranca en 0", que es otra cosa muy distinta. */
  const setBenchmark = (clave, umbral, valor) => {
    setForm((f) => {
      const bm = { ...(f.benchmarks || {}) };
      const suyo = { ...(bm[clave] || {}) };
      if (String(valor).trim() === '') delete suyo[umbral];
      else suyo[umbral] = Number(valor);
      if (Object.keys(suyo).length) bm[clave] = suyo;
      else delete bm[clave];
      return { ...f, benchmarks: bm };
    });
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
    benchmarks: form.benchmarks,
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
        localStorage.setItem('atv.webinar.activo', String(w.id));
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
            <Link to="/webinars" className="btn ghost">Embudo</Link>
            <Link to="/webinars/listado" className="btn ghost">Listado</Link>
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
            <label className="ancho">Comunicación del webinar
              <textarea rows={4} value={form.tema} onChange={(e) => set({ tema: e.target.value })}
                placeholder="Mensaje, ángulo y cómo se comunica el evento" />
            </label>
            <label>Tipo de CTA
              <select value={form.ctaTipo} onChange={(e) => set({ ctaTipo: e.target.value })}>
                {CTA_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
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
          </div>
        </Card>

        <Card
          title="Benchmarks"
          sub="Contra qué se pinta cada número de este webinar"
          foot="Lo que dejes vacío usa el estándar de tráfico frío. Un webinar a lista caliente
                o de otro rubro tiene otros números: cambialos acá, no en el código."
        >
          <div className="bm-grid">
            {BENCHMARKS_META.map((meta) => {
              const u = umbralesDe(meta);
              const propio = form.benchmarks?.[meta.key] || {};
              const base = BENCHMARKS_COLD[meta.key] || {};
              const sufijo = meta.unidad === 'usd' ? 'US$' : '%';
              return (
                <div key={meta.key} className="bm-fila">
                  <span className="bm-nombre">{meta.label}</span>
                  <label className="bm-campo">
                    <span className="dim">{u.ayudaVerde}</span>
                    <input
                      type="number" min="0" inputMode="decimal"
                      value={propio[u.verde] ?? ''}
                      placeholder={String(base[u.verde] ?? '')}
                      onChange={(e) => setBenchmark(meta.key, u.verde, e.target.value)}
                    />
                    <span className="dim">{sufijo}</span>
                  </label>
                  <label className="bm-campo">
                    <span className="dim">{u.ayudaAmarillo}</span>
                    <input
                      type="number" min="0" inputMode="decimal"
                      value={propio[u.amarillo] ?? ''}
                      placeholder={String(base[u.amarillo] ?? '')}
                      onChange={(e) => setBenchmark(meta.key, u.amarillo, e.target.value)}
                    />
                    <span className="dim">{sufijo}</span>
                  </label>
                </div>
              );
            })}
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
              {campaniasOrdenadas.map((c) => {
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
          sub="Raw de cada fase. Las tasas y el semáforo se calculan solos en el embudo."
        >
          <MetricasForm initial={raw} disabled={guardando} onGuardar={guardarMetricas} />
        </Card>
      )}
    </div>
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
