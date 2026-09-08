import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatRail from '../../components/transcripts/ChatRail.jsx';
import Conversacion from '../../components/transcripts/Conversacion.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { getTranscriptCanal, getTranscripts } from '../../data/api.js';
import { hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';

const INTERVALO_MS = 15000;

/**
 * Chats de Discord en vivo. El bot de ATV Clients escribe cada mensaje al
 * instante; acá se vuelve a leer cada 15 s sin parpadear, y el chat abierto
 * baja solo cuando llega algo nuevo.
 */
export default function Chats() {
  const navigate = useNavigate();
  const params = useParams();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('activos');

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), INTERVALO_MS);
    return () => clearInterval(id);
  }, []);

  const { data, loading, error } = useResource(getTranscripts, [tick]);
  const [ultimaLectura, setUltimaLectura] = useState(() => new Date());
  useEffect(() => {
    if (data) setUltimaLectura(new Date());
  }, [data]);

  const canales = useMemo(() => {
    if (!data) return [];
    const q = busqueda.trim().toLowerCase();
    return data.canales
      .filter((c) => {
        if (categoria === 'cerrados') return !c.en_discord;
        if (!c.en_discord) return false;
        return categoria === 'activos' ? true : c.categoria === categoria;
      })
      .filter((c) => {
        if (!q) return true;
        if (c.canal.toLowerCase().includes(q)) return true;
        if ((c.ultimo_texto ?? '').toLowerCase().includes(q)) return true;
        return c.autores.some((a) => a.nombre.toLowerCase().includes(q));
      });
  }, [data, busqueda, categoria]);

  const seleccionado = useMemo(() => {
    if (!data) return null;
    if (params.canal) {
      const m = data.canales.find((c) => c.canal === params.canal && c.categoria === params.categoria);
      if (m) return m;
    }
    return canales[0] ?? null;
  }, [canales, data, params.canal, params.categoria]);

  const abrir = useCallback(
    (c) => navigate(`/fulfillment/chats/${c.categoria}/${encodeURIComponent(c.canal)}`),
    [navigate],
  );

  const cargarDetalle = useCallback(
    () => (seleccionado ? getTranscriptCanal(seleccionado.categoria, seleccionado.canal) : Promise.resolve(null)),
    [seleccionado],
  );
  const detalle = useResource(cargarDetalle, [seleccionado?.id, tick]);
  const detalleListo = detalle.data && detalle.data.canal.id === seleccionado?.id;

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment · en vivo"
        title="Chats de Discord"
        actions={
          data && (
            <span className="en-vivo" title={`Se vuelve a leer cada ${INTERVALO_MS / 1000} s`}>
              <i className={loading ? 'pulso' : ''} />
              en vivo · leído {hace(ultimaLectura.toISOString(), new Date())}
            </span>
          )
        }
      />

      {!data ? (
        <SkeletonBlock height={520} />
      ) : (
        <>
          <div className="filtros">
            <div className="tabs" role="tablist">
              {['activos', ...Object.keys(data.resumen.por_categoria), ...(data.resumen.canales_cerrados ? ['cerrados'] : [])].map((cat) => (
                <button
                  key={cat}
                  role="tab"
                  aria-selected={categoria === cat}
                  className={`tab${categoria === cat ? ' active' : ''}`}
                  onClick={() => setCategoria(cat)}
                  title={cat === 'cerrados' ? 'En disco pero ya no existen en Discord: clientes que terminaron o canales archivados' : undefined}
                >
                  {cat === 'activos'
                    ? `Activos ${data.resumen.canales}`
                    : cat === 'cerrados'
                      ? `Cerrados ${data.resumen.canales_cerrados}`
                      : `${cat} ${data.resumen.por_categoria[cat]}`}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              {canales.length} chats · {data.resumen.mensajes} mensajes · último de la cartera{' '}
              {hace(data.resumen.ultimo_mensaje_at, new Date())}
            </span>
          </div>

          <div className="chats">
            <ChatRail canales={canales} activo={seleccionado?.id ?? null} onSelect={abrir} busqueda={busqueda} onBuscar={setBusqueda} />
            {detalle.error ? (
              <ErrorState error={detalle.error} />
            ) : !detalleListo ? (
              <div className="chat-panel"><div className="empty">Abriendo la conversación…</div></div>
            ) : (
              <Conversacion canal={detalle.data.canal} mensajes={detalle.data.mensajes} resaltar={busqueda} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
