import { useCallback, useEffect, useState } from 'react';
import CloserVista from '../components/ventas/CloserVista.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import {
  getCloserDashboard,
  guardarDispositionCloser,
  simularDispositionCloser,
} from '../data/api.js';

const POLL_MS = 30_000;

/** Vista personal del Closer: cerrar, no operar el funnel de la empresa. */
export default function VentasCloser() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flashId, setFlashId] = useState(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const next = await getCloserDashboard();
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling cada 30s (mock de sync en vivo / otro closer o setter).
  useEffect(() => {
    const id = setInterval(() => refresh({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const flash = (llamadaId) => {
    setFlashId(llamadaId);
    window.setTimeout(() => setFlashId(null), 1200);
  };

  const onGuardarDisposition = async (payload) => {
    const next = await guardarDispositionCloser(payload);
    setData(next);
    flash(payload.llamadaId);
  };

  const onSimularDisposition = async () => {
    const next = await simularDispositionCloser();
    if (!next) return;
    setData(next);
    const id = next.agenda?.find((l) => l.estado === 'show_calificado' && l.prospecto === 'Tomás Riganti')?.id
      || next.agenda?.find((l) => l.estado === 'show_calificado')?.id
      || 'ch_01';
    flash(id);
  };

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
      </div>
    );
  }

  return (
    <div className="page closer-page">
      {loading || !data ? (
        <>
          <SkeletonBlock height={200} />
          <SkeletonKpis n={4} />
          <SkeletonBlock height={280} />
        </>
      ) : (
        <CloserVista
          data={data}
          flashId={flashId}
          onGuardarDisposition={onGuardarDisposition}
          onSimularDisposition={onSimularDisposition}
        />
      )}
    </div>
  );
}
