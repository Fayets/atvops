import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import { bajarTxtCanal, getTranscripts } from '../../data/api.js';
import { formatValue, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';

/**
 * Los canales de los clientes, uno por cliente, con sus datos al lado.
 *
 * Dos columnas: a la izquierda el nombre del canal, separado en activos (el canal sigue
 * abierto en Discord) e inactivos (se cerró); a la derecha los datos del cliente. Por
 * ahora: el nombre y el .txt para bajar, nada más. Mauri lo pidió así —quiere probar las
 * consultas en su propio sistema— y la conversación entera ya vive en la ficha del
 * cliente. Lo demás de la ficha se va a ir sumando acá.
 */

const INTERVALO_MS = 15000;
const ETIQUETA = { boost: 'Boost', advantage: 'Advantage', avanzados: 'Avanzados', principiantes: 'Principiantes', updates: 'Updates' };

function Grupo({ titulo, icono, canales, activo, onSelect, abierto, onToggle }) {
  return (
    <section className="canales-grupo">
      <button type="button" className="canales-grupo-cab" onClick={onToggle} aria-expanded={abierto}>
        <span>{icono} {titulo}</span>
        <span className="dim">{canales.length}</span>
      </button>
      {abierto && (canales.length === 0 ? (
        <div className="empty" style={{ padding: '10px 16px' }}>Ninguno</div>
      ) : canales.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`chat-item canales-item${activo === c.id ? ' activo' : ''}`}
          onClick={() => onSelect(c)}
        >
          <div className="chat-item-top">
            <span className="chat-item-nombre">#{c.canal}</span>
            <span className="chat-item-hora">{c.ultimo_mensaje_at ? hace(c.ultimo_mensaje_at, new Date()) : '—'}</span>
          </div>
          <div className="chat-item-preview">
            {ETIQUETA[c.categoria] ?? c.categoria} · {formatValue(c.mensajes, 'count')} mensajes
          </div>
        </button>
      )))}
    </section>
  );
}

export default function Canales() {
  const navigate = useNavigate();
  const params = useParams();
  const [busqueda, setBusqueda] = useState('');
  // Los dos grupos arrancan cerrados: la lista es larga y lo primero es elegir activos o inactivos.
  const [abiertos, setAbiertos] = useState({ activos: false, inactivos: false });
  const [bajando, setBajando] = useState(false);
  const [errorBajada, setErrorBajada] = useState('');

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), INTERVALO_MS);
    return () => clearInterval(id);
  }, []);

  const { data, error } = useResource(getTranscripts, [tick]);

  const { activos, inactivos } = useMemo(() => {
    if (!data) return { activos: [], inactivos: [] };
    const q = busqueda.trim().toLowerCase();
    const todos = data.canales
      .filter((c) => c.categoria !== 'updates')
      .filter((c) => !q || c.canal.toLowerCase().includes(q)
        || c.autores.some((a) => a.nombre.toLowerCase().includes(q)));
    const porNombre = (a, b) => a.canal.localeCompare(b.canal, 'es');
    return {
      activos: todos.filter((c) => c.en_discord).sort(porNombre),
      inactivos: todos.filter((c) => !c.en_discord).sort(porNombre),
    };
  }, [data, busqueda]);

  const seleccionado = useMemo(() => {
    if (!data) return null;
    if (params.canal) {
      const m = data.canales.find((c) => c.canal === params.canal && c.categoria === params.categoria);
      if (m) return m;
    }
    // Sin canal en la URL no se abre ninguno: los grupos están cerrados y abrir uno que
    // no se ve en la lista confunde.
    return null;
  }, [data, params.canal, params.categoria]);

  const abrir = useCallback(
    (c) => navigate(`/fulfillment/canales/${c.categoria}/${encodeURIComponent(c.canal)}`),
    [navigate],
  );

  const bajar = async () => {
    if (!seleccionado || bajando) return;
    setBajando(true); setErrorBajada('');
    try {
      await bajarTxtCanal(seleccionado.categoria, seleccionado.canal);
    } catch (e) {
      setErrorBajada(e?.message || 'No se pudo bajar el archivo.');
    } finally {
      setBajando(false);
    }
  };

  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (!data) return <div className="page"><SkeletonBlock height={520} /></div>;

  return (
    <div className="page">
      <div className="canales">
        <aside className="chat-rail">
          <div className="chat-rail-head">
            <input
              type="search"
              className="chat-buscar"
              placeholder="Buscar canal o persona…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar canal"
            />
          </div>
          <div className="chat-rail-lista">
            <Grupo titulo="Activos" icono="✅" canales={activos} activo={seleccionado?.id ?? null}
              onSelect={abrir} abierto={abiertos.activos}
              onToggle={() => setAbiertos((a) => ({ ...a, activos: !a.activos }))} />
            <Grupo titulo="Inactivos" icono="🚫" canales={inactivos} activo={seleccionado?.id ?? null}
              onSelect={abrir} abierto={abiertos.inactivos}
              onToggle={() => setAbiertos((a) => ({ ...a, inactivos: !a.inactivos }))} />
          </div>
        </aside>

        <section className="canales-datos">
          {!seleccionado ? (
            <div className="empty">Elegí un canal de la izquierda.</div>
          ) : (
            <>
              <header className="canales-datos-cab">
                <div>
                  <h2>#{seleccionado.canal}</h2>
                  <div className="dim">
                    {ETIQUETA[seleccionado.categoria] ?? seleccionado.categoria}
                    {' · '}{seleccionado.en_discord ? 'activo ✅' : 'inactivo 🚫'}
                    {' · '}{formatValue(seleccionado.mensajes, 'count')} mensajes
                    {seleccionado.ultimo_mensaje_at ? ` · último ${hace(seleccionado.ultimo_mensaje_at, new Date())}` : ''}
                  </div>
                </div>
                <div className="canales-datos-acciones">
                  {errorBajada && <span className="mal" style={{ fontSize: 12 }}>{errorBajada}</span>}
                  <button type="button" className="btn" onClick={bajar} disabled={bajando}>
                    {bajando ? 'Bajando…' : 'Descargar .txt'}
                  </button>
                </div>
              </header>
              <div className="canales-datos-cuerpo">
                <div className="canales-dato">
                  <span className="lab-k">Archivo</span>
                  <span className="num">{seleccionado.canal}.txt · {formatValue(Math.round((seleccionado.bytes || 0) / 1024), 'count')} KB</span>
                </div>
                <div className="canales-dato">
                  <span className="lab-k">Conversación</span>
                  <span>
                    {seleccionado.primer_mensaje_at ? new Date(seleccionado.primer_mensaje_at).toLocaleDateString('es-AR') : '—'}
                    {' → '}
                    {seleccionado.ultimo_mensaje_at ? new Date(seleccionado.ultimo_mensaje_at).toLocaleDateString('es-AR') : '—'}
                  </span>
                </div>
                <div className="canales-dato">
                  <span className="lab-k">Quiénes hablan</span>
                  <span>{seleccionado.autores.map((a) => a.nombre).join(', ') || '—'}</span>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
