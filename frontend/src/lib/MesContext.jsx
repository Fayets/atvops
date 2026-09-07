import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { contextoDeMes, listaMeses, mesActualId } from './mes.js';

const STORAGE_KEY = 'atv-ops-mes';

function leerMesInicial() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && /^\d{4}-\d{2}$/.test(v)) return v;
  } catch {
    /* ignore */
  }
  return mesActualId();
}

const MesContext = createContext(null);

export function MesProvider({ children }) {
  const [mes, setMesState] = useState(leerMesInicial);

  const setMes = useCallback((next) => {
    if (!next || !/^\d{4}-\d{2}$/.test(next)) return;
    setMesState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => {
    const ctx = contextoDeMes(mes);
    return {
      mes,
      setMes,
      ...ctx,
      opciones: listaMeses(mesActualId()),
    };
  }, [mes, setMes]);

  return <MesContext.Provider value={value}>{children}</MesContext.Provider>;
}

export function useMes() {
  const ctx = useContext(MesContext);
  if (!ctx) {
    const mes = mesActualId();
    const c = contextoDeMes(mes);
    return {
      mes,
      setMes() {},
      ...c,
      opciones: listaMeses(mes),
    };
  }
  return ctx;
}
