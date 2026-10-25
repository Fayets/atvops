/** Reglas de la daily, las mismas que aplica el backend (daily_services.py). */

export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Si la tarea hay que marcarla ese día sí o sí.
 *
 * Una "diaria" es de lunes a viernes: el sábado y el domingo están para el que trabaja el
 * finde, y una tarea de todos los días no puede caer ahí sola.
 */
export function vence(t, dia) {
  if (t.frecuencia === 'diaria') return dia < 5;
  return t.frecuencia === 'semanal' && t.dia === dia;
}

/** Se cierra cualquier día de la semana (o del mes). */
export function abierta(t) {
  return t.frecuencia === 'mensual' || (t.frecuencia === 'semanal' && t.dia == null);
}

export function sumarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fechaCorta(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/** "ignacio" → "Ignacio". Los destinatarios vienen como username. */
export function nombreDe(username, equipo) {
  const p = equipo?.find?.((x) => x.username === username);
  if (p) return p.nombre;
  return username ? username.charAt(0).toUpperCase() + username.slice(1) : '';
}

/** Verde 85 o más, ámbar de 60 a 84, rojo debajo. */
export function banda(pct) {
  if (pct == null) return 'off';
  if (pct >= 85) return 'ok';
  if (pct >= 60) return 'warn';
  return 'alert';
}

export const BANDA_TEXTO = { ok: 'Cumplió', warn: 'A medias', alert: 'No cumplió', off: 'Sin datos' };

/** Cumplimiento de un solo día: de lo que vencía ese día, cuánto está hecho. */
export function cumplimientoDia(semana, dia) {
  const d = semana?.dias?.[dia];
  if (!d) return null;
  let due = 0;
  let done = 0;
  for (const t of semana.tareas) {
    if (!vence(t, dia)) continue;
    const m = t.marcas[d.fecha];
    if (m?.estado === 'no_aplica') continue;
    due += 1;
    if (m?.estado === 'hecha') done += 1;
  }
  return due ? Math.round((done / due) * 100) : null;
}

/** Cumplimiento a hoy de una semana propia: lo que vencía y lo abierto que ya se cerró. */
export function cumplimiento(semana) {
  if (!semana) return null;
  const hoy = semana.hoy;
  let due = 0;
  let done = 0;
  semana.dias.forEach((d, i) => {
    if (d.fecha > hoy) return;
    for (const t of semana.tareas) {
      if (!vence(t, i)) continue;
      const m = t.marcas[d.fecha];
      if (m?.estado === 'no_aplica') continue;
      due += 1;
      if (m?.estado === 'hecha') done += 1;
    }
  });
  for (const t of semana.tareas) {
    if (t.frecuencia === 'semanal' && t.dia == null
        && Object.values(t.marcas).some((m) => m.estado === 'hecha')) {
      due += 1;
      done += 1;
    }
  }
  return due ? Math.round((done / due) * 100) : null;
}
