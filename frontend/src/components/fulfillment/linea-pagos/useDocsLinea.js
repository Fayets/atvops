import { useCallback, useEffect, useRef, useState } from 'react';
import { borrarLineaPagosDoc, getLineaPagosDocs, guardarLineaPagosDoc } from '../../../data/api.js';

const CADA_MS = 30_000;

/**
 * Las notas y los ajustes de la línea, compartidos en la base de Ops: lo que carga Mauri lo
 * ve dirección y al revés. Se guarda al toque en pantalla y después en la base; cada 30
 * segundos se trae lo que cargó otra persona.
 *
 * notas:   { [clienteId]: [{ id, t, at, ed? }] }
 * ajustes: { [clienteId]: { v?, estado?, deuda?, prox?, monto?, at } }
 */
export function useDocsLinea() {
  const [notas, setNotas] = useState({});
  const [ajustes, setAjustes] = useState({});
  const [error, setError] = useState({ notes: '', ajustes: '' });
  const pendientes = useRef(0);
  const colas = useRef(new Map());

  const traer = useCallback(async (coleccion) => {
    const docs = await getLineaPagosDocs(coleccion);
    // Con una escritura en vuelo, lo que llega puede ser de antes de guardar: se descarta
    // y la vuelta que sigue al guardado trae lo bueno.
    if (pendientes.current) return;
    const o = {};
    (docs || []).forEach((d) => {
      const id = +String(d.id).slice(1);
      const x = d.data;
      if (coleccion === 'notes') { if (x && Array.isArray(x.items) && x.items.length) o[id] = x.items; }
      else if (x && Object.keys(x).length) o[id] = x;
    });
    // Sin cambios, se queda el mismo objeto: si no, cada vuelta volvía a dibujar la línea.
    const igual = (prev) => (JSON.stringify(prev) === JSON.stringify(o) ? prev : o);
    (coleccion === 'notes' ? setNotas : setAjustes)(igual);
  }, []);

  useEffect(() => {
    const todo = () => Promise.all([traer('ajustes'), traer('notes')]).catch(() => {});
    todo();
    const t = setInterval(todo, CADA_MS);
    return () => clearInterval(t);
  }, [traer]);

  // Las escrituras de un mismo cliente van en fila: si no, un "borrar" podía llegar a la
  // base antes que el "guardar" que lo precedía.
  const escribir = useCallback((coleccion, id, data) => {
    const clave = `${coleccion}:${id}`;
    pendientes.current += 1;
    const antes = colas.current.get(clave) || Promise.resolve();
    const despues = antes
      .catch(() => {})
      .then(() => (data ? guardarLineaPagosDoc(coleccion, `c${id}`, data) : borrarLineaPagosDoc(coleccion, `c${id}`)))
      .then(
        () => setError((e) => ({ ...e, [coleccion]: '' })),
        (e) => setError((x) => ({ ...x, [coleccion]: `No se pudo guardar: ${e?.message || e}` })),
      )
      .finally(() => {
        pendientes.current -= 1;
        if (!pendientes.current) traer(coleccion).catch(() => {});
      });
    colas.current.set(clave, despues);
    return despues;
  }, [traer]);

  const guardarNotas = useCallback((id, items) => {
    setNotas((n) => {
      const o = { ...n };
      if (items.length) o[id] = items; else delete o[id];
      return o;
    });
    return escribir('notes', id, items.length ? { items } : null);
  }, [escribir]);

  /** `a` vacío o null quita el ajuste: el cliente vuelve a lo que dice la ficha. */
  const guardarAjuste = useCallback((id, a) => {
    setAjustes((x) => {
      const o = { ...x };
      if (a) o[id] = a; else delete o[id];
      return o;
    });
    return escribir('ajustes', id, a || null);
  }, [escribir]);

  return { notas, ajustes, error, guardarNotas, guardarAjuste };
}
