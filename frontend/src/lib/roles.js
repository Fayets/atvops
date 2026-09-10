/**
 * Roles de ATV Ops: qué navega y entra cada perfil.
 *
 * closer / setter → operación de llamadas
 * ventas → dueño del área de ventas
 * marketing → embudo TOFU + decreto
 * csm → customer success: clientes y fulfillment
 * operaciones → fulfillment + cobranza + calendario
 * founder → casi todo (visión)
 * admin → todo + configuración
 */

/** @typedef {'closer' | 'setter' | 'csm' | 'operaciones' | 'ventas' | 'marketing' | 'founder' | 'admin'} Rol */

/** @type {Record<Rol, { id: Rol, label: string, descripcion: string }>} */
export const ROLES = {
  closer: {
    id: 'closer',
    label: 'Closer',
    descripcion: 'Cierra llamados. Ve Ventas (llamados/cash) y calendario.',
  },
  setter: {
    id: 'setter',
    label: 'Setter',
    descripcion: 'Agenda y confirma. Ve Ventas y calendario.',
  },
  csm: {
    id: 'csm',
    label: 'CSM',
    descripcion: 'Customer success: clientes, salud de la cartera y fulfillment.',
  },
  operaciones: {
    id: 'operaciones',
    label: 'Operaciones',
    descripcion: 'Fulfillment, cobranza y salud de la cartera.',
  },
  ventas: {
    id: 'ventas',
    label: 'Ventas',
    descripcion: 'Dueño del área: embudo, metas y equipo comercial.',
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing',
    descripcion: 'Top of funnel, decreto mensual y Ads.',
  },
  founder: {
    id: 'founder',
    label: 'Founder',
    descripcion: 'Visión completa del tablero (sin config profunda).',
  },
  admin: {
    id: 'admin',
    label: 'Admin',
    descripcion: 'Acceso total, incluyendo configuración y sistemas.',
  },
};

/** @type {Rol[]} */
export const ROL_LIST = Object.keys(ROLES);

/**
 * Áreas / rutas permitidas por rol.
 * `end: true` en home se resuelve aparte.
 * @type {Record<Rol, string[]>}
 */
export const RUTAS_POR_ROL = {
  closer: ['/calendario', '/ventas', '/metas'],
  setter: ['/calendario', '/ventas', '/metas'],
  csm: ['/fulfillment', '/asistente', '/calendario', '/ideas'],
  operaciones: [
    '/',
    '/reporte',
    '/asistente',
    '/calendario',
    '/fulfillment',
    '/ventas',
    '/metas',
    '/cobranza',
    '/ideas',
  ],
  ventas: ['/', '/calendario', '/ventas', '/metas', '/ideas'],
  // Ads es plata y el calendario es de ventas: ninguno es del director de marketing.
  marketing: ['/', '/marketing', '/metas', '/ideas'],
  founder: [
    '/',
    '/reporte',
    '/asistente',
    '/calendario',
    '/fulfillment',
    '/marketing',
    '/ads',
    '/ventas',
    '/metas',
    '/cobranza',
    '/ideas',
    '/sistemas',
  ],
  admin: [
    '/',
    '/reporte',
    '/asistente',
    '/calendario',
    '/fulfillment',
    '/marketing',
    '/ads',
    '/ventas',
    '/metas',
    '/cobranza',
    '/ideas',
    '/sistemas',
    '/configuracion',
  ],
};

/** Home por defecto al entrar. */
export const HOME_POR_ROL = {
  closer: '/ventas/mi-dia',
  setter: '/ventas/mi-progreso',
  csm: '/fulfillment',
  operaciones: '/fulfillment',
  ventas: '/ventas',
  marketing: '/marketing',
  founder: '/',
  admin: '/',
};

const OVERRIDE_KEY = 'atv-ops-rol-preview';

/** @param {string | null | undefined} rol */
export function normalizarRol(rol) {
  const r = (rol || '').toLowerCase().trim();
  return ROL_LIST.includes(r) ? /** @type {Rol} */ (r) : 'operaciones';
}

export function getRolPreview() {
  try {
    const v = sessionStorage.getItem(OVERRIDE_KEY);
    return v && ROL_LIST.includes(v) ? /** @type {Rol} */ (v) : null;
  } catch {
    return null;
  }
}

/** @param {Rol | null} rol */
export function setRolPreview(rol) {
  try {
    if (!rol) sessionStorage.removeItem(OVERRIDE_KEY);
    else sessionStorage.setItem(OVERRIDE_KEY, rol);
  } catch {
    /* ignore */
  }
}

/**
 * Rol efectivo: preview (solo si el usuario real puede previsualizar) o el del user.
 * @param {{ rol?: string } | null} user
 */
export function rolEfectivo(user) {
  const base = normalizarRol(user?.rol);
  if (base === 'admin' || base === 'founder') {
    const preview = getRolPreview();
    if (preview) return preview;
  }
  return base;
}

/**
 * @param {string} pathname
 * @param {Rol} rol
 */
export function puedeVerRuta(pathname, rol) {
  const permitidas = RUTAS_POR_ROL[rol] ?? RUTAS_POR_ROL.operaciones;
  return permitidas.some((p) => {
    if (p === '/') return pathname === '/';
    return pathname === p || pathname.startsWith(`${p}/`);
  });
}

/**
 * Filtra ítems de nav (con subnav) según rol.
 * @param {Array<{ to: string, sub?: Array<{ to: string }> }>} nav
 * @param {Rol} rol
 */
export function filtrarNav(nav, rol) {
  return nav
    .map((item) => {
      if (!puedeVerRuta(item.to, rol) && item.to !== '/') return null;
      if (item.to === '/' && !puedeVerRuta('/', rol)) return null;
      if (!item.sub) return item;
      const sub = item.sub.filter((s) => {
        if (s.roles && !s.roles.includes(rol)) return false;
        return puedeVerRuta(s.to, rol);
      });
      if (item.to.startsWith('/fulfillment') && sub.length === 0) return null;
      // Ops y dirección entran directo a la lectura de cartera, no al día a día del CSM.
      if (item.to === '/fulfillment' && rol !== 'csm') {
        return { ...item, to: '/fulfillment/ops', sub };
      }
      if (item.to.startsWith('/ventas') && sub.length === 0) return null;
      // Operaciones: el link padre de Ventas apunta a la vista OPS.
      if (item.to === '/ventas' && !puedeVerVentasDirector(rol) && !puedeVerVentasCloser(rol) && !puedeVerVentasSetter(rol) && puedeVerVentasOps(rol)) {
        return { ...item, to: '/ventas/ops', sub };
      }
      if (item.to === '/ventas' && puedeVerVentasCloser(rol) && !puedeVerVentasDirector(rol)) {
        return { ...item, to: '/ventas/mi-dia', sub };
      }
      if (item.to === '/ventas' && puedeVerVentasSetter(rol) && !puedeVerVentasDirector(rol)) {
        return { ...item, to: '/ventas/mi-progreso', sub };
      }
      return { ...item, sub };
    })
    .filter(Boolean);
}

export function homeParaRol(rol) {
  return HOME_POR_ROL[normalizarRol(rol)] ?? '/';
}

/** Solo admin y operaciones (ops) pueden editar el decreto de metas. */
export function puedeEditarMetas(rol) {
  const r = normalizarRol(rol);
  return r === 'admin' || r === 'operaciones';
}

/** Quién ve la vista OPS de Ventas (salud vs meta), no el día a día. */
export function puedeVerVentasOps(rol) {
  const r = normalizarRol(rol);
  return r === 'admin' || r === 'operaciones' || r === 'founder';
}

/** Quién ve Operativa / Performance del Director de Ventas. */
export function puedeVerVentasDirector(rol) {
  const r = normalizarRol(rol);
  return r === 'ventas' || r === 'admin' || r === 'founder';
}

/** Quién ve el dashboard personal del Closer. */
export function puedeVerVentasCloser(rol) {
  const r = normalizarRol(rol);
  return r === 'closer' || r === 'admin' || r === 'founder';
}

/** Quién ve vistas del Setter (progreso diario / reporte). */
export function puedeVerVentasSetter(rol) {
  const r = normalizarRol(rol);
  return r === 'setter' || r === 'admin' || r === 'founder';
}
