import { useEffect, useState } from 'react';
import Card from '../ui/Card.jsx';
import { borrarPrograma, getProgramas, guardarPrograma } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';

/**
 * Precios de los programas. Es lo que se factura por cada venta: el closer elige
 * el programa y el sistema sabe cuánto se facturó. Solo ops, admin o founder.
 */
export default function ProgramasPrecios() {
  const [programas, setProgramas] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [nuevo, setNuevo] = useState({ nombre: '', precioUsd: '' });

  useEffect(() => {
    getProgramas().then((r) => setProgramas(r.programas)).catch((e) => setError(e.message));
  }, []);

  const aplicar = async (payload, clave) => {
    setGuardando(clave);
    setError(null);
    try {
      const r = await guardarPrograma(payload);
      setProgramas(r.programas);
      if (!payload.id) setNuevo({ nombre: '', precioUsd: '' });
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(null);
    }
  };

  const eliminar = async (p) => {
    if (!window.confirm(`¿Borrar el programa "${p.nombre}"? Las ventas ya cargadas lo conservan.`)) return;
    setGuardando(p.id);
    try {
      setProgramas((await borrarPrograma(p.id)).programas);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(null);
    }
  };

  return (
    <Card
      title="Precios de los programas"
      sub="Lo que se factura por cada venta. El closer elige el programa y el sistema calcula la facturación."
      foot="Se guarda en el CRM de Marketing, así los dos sistemas muestran el mismo número."
    >
      {error && <div className="ronda-evento error" style={{ marginBottom: 10 }}>{error}</div>}
      {!programas ? (
        <div className="empty">Cargando…</div>
      ) : (
        <div className="programas-tabla">
          {programas.map((p) => (
            <div key={p.id} className="programa-fila">
              <input
                defaultValue={p.nombre}
                onBlur={(e) => e.target.value.trim() !== p.nombre && aplicar({ ...p, nombre: e.target.value }, p.id)}
                aria-label={`Nombre de ${p.nombre}`}
              />
              <input
                type="number"
                inputMode="decimal"
                defaultValue={p.precioUsd}
                onBlur={(e) => Number(e.target.value) !== p.precioUsd && aplicar({ ...p, precioUsd: e.target.value }, p.id)}
                aria-label={`Precio de ${p.nombre}`}
              />
              <button className="btn sm" onClick={() => eliminar(p)} disabled={guardando === p.id}>Borrar</button>
            </div>
          ))}

          <div className="programa-fila" style={{ marginTop: 6 }}>
            <input
              placeholder="Programa nuevo"
              value={nuevo.nombre}
              onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))}
            />
            <input
              type="number"
              inputMode="decimal"
              placeholder="Precio USD"
              value={nuevo.precioUsd}
              onChange={(e) => setNuevo((n) => ({ ...n, precioUsd: e.target.value }))}
            />
            <button
              className="btn primary"
              onClick={() => aplicar({ nombre: nuevo.nombre, precioUsd: nuevo.precioUsd, orden: programas.length }, 'nuevo')}
              disabled={!nuevo.nombre.trim() || guardando === 'nuevo'}
            >
              Agregar
            </button>
          </div>

          <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
            {programas.length} programas · el más caro {formatValue(Math.max(0, ...programas.map((p) => p.precioUsd)), 'usd')}
          </div>
        </div>
      )}
    </Card>
  );
}
