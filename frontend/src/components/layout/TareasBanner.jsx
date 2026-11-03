import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getProgresoReel } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { actualizarTarea, cerrarTarea, tareaActual, useTareas } from '../../lib/tareas.js';

const CADA_MS = 3000;
const ARRANQUE_MS = 60_000; // el análisis corre de fondo y tarda en tomar el turno: hasta un minuto
const num = (n) => formatValue(n ?? 0, 'count');

/** Termina cuando ya no hay nada corriendo y, o se lo vio correr, o pasó el minuto del arranque. */
export function terminada(t, p, ahora = Date.now()) {
  return !p.corriendo && (t.vioCorrer || ahora - t.inicio > ARRANQUE_MS);
}

/**
 * Banner de arriba con lo que corre de fondo: el análisis de un reel sigue aunque se cambie de
 * pantalla, y acá se ve cómo va y cuándo terminó.
 */
export default function TareasBanner() {
  const tareas = useTareas();
  const corriendo = tareas.filter((t) => t.estado === 'corriendo');
  const claves = corriendo.map((t) => t.id).join(',');

  useEffect(() => {
    if (!claves) return undefined;
    let vivo = true;
    const preguntar = () => corriendo.forEach((t) => {
      getProgresoReel(t.mediaId)
        .then((p) => {
          const hoy = tareaActual(t.id);
          if (!vivo || !hoy || hoy.estado !== 'corriendo') return;
          const vio = hoy.vioCorrer || p.corriendo;
          actualizarTarea(t.id, { progreso: p, vioCorrer: vio, estado: terminada({ ...hoy, vioCorrer: vio }, p) ? 'listo' : 'corriendo' });
        })
        .catch(() => { /* un pedido que falla no corta el seguimiento: el próximo vuelve a preguntar */ });
    });
    preguntar();
    const timer = setInterval(preguntar, CADA_MS);
    return () => { vivo = false; clearInterval(timer); };
    // `corriendo` se arma de nuevo en cada render; lo que importa es qué tareas son.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claves]);

  if (!tareas.length) return null;
  return (
    <div className="tareas-banner" role="status" aria-live="polite">
      {tareas.map((t) => {
        const p = t.progreso;
        const listo = t.estado === 'listo';
        const fraccion = p?.personas ? Math.min(1, p.analizados / p.personas) : 0;
        const titulo = (p?.caption || t.titulo || 'el reel').split('\n')[0].slice(0, 60);
        return (
          <div key={t.id} className={`tarea${listo ? ' lista' : ''}`}>
            <span className={`tarea-punto${listo ? '' : ' vivo'}`} aria-hidden="true" />
            <div className="tarea-txt">
              <b>{listo ? 'Listo: ' : 'Analizando '}«{titulo}»</b>
              <span className="dim">
                {!p || (!p.personas && !listo)
                  ? 'Leyendo los comentarios…'
                  : listo
                    ? `${num(p.analizados)} analizados · ${num(p.calificados)} calificados${p.personas > p.analizados ? ` · ${num(p.personas - p.analizados)} quedan para la próxima corrida` : ''}`
                    : `${num(p.analizados)} de ${num(p.personas)} analizados · ${num(p.calificados)} calificados`}
              </span>
            </div>
            {!listo && (
              <span className="tarea-barra" aria-hidden="true"><i style={{ transform: `scaleX(${fraccion})` }} /></span>
            )}
            <Link to={`/marketing/audiencia?reel=${t.mediaId}`} className="tarea-ver">Ver</Link>
            <button type="button" className="tarea-cerrar" onClick={() => cerrarTarea(t.id)} aria-label="Cerrar aviso">✕</button>
          </div>
        );
      })}
    </div>
  );
}
