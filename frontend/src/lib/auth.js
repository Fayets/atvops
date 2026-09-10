const TOKEN_KEY = 'atv-ops-token';
const USER_KEY = 'atv-ops-user';
/** Permiso temporal que da un admin para saltear el bloqueo de llamadas sin cargar. */
export const GATE_KEY = 'atv-ops:gate-liberado';

function olvidarLiberacion() {
  try {
    sessionStorage.removeItem(GATE_KEY);
  } catch {
    /* sin sessionStorage no hay nada que limpiar */
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function saveSession({ token, user }) {
  // Cada login arranca sin permisos heredados de la sesión anterior.
  olvidarLiberacion();
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  olvidarLiberacion();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
