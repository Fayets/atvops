import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getStoredUser } from './auth.js';
import {
  getRolPreview,
  homeParaRol,
  normalizarRol,
  rolEfectivo as calcularRolEfectivo,
  setRolPreview as persistPreview,
} from './roles.js';

const RolContext = createContext(null);

export function RolProvider({ children }) {
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((n) => n + 1), []);

  const value = useMemo(() => {
    const user = getStoredUser();
    const rolReal = normalizarRol(user?.rol);
    const preview = getRolPreview();
    const rol = calcularRolEfectivo(user);
    return {
      user,
      rolReal,
      preview,
      rol,
      puedePreview: rolReal === 'admin' || rolReal === 'founder',
      setPreview(next) {
        const real = normalizarRol(getStoredUser()?.rol);
        if (!next || next === real) persistPreview(null);
        else persistPreview(next);
        bump();
      },
      home: homeParaRol(rol),
      refresh: bump,
      _v: version,
    };
  }, [version, bump]);

  return <RolContext.Provider value={value}>{children}</RolContext.Provider>;
}

export function useRol() {
  const ctx = useContext(RolContext);
  if (!ctx) {
    // Fallback fuera del provider (p. ej. Login)
    const user = getStoredUser();
    return {
      user,
      rolReal: normalizarRol(user?.rol),
      preview: getRolPreview(),
      rol: calcularRolEfectivo(user),
      puedePreview: false,
      setPreview() {},
      home: homeParaRol(calcularRolEfectivo(user)),
      refresh() {},
    };
  }
  return ctx;
}
