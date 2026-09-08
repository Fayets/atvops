import { useMemo, useState } from 'react';
import ClienteCard from '../../components/fulfillment/ClienteCard.jsx';
import Card from '../../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import SourceTag from '../../components/ui/SourceTag.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { getFulfillment } from '../../data/api.js';
import { formatValue, hace } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';

const CAT_LABEL = {
  boost: 'Boost',
  advantage: 'Advantage',
  avanzados: 'Avanzados',
  principiantes: 'Principiantes',
  mentoria: 'Mentoría',
};

const CAT_ORDER = ['boost', 'advantage', 'avanzados', 'principiantes', 'mentoria'];

export default function FulfillmentClientes() {
  const { data, loading, error } = useResource(getFulfillment);
  const [categoria, setCategoria] = useState('todas');
  const [fase, setFase] = useState('todas');
  const [busqueda, setBusqueda] = useState('');

  const porCategoria = data?.resumen?.por_categoria ?? {};

  const filas = useMemo(() => {
    if (!data) return [];
    return data.activos
      .filter((c) => (categoria === 'todas' ? true : c.categoria === categoria))
      .filter((c) => (fase === 'todas' ? true : fase === 'sin' ? !c.fase : c.fase?.id === fase))
      .filter((c) => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return true;
        return (
          c.nombre.toLowerCase().includes(q)
          || (c.canal ?? '').toLowerCase().includes(q)
          || (c.categoria ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.salud.score - b.salud.score);
  }, [busqueda, categoria, fase, data]);

  const serie = (id) => (data?.actividad ?? [])
    .filter((a) => a.clienteId === id)
    .map((a) => a.mensajesCliente);

  if (error) return <div className="page"><ErrorState error={error} /></div>;

  const tabsFase = data?.fases?.length
    ? [
        { value: 'todas', label: 'Todas las fases' },
        ...data.fases.filter((f) => f.clientes.length).map((f) => ({ value: f.id, label: `${f.label} ${f.clientes.length}` })),
        ...(data.sinFase?.length ? [{ value: 'sin', label: `Sin ficha ${data.sinFase.length}` }] : []),
      ]
    : [];

  const tabsCategoria = [
    { value: 'todas', label: `Todas ${data?.activos.length ?? 0}` },
    ...CAT_ORDER
      .filter((c) => (porCategoria[c] ?? 0) > 0)
      .map((c) => ({ value: c, label: `${CAT_LABEL[c]} ${porCategoria[c]}` })),
  ];

  return (
    <div className="page">
      {loading || !data ? (
        <SkeletonBlock height={420} />
      ) : (
        <>
          <div className="filtros" style={{ alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {data.activos.length} clientes desde Discord
              {data.syncAt ? ` · sync ${hace(data.syncAt)}` : ''}
              {data.resumen?.mensajes != null
                ? ` · ${formatValue(data.resumen.mensajes, 'count')} msgs`
                : ''}
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <SourceTag sourceId="discord_transcripts" updatedAt={data.syncAt} />
            </div>
          </div>

          <div className="filtros">
            <div className="buscador">
              <span style={{ color: 'var(--text-3)' }}>⌕</span>
              <input
                type="search"
                placeholder="Buscar nombre o #canal"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Buscar cliente"
              />
            </div>

            <Tabs
              value={categoria}
              onChange={setCategoria}
              options={tabsCategoria}
            />
          </div>
          {tabsFase.length > 1 && (
            <div className="filtros">
              <Tabs value={fase} onChange={setFase} options={tabsFase} />
            </div>
          )}

          {filas.length === 0 ? (
            <Card>
              <div className="empty">Ningún cliente coincide con el filtro.</div>
            </Card>
          ) : (
            <div className="cliente-grid">
              {filas.map((c) => (
                <ClienteCard key={c.id} cliente={c} serie={serie(c.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
