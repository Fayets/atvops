import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  actualizarIdea,
  borrarIdea,
  crearIdea,
  getIdeas,
} from '../data/api.js';
import { getStoredUser } from './auth.js';

const IdeasContext = createContext(null);

/**
 * Ideas del equipo persistidas en el backend (SQLite).
 * Un solo provider para Home y /ideas, así los KPIs y la lista no divergen.
 */
export function IdeasProvider({ children }) {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {Error | null} */ (null));

  const refrescar = useCallback(async () => {
    const data = await getIdeas();
    setIdeas(data);
    setError(null);
    return data;
  }, []);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    refrescar()
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [refrescar]);

  const agregar = useCallback(async (texto) => {
    const limpio = texto.trim();
    if (!limpio) return;
    const user = getStoredUser();
    const quien = user?.nombre || user?.username || 'Franco';
    const creada = await crearIdea(limpio, quien);
    setIdeas((prev) => [creada, ...prev]);
  }, []);

  const asignar = useCallback(async (id, asignada) => {
    const actualizada = await actualizarIdea(id, { asignada });
    setIdeas((prev) => prev.map((i) => (i.id === id ? actualizada : i)));
  }, []);

  const marcar = useCallback(async (id, estado) => {
    const actualizada = await actualizarIdea(id, { estado });
    setIdeas((prev) => prev.map((i) => (i.id === id ? actualizada : i)));
  }, []);

  const editar = useCallback(async (id, texto) => {
    const limpio = texto.trim();
    if (!limpio) return;
    const actualizada = await actualizarIdea(id, { texto: limpio });
    setIdeas((prev) => prev.map((i) => (i.id === id ? actualizada : i)));
  }, []);

  const borrar = useCallback(async (id) => {
    await borrarIdea(id);
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const value = useMemo(
    () => ({ ideas, loading, error, refrescar, agregar, asignar, marcar, editar, borrar }),
    [ideas, loading, error, refrescar, agregar, asignar, marcar, editar, borrar],
  );

  return <IdeasContext.Provider value={value}>{children}</IdeasContext.Provider>;
}

export function useIdeas() {
  const ctx = useContext(IdeasContext);
  if (!ctx) {
    throw new Error('useIdeas tiene que usarse dentro de IdeasProvider.');
  }
  return ctx;
}
