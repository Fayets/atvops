/**
 * Lo que comparten las vistas del sistema del setter: períodos, etiquetas y agrupaciones.
 *
 * Los pitches llegan todos de una vez y acá se recortan por fecha, se agrupan por día y
 * se ordenan para el calendario. Son decenas por mes: hacerlo en el navegador es más
 * rápido que pedirlo.
 */

export const CANAL = { dm: 'DM', phone: 'Tel', hibrido: 'Híb' };
export const CANAL_LARGO = { dm: 'Set 100% por DM', phone: 'Set 100% por llamada', hibrido: 'Set híbrido' };
export const ORIGEN = { organico: 'ORG', ads: 'ADS' };
export const PITCH_ESTADO = {
  pendiente: { label: 'Sin respuesta', tone: 'off' },
  booked: { label: 'Booked', tone: 'ok' },
  ghosted: { label: 'Ghosted', tone: 'warn' },
  denied: { label: 'Denied', tone: 'alert' },
};
export const LLAMADA_ESTADO = {
  scheduled: { label: 'Agendada', tone: 'info' },
  showed: { label: 'Showed', tone: 'ok' },
  no_show: { label: 'No show', tone: 'alert' },
  cancelled: { label: 'Cancelada', tone: 'off' },
  deposit: { label: 'Depósito', tone: 'warn' },
  closed: { label: 'Cerrado', tone: 'ok' },
};

export const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

export const iso = (d) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const deIso = (s) => new Date(`${String(s).slice(0, 10)}T12:00:00`);
export const sumarDias = (s, n) => {
  const d = deIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const lunesDe = (s) => {
  const d = deIso(s);
  const dia = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dia);
  return iso(d);
};
export const fechaCorta = (s) =>
  (s ? deIso(s).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—');
export const fechaLarga = (s) =>
  (s ? deIso(s).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');

/** Los límites de un período, sobre un día de referencia (hoy o la semana elegida). */
export function limites(modo, ref, rango = {}) {
  if (modo === 'hoy') return { desde: ref, hasta: ref };
  if (modo === 'semana') {
    const lunes = lunesDe(ref);
    return { desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  if (modo === 'mes') {
    const d = deIso(ref);
    const inicio = iso(new Date(d.getFullYear(), d.getMonth(), 1, 12));
    const fin = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
    return { desde: inicio, hasta: fin };
  }
  if (modo === 'rango') return { desde: rango.desde || null, hasta: rango.hasta || null };
  return { desde: null, hasta: null };
}

export const etiquetaPeriodo = (modo, { desde, hasta }) => {
  if (modo === 'todo') return 'Todo';
  if (modo === 'hoy') return fechaLarga(desde);
  if (modo === 'mes') return deIso(desde).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  if (!desde || !hasta) return 'Elegí un rango';
  return `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
};

export const enPeriodo = (fecha, { desde, hasta }) =>
  Boolean(fecha) && (!desde || fecha >= desde) && (!hasta || fecha <= hasta);

/** Las llamadas agendadas que caen en la vista del calendario. */
export function callsDe(pitches, vista, hoy) {
  const agendadas = pitches.filter((p) => p.pitchEstado === 'booked' && p.fechaLlamada);
  const lunes = lunesDe(hoy);
  const filtro = {
    hoy: (p) => p.fechaLlamada === hoy,
    semana: (p) => p.fechaLlamada >= lunes && p.fechaLlamada <= sumarDias(lunes, 6),
    proximas: (p) => p.fechaLlamada > hoy,
    todas: () => true,
  }[vista] ?? (() => true);
  return agendadas.filter(filtro).sort((a, b) => (a.fechaLlamada < b.fechaLlamada ? -1 : a.fechaLlamada > b.fechaLlamada ? 1 : a.id - b.id));
}

/** La semana, día por día, con los pitches hechos y los que agendaron ese día. */
export function trackeoDe(pitches, lunes) {
  return DIAS.map((nombre, i) => {
    const fecha = sumarDias(lunes, i);
    return {
      fecha, nombre,
      pitches: pitches.filter((p) => p.pitchAt === fecha).sort((a, b) => a.id - b.id),
      booked: pitches.filter((p) => p.agendoAt === fecha && p.pitchEstado === 'booked').length,
    };
  });
}

/** Baja un objeto como archivo JSON. */
export function descargarJson(nombre, datos) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export const pct = (v) => (v == null ? '—' : `${v}%`);
export const zona = (v, verde, amarillo) =>
  (v == null ? '' : v >= verde ? ' zona-ok' : v >= amarillo ? ' zona-warn' : ' zona-alert');
export const duracion = (seg) => {
  if (!seg) return '';
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
