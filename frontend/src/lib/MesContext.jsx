import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { contextoDeMes, listaMeses, mesActualId } from './mes.js';

const STORAGE_KEY = 'atv-ops-mes';

/**
 * El mes elegido vale hasta el final del día.
 *
 * Se guardaba el mes a secas, para siempre: el 1° de octubre el sistema seguía abriendo
 * en septiembre porque era lo último que alguien había mirado, y las métricas de arriba
 * eran del mes pasado sin que nada lo dijera. Al entrar otro día se arranca en el mes
 * corriente, que es lo que se espera; dentro del mismo día la elección se respeta para
 * poder navegar entre pantallas sin volver a elegirlo.
 */
function leerMesInicial() {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return mesActualId();
    // Antes se guardaba el string pelado; esa forma se ignora y se toma el mes de hoy.
    const guardado = crudo.startsWith('{') ? JSON.parse(crudo) : null;
    if (guardado?.mes && /^\d{4}-\d{2}$/.test(guardado.mes) && guardado.dia === hoyId()) {
      return guardado.mes;
    }
  } catch {
    /* ignore */
  }
  return mesActualId();
}

/** "Histórico" dura lo mismo que el mes elegido: hasta el final del día. */
function leerHistoricoInicial() {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    const guardado = crudo?.startsWith('{') ? JSON.parse(crudo) : null;
    return guardado?.historico === true && guardado.dia === hoyId();
  } catch {
    return false;
  }
}

function hoyId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MesContext = createContext(null);

export function MesProvider({ children }) {
  const [mes, setMesState] = useState(leerMesInicial);
  // Va aparte de `mes` a propósito: las vistas que no conocen "Histórico" siguen recibiendo
  // un YYYY-MM y no se enteran. Solo la que lo acepta mira esta marca.
  const [historico, setHistoricoState] = useState(leerHistoricoInicial);

  const setMes = useCallback((next) => {
    if (!next || !/^\d{4}-\d{2}$/.test(next)) return;
    setMesState(next);
    setHistoricoState(false);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mes: next, dia: hoyId() }));
    } catch {
      /* ignore */
    }
  }, []);

  const elegirHistorico = useCallback(() => {
    setHistoricoState(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mes, dia: hoyId(), historico: true }));
    } catch {
      /* ignore */
    }
  }, [mes]);

  const value = useMemo(() => {
    const ctx = contextoDeMes(mes);
    return {
      mes,
      setMes,
      historico,
      elegirHistorico,
      ...ctx,
      opciones: listaMeses(mesActualId()),
    };
  }, [mes, setMes, historico, elegirHistorico]);

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
      historico: false,
      elegirHistorico() {},
      ...c,
      opciones: listaMeses(mes),
    };
  }
  return ctx;
}
