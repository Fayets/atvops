import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Carga un recurso de `src/data/api.js` con estados de carga y error.
 * Es la misma interfaz que va a servir cuando el fetch pegue contra el backend.
 * @template T
 * @param {() => Promise<T>} loader
 * @param {unknown[]} [deps]
 * @returns {{ data: T | null, loading: boolean, error: Error | null }}
 */
export function useResource(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let vivo = true;
    setState((s) => ({ ...s, loading: true }));
    loader()
      .then((data) => vivo && setState({ data, loading: false, error: null }))
      .catch((error) => vivo && setState({ data: null, loading: false, error }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/**
 * Ancho del contenedor, para gráficos SVG que se adaptan sin deformar trazos.
 * @returns {[React.RefObject<HTMLDivElement>, number]}
 */
export function useMeasure() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

/**
 * Estado persistido en localStorage. Se usa para el contador manual de pedidos
 * de datos: hasta que exista backend, el número tiene que sobrevivir al reload.
 * @template T
 * @param {string} key
 * @param {T} inicial
 */
export function useLocalState(key, inicial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      const base = typeof inicial === 'function' ? inicial() : inicial;
      return raw === null ? base : JSON.parse(raw);
    } catch {
      return typeof inicial === 'function' ? inicial() : inicial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* modo privado: se pierde al recargar, no rompe nada */
    }
  }, [key, value]);

  return [value, setValue];
}

/**
 * Vuelve a pedir los datos sola: cada `cada` ms y al volver a la pestaña.
 *
 * Sin esto, una pantalla abierta toda la mañana muestra la foto de cuando se abrió, y
 * quien la mira cree que el sistema no se actualiza. No corre con la pestaña escondida
 * —no tiene sentido refrescar lo que nadie ve— ni mientras alguien está escribiendo en
 * un campo: recargar debajo de la mano le borra lo que estaba cargando.
 *
 * @param {() => void} recargar
 * @param {number} [cada] milisegundos entre refrescos
 */
export function useRecargaSola(recargar, cada = 120_000) {
  const fn = useRef(recargar);
  useEffect(() => { fn.current = recargar; });

  useEffect(() => {
    const escribiendo = () => {
      const el = document.activeElement;
      return Boolean(el) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    };
    const reloj = setInterval(() => {
      if (document.visibilityState === 'visible' && !escribiendo()) fn.current();
    }, cada);
    const alVolver = () => {
      if (document.visibilityState === 'visible' && !escribiendo()) fn.current();
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [cada]);
}

/**
 * Avisa cuando el servidor tiene una versión más nueva que la que está corriendo acá.
 *
 * El index.html va sin caché, pero una pestaña que quedó abierta sigue con el JS viejo
 * para siempre: Ops se despliega varias veces por semana y quien no cierra nunca el
 * navegador trabaja con la versión del día que lo abrió.
 *
 * @returns {boolean} true cuando hay una versión nueva esperando
 */
export function useVersionNueva(cada = 300_000) {
  const [hayOtra, setHayOtra] = useState(false);
  const mia = useRef(null);

  useEffect(() => {
    let vivo = true;
    const mirar = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const { version } = await r.json();
        if (!vivo || !version) return;
        if (mia.current === null) mia.current = version;
        else if (version !== mia.current) setHayOtra(true);
      } catch {
        /* sin red se reintenta en la próxima vuelta */
      }
    };
    mirar();
    const reloj = setInterval(mirar, cada);
    document.addEventListener('visibilitychange', mirar);
    return () => {
      vivo = false;
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', mirar);
    };
  }, [cada]);

  return hayOtra;
}
