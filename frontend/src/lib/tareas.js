import { useSyncExternalStore } from 'react';

/**
 * Lo que corre de fondo y se sigue desde cualquier pantalla (hoy: el análisis de un reel en
 * Audiencia). Vive fuera de las páginas para que cambiar de pestaña no lo corte, y se guarda en
 * la sesión del navegador para que una recarga no lo pierda.
 *
 * @typedef {{ id: string, tipo: 'reel', mediaId: string, titulo: string, inicio: number,
 *             estado: 'corriendo' | 'listo', vioCorrer?: boolean, progreso?: object }} Tarea
 */

const CLAVE = 'atv-ops:tareas';
let tareas = leer();
const oyentes = new Set();

function leer() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE) || '[]');
  } catch {
    return [];
  }
}

function guardar(nuevas) {
  tareas = nuevas;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(tareas));
  } catch {
    /* sin almacenamiento: igual se sigue mientras la pestaña esté abierta */
  }
  oyentes.forEach((f) => f());
}

export function iniciarTarea({ tipo, mediaId, titulo }) {
  const id = `${tipo}:${mediaId}`;
  guardar([...tareas.filter((t) => t.id !== id), { id, tipo, mediaId, titulo, inicio: Date.now(), estado: 'corriendo' }]);
}

export function actualizarTarea(id, cambios) {
  guardar(tareas.map((t) => (t.id === id ? { ...t, ...cambios } : t)));
}

/** La tarea como está ahora (el que pregunta cada 3 s no puede quedarse con una copia vieja). */
export function tareaActual(id) {
  return tareas.find((t) => t.id === id) ?? null;
}

export function cerrarTarea(id) {
  guardar(tareas.filter((t) => t.id !== id));
}

export function useTareas() {
  return useSyncExternalStore(
    (f) => { oyentes.add(f); return () => oyentes.delete(f); },
    () => tareas,
  );
}
