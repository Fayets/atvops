import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TrackingDocsModal from '../components/integraciones/TrackingDocsModal.jsx';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import {
  urlPublica,
  asegurarTrackingWebinar,
  getIntegracionesPanel,
} from '../data/api.js';
import { useResource } from '../lib/hooks.js';

const STATUS = {
  recibiendo: { tone: 'ok', label: 'Recibiendo eventos' },
  inactivo: { tone: 'warn', label: 'Sin eventos recientes' },
  sin_datos: { tone: 'off', label: 'Todavía no llegó nada' },
};

function snippetLanding(token) {
  return `<script src="${urlPublica()}/api/track/sdk.js" data-token="${token}" data-page="landing" async></script>`;
}

function snippetTy(token) {
  return `<script src="${urlPublica()}/api/track/sdk.js" data-token="${token}" data-page="ty" async></script>`;
}

function snippetOptin() {
  return `<!-- Al completar el optin / registro -->\n<script>window.AtvOps && AtvOps.track('optin');</script>`;
}

function snippetWhatsapp() {
  return `<!-- En el click del botón de WhatsApp -->\n<a href="…" onclick="window.AtvOps && AtvOps.track('whatsapp')">WhatsApp</a>`;
}

function hace(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'hace instantes';
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.round(mins / 60);
  if (hs < 48) return `hace ${hs} h`;
  return `hace ${Math.round(hs / 24)} días`;
}

export default function Integraciones() {
  const [tick, setTick] = useState(0);
  const [webinarId, setWebinarId] = useState('');
  const [asegurando, setAsegurando] = useState(false);
  const [copiado, setCopiado] = useState(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [docsOpen, setDocsOpen] = useState(false);

  const { data, loading, error } = useResource(getIntegracionesPanel, [tick]);

  const items = data?.webinars ?? [];
  const plataformas = data?.plataformas ?? {};

  useEffect(() => {
    if (!webinarId && items.length) {
      setWebinarId(String(items[0].webinarId));
    }
  }, [items, webinarId]);

  const selected = useMemo(
    () => items.find((w) => String(w.webinarId) === String(webinarId)) || null,
    [items, webinarId],
  );
  const integ = selected?.integracion || null;
  const statusMeta = STATUS[integ?.status] || STATUS.sin_datos;

  async function generarToken() {
    if (!selected) return;
    setErrorAccion('');
    setAsegurando(true);
    try {
      await asegurarTrackingWebinar(selected.webinarId);
      setTick((n) => n + 1);
    } catch (err) {
      setErrorAccion(err.message || 'No se pudo generar el token.');
    } finally {
      setAsegurando(false);
    }
  }

  async function copiar(texto, id) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1600);
    } catch {
      setErrorAccion('No se pudo copiar.');
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Sistema"
        title="Integraciones"
        desc="Un script por webinar. Lo pegás en la landing y en la thank you: las métricas entran solas."
        actions={
          <label className="int-webinar-sel">
            <span className="dim">Webinar</span>
            <select value={webinarId} onChange={(e) => setWebinarId(e.target.value)}>
              {items.length === 0 ? <option value="">Sin webinars</option> : null}
              {items.map((w) => (
                <option key={w.webinarId} value={w.webinarId}>{w.webinarNombre}</option>
              ))}
            </select>
          </label>
        }
      />

      {error ? <ErrorState error={error} /> : null}
      {loading && !data ? <SkeletonBlock height={280} /> : null}
      {errorAccion ? <p className="error">{errorAccion}</p> : null}

      {data && !selected ? (
        <Card title="Sin webinars">
          <p className="dim">Creá un webinar y acá aparece su script de tracking.</p>
          <Link className="btn" to="/webinars/nuevo">Nuevo webinar</Link>
        </Card>
      ) : null}

      {selected ? (
        <>
          {/* 1. Script */}
          <Card
            title="1. Script de tracking"
            sub="Mismo SDK para todos. Cambia solo el token del webinar."
            actions={
              <div className="int-card-actions">
                <button
                  type="button"
                  className="int-docs-link"
                  onClick={() => setDocsOpen(true)}
                >
                  <Icon name="docs" size={14} />
                  Docs
                </button>
                {!integ ? (
                  <button type="button" className="btn" onClick={generarToken} disabled={asegurando}>
                    {asegurando ? 'Generando…' : 'Generar token'}
                  </button>
                ) : null}
              </div>
            }
          >
            {!integ ? (
              <p className="dim">Este webinar todavía no tiene token. Generarlo crea el conector.</p>
            ) : (
              <div className="int-snips">
                <Snippet
                  titulo="Landing"
                  ayuda="Pegá esto en el head o antes del cierre de body de la landing."
                  codigo={snippetLanding(integ.token)}
                  copiado={copiado === 'landing'}
                  onCopiar={() => copiar(snippetLanding(integ.token), 'landing')}
                />
                <Snippet
                  titulo="Thank you page"
                  ayuda='Misma URL del SDK, con data-page="ty".'
                  codigo={snippetTy(integ.token)}
                  copiado={copiado === 'ty'}
                  onCopiar={() => copiar(snippetTy(integ.token), 'ty')}
                />
                <Snippet
                  titulo="Optin completado"
                  ayuda="Disparalo cuando el form de registro confirma."
                  codigo={snippetOptin()}
                  copiado={copiado === 'optin'}
                  onCopiar={() => copiar(snippetOptin(), 'optin')}
                />
                <Snippet
                  titulo="Click WhatsApp"
                  ayuda="Opcional: cuenta entradas al grupo."
                  codigo={snippetWhatsapp()}
                  copiado={copiado === 'wa'}
                  onCopiar={() => copiar(snippetWhatsapp(), 'wa')}
                />
              </div>
            )}
          </Card>

          {/* 2. Status */}
          <Card
            title="2. Estado de conexión"
            sub="Si el script está bien pegado, acá se mueven los contadores."
            actions={integ ? <Pill tone={statusMeta.tone} dot>{statusMeta.label}</Pill> : null}
          >
            {!integ ? (
              <p className="dim">Sin token no hay eventos que mostrar.</p>
            ) : (
              <>
                <div className="int-status-grid">
                  <Stat label="Landing" value={integ.eventos?.pageview ?? 0} />
                  <Stat label="Optins" value={integ.eventos?.optin ?? 0} />
                  <Stat label="Thank you" value={integ.eventos?.thankYou ?? 0} />
                  <Stat label="WhatsApp" value={integ.eventos?.whatsapp ?? 0} />
                </div>
                <p className="dim" style={{ marginTop: 12, marginBottom: 0 }}>
                  {integ.ultimoEventoAt
                    ? `Último evento ${hace(integ.ultimoEventoAt)}`
                    : 'Todavía no llegó ningún evento. Abrí la landing con el script pegado.'}
                </p>
              </>
            )}
          </Card>

          {/* 3. Plataformas */}
          <Card title="3. Plataformas" sub="Registros y gasto vienen de acá; el script cubre el tráfico de la landing.">
            <div className="int-plataformas">
              <div className="int-plat">
                <div className="int-plat-head">
                  <strong>Meta Ads</strong>
                  <Pill tone={plataformas.metaAds?.conectada ? 'ok' : 'off'} dot>
                    {plataformas.metaAds?.conectada ? 'Conectada' : 'Sin conectar'}
                  </Pill>
                </div>
                <p className="dim">
                  Cuenta de ads a nivel sistema. Las campañas se vinculan en el webinar.
                </p>
                <div className="int-plat-foot">
                  <span className="dim">
                    {(selected.campaniasAds || []).length
                      ? `${selected.campaniasAds.length} campaña(s) en este webinar`
                      : 'Este webinar no tiene campañas vinculadas'}
                  </span>
                  <Link className="btn ghost" to={`/webinars/${selected.webinarId}`}>
                    Vincular campañas
                  </Link>
                </div>
              </div>

              <div className="int-plat">
                <div className="int-plat-head">
                  <strong>Calendly</strong>
                  <Pill tone={selected.calendlyUrl ? 'ok' : 'off'} dot>
                    {selected.calendlyUrl ? 'URL cargada' : 'Sin URL'}
                  </Pill>
                </div>
                <p className="dim">
                  {selected.calendlyUrl
                    ? selected.calendlyUrl
                    : 'Pegá el link de Calendly en la config del webinar. Después se puede sync de registros.'}
                </p>
                <div className="int-plat-foot">
                  <span className="dim">Por webinar</span>
                  <Link className="btn ghost" to={`/webinars/${selected.webinarId}`}>
                    Configurar
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </>
      ) : null}

      <TrackingDocsModal
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        token={integ?.token}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="int-stat">
      <div className="dim">{label}</div>
      <div className="int-stat-n">{Number(value || 0).toLocaleString('es-AR')}</div>
    </div>
  );
}

function Snippet({ titulo, ayuda, codigo, copiado, onCopiar }) {
  return (
    <div className="int-snippet">
      <div className="int-snippet-head">
        <div>
          <span className="strong">{titulo}</span>
          {ayuda ? <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{ayuda}</div> : null}
        </div>
        <button type="button" className="btn ghost" onClick={onCopiar}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre>{codigo}</pre>
    </div>
  );
}
