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
  const antes = localStorage.getItem(USER_KEY);
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Si cambió algo de la persona (p. ej. el director le sumó closer a Cris), el menú y los
  // permisos se rearman sin esperar a un F5.
  if (antes !== localStorage.getItem(USER_KEY)) {
    try {
      window.dispatchEvent(new Event(SESION_CAMBIO));
    } catch {
      /* fuera del navegador no hay a quién avisar */
    }
  }
}

export const SESION_CAMBIO = 'atv-ops:sesion';

export function clearSession() {
  olvidarLiberacion();
  localStorage.removeItem('atv-ops-sesion-original');
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/* Franco entra a la cuenta de otra persona: se guarda su propia sesión aparte para volver. */
const ORIGINAL_KEY = 'atv-ops-sesion-original';

export function entrarComoSesion(session) {
  if (!localStorage.getItem(ORIGINAL_KEY)) {
    localStorage.setItem(ORIGINAL_KEY, JSON.stringify({ token: getToken(), user: getStoredUser() }));
  }
  saveSession(session);
}

export function sesionOriginal() {
  try {
    return JSON.parse(localStorage.getItem(ORIGINAL_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** Vuelve a la sesión del admin. Devuelve false si no había una guardada. */
export function volverASesionOriginal() {
  const original = sesionOriginal();
  localStorage.removeItem(ORIGINAL_KEY);
  if (!original?.token) return false;
  saveSession(original);
  return true;
}
