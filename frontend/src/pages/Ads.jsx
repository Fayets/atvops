import { useEffect, useMemo, useState } from 'react';
import Campania from '../components/ads/Campania.jsx';
import AvanceVsMeta from '../components/metas/AvanceVsMeta.jsx';
import MetaMesModal from '../components/metas/MetaMesModal.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import SourceTag from '../components/ui/SourceTag.jsx';
import { getCampania, getCampanias, getMetasMes } from '../data/api.js';
import { formatValue } from '../lib/format.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { useRol } from '../lib/RolContext.jsx';
import { puedeEditarMetas } from '../lib/roles.js';

const FILTROS = [
  ['corriendo', 'Corriendo', (c) => c.estado === 'corriendo'],
  ['pausada', 'Pausadas', (c) => c.estado !== 'corriendo'],
  ['todas', 'Todas', () => true],
];

export default function Ads() {
  const { mes, opciones } = useMes();
  // El nombre sale del selector: '2026-10' leído como fecha cae el 30/9 en Argentina.
  const mesLabel = (opciones ?? []).find((o) => o.id === mes)?.label ?? mes;
  const { rol } = useRol();
  const puedeEditar = puedeEditarMetas(rol);
  const lista = useResource(() => getCampanias(), []);
  const [filtro, setFiltro] = useState(null);
  const [sel, setSel] = useState(null);
  const [tickMeta, setTickMeta] = useState(0);
  const [modalMeta, setModalMeta] = useState(false);
  const metas = useResource(() => getMetasMes(mes, { incluirAds: true }), [mes, tickMeta]);

  const campanias = lista.data?.campanias ?? [];
  const grupos = useMemo(
    () => FILTROS.map(([k, label, f]) => [k, label, campanias.filter(f)]),
    [campanias],
  );
  // Abre en lo que corre; si no corre nada, en todas.
  const activo = filtro ?? (grupos[0][2].length ? 'corriendo' : 'todas');
  const visibles = grupos.find(([k]) => k === activo)?.[2] ?? [];
  const elegida = visibles.find((c) => c.id === sel)?.id ?? visibles[0]?.id ?? null;

  const [detalle, setDetalle] = useState({ id: null, data: null, error: null });
  useEffect(() => {
    if (!elegida) return undefined;
    let vivo = true;
    setDetalle({ id: elegida, data: null, error: null });
    getCampania(elegida)
      .then((data) => vivo && setDetalle({ id: elegida, data, error: null }))
      .catch((error) => vivo && setDetalle({ id: elegida, data: null, error }));
    return () => { vivo = false; };
  }, [elegida]);

  const metasData = metas.data;
  return (
    <div className="page">
      <div className="ads-anuncios-cab">
        <div className="ads-chips" role="group" aria-label="Qué campañas ver">
          {grupos.map(([k, label, l]) => (
            <button key={k} type="button" className={`chip${activo === k ? ' active' : ''}`} aria-pressed={activo === k}
              onClick={() => { setFiltro(k); setSel(null); }}>
              {label} <span className="dim num">{l.length}</span>
            </button>
          ))}
        </div>
        <div className="ads-anuncios-acciones">
          {puedeEditar && (
            <button type="button" className="btn" onClick={() => setModalMeta(true)}>Definir meta del mes</button>
          )}
          <SourceTag sourceId="ads_manager" updatedAt={detalle.data?.ultimaSyncAt ?? lista.data?.ultimaSyncAt} />
        </div>
      </div>

      {lista.error ? <ErrorState error={lista.error} /> : !lista.data ? <SkeletonBlock height={320} /> : (
        <>
          {visibles.length > 1 && (
            <div className="camp-tabs" role="tablist" aria-label="Campañas">
              {visibles.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={c.id === elegida}
                  className={`camp-tab${c.id === elegida ? ' active' : ''}`} onClick={() => setSel(c.id)}>
                  <b>{c.nombre}</b>
                  <span className="dim num">{formatValue(c.gastoUsd, 'usd')}</span>
                </button>
              ))}
            </div>
          )}
          {visibles.length === 0 ? (
            <div className="card lab-vacio">
              <h3>No hay campañas corriendo</h3>
              <p className="dim">Mirá "Todas" para ver cómo les fue a las anteriores.</p>
            </div>
          ) : detalle.error && detalle.id === elegida ? (
            <ErrorState error={detalle.error} />
          ) : !detalle.data || detalle.id !== elegida ? (
            <SkeletonBlock height={520} />
          ) : (
            <Campania c={detalle.data} mes={mes} mesLabel={mesLabel} />
          )}
        </>
      )}

      {metasData && (
        <AvanceVsMeta
          filas={metasData.avanceAds}
          titulo="Avance vs meta · Ads"
          sub={`Inversión · ${metasData.contexto.nombreMes} · día ${metasData.contexto.diaHoy}/${metasData.contexto.diasMes}`}
          syncAt={metasData.real.syncAt}
        />
      )}

      {puedeEditar && metasData && (
        <MetaMesModal
          abierto={modalMeta}
          onCerrar={() => setModalMeta(false)}
          decreto={metasData.decreto}
          mes={metasData.contexto.mes}
          nombreMes={metasData.contexto.nombreMes}
          onGuardado={() => setTickMeta((n) => n + 1)}
        />
      )}
    </div>
  );
}
