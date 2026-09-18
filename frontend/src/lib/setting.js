/**
 * Lo que comparten las vistas del sistema del setter: períodos, etiquetas y agrupaciones.
 *
 * Los pitches llegan todos de una vez y acá se recortan por fecha, se agrupan por día y
 * se ordenan para el calendario. Son decenas por mes: hacerlo en el navegador es más
 * rápido que pedirlo.
 */

export const CANAL = { dm: 'dm', phone: 'tel', hibrido: 'hib' };
export const CANAL_PILL = { dm: 'dm', phone: 'phone', hibrido: 'híbrido' };
export const CANAL_LARGO = { dm: 'Set 100% por DM', phone: 'Set 100% por llamada', hibrido: 'Set híbrido' };
export const ORIGEN = { organico: 'ORG', ads: 'ADS' };
export const FUENTE = { organico: 'org', ads: 'ads' };
export const PITCH_ESTADO = {
  pendiente: { label: 'sin responder', tone: 'off' },
  booked: { label: 'booked', tone: 'ok' },
  ghosted: { label: 'ghosted', tone: 'warn' },
  denied: { label: 'dijo que no', tone: 'alert' },
};
export const LLAMADA_ESTADO = {
  scheduled: { label: 'agendada', tone: 'info' },
  showed: { label: 'show no close', tone: 'ok' },
  no_show: { label: 'no show', tone: 'alert' },
  cancelled: { label: 'cancelled', tone: 'off' },
  deposit: { label: 'deposit', tone: 'warn' },
  closed: { label: 'closed', tone: 'ok' },
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
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const fechaCorta = (s) => {
  if (!s) return '—';
  const d = deIso(s);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
};
export const fechaLarga = (s) => (s ? `${DIAS_LARGOS[deIso(s).getDay()]} ${fechaCorta(s)}` : '—');

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
  if (modo === 'todo') return 'Todo el histórico';
  if (modo === 'hoy') return fechaLarga(desde);
  if (modo === 'mes') {
    const d = deIso(desde);
    const mes = d.toLocaleDateString('es-AR', { month: 'long' });
    return `${mes[0].toUpperCase()}${mes.slice(1)} ${d.getFullYear()}`;
  }
  if (modo === 'semana' && desde) {
    return `Semana del ${fechaCorta(desde)} — ${fechaCorta(hasta)} ${deIso(hasta).getFullYear()}`;
  }
  if (!desde || !hasta) return 'Elegí un rango';
  return `${fechaCorta(desde)} — ${fechaCorta(hasta)}`;
};

/** El día de la semana y el día del mes, como los muestra el calendario de calls. */
export const diaSemana = (s) => DIAS_LARGOS[deIso(s).getDay()];
export const diaMes = fechaCorta;

/** Agrupa filas por la fecha que devuelva `campo`, en orden. */
export function porDia(filas, campo = 'fechaLlamada') {
  const mapa = new Map();
  filas.forEach((f) => {
    const dia = f[campo];
    if (!dia) return;
    if (!mapa.has(dia)) mapa.set(dia, []);
    mapa.get(dia).push(f);
  });
  return [...mapa.entries()].map(([fecha, items]) => ({ fecha, items }));
}

export const enPeriodo = (fecha, { desde, hasta }) =>
  Boolean(fecha) && (!desde || fecha >= desde) && (!hasta || fecha <= hasta);

/** Las llamadas agendadas que caen en la vista del calendario. */
export function callsDe(pitches, vista, hoy, lunesRef) {
  const agendadas = pitches.filter((p) => p.pitchEstado === 'booked' && p.fechaLlamada);
  const lunes = lunesRef ?? lunesDe(hoy);
  const filtro = {
    hoy: (p) => p.fechaLlamada === hoy,
    semana: (p) => p.fechaLlamada >= lunes && p.fechaLlamada <= sumarDias(lunes, 6),
    proximas: (p) => p.fechaLlamada >= hoy,
    todas: () => true,
  }[vista] ?? (() => true);
  return agendadas.filter(filtro)
    .sort((a, b) => (a.fechaLlamada < b.fechaLlamada ? -1 : a.fechaLlamada > b.fechaLlamada ? 1 : a.id - b.id));
}

/** La semana, día por día, con los pitches hechos y los que agendaron ese día. */
export function trackeoDe(pitches, lunes, hoy) {
  return DIAS.map((nombre, i) => {
    const fecha = sumarDias(lunes, i);
    return {
      fecha, nombre,
      pitches: pitches.filter((p) => p.pitchAt === fecha).sort((a, b) => a.id - b.id),
      esHoy: fecha === hoy,
      // Booked son los pitches de ese día que terminaron agendando, aunque hayan agendado
      // al otro día: es la conversión del día, no la agenda del día.
      booked: pitches.filter((p) => p.pitchAt === fecha && p.pitchEstado === 'booked').length,
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
export const money = (v) => (v == null ? '—' : `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(v)}`);
export const dias = (v) => (v == null ? '—' : `${v}d`);
export const duracion = (seg) => {
  if (!seg) return '';
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
