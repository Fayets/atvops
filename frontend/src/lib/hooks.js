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
      return raw === null ? inicial : JSON.parse(raw);
    } catch {
      return inicial;
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
