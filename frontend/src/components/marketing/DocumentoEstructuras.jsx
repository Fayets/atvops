import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { estructuraDecidir, estructurasRevisar, getEstructurasHistorias } from '../../data/api.js';

/**
 * Las estructuras de historias de Juan como documento: cada una con sus pasos y las
 * secuencias reales que la prueban (fecha y respuestas). Las que propuso la revisión
 * semanal van arriba para aceptarlas o descartarlas.
 */

const ROL = {
  gancho: 'Gancho', contexto: 'Contexto', 'enseñanza': 'Enseñanza', prueba: 'Prueba', historia_personal: 'Historia personal',
  humor: 'Humor', objecion: 'Objeción', cta: 'CTA', otro: 'Otro',
};

const fecha = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

export default function DocumentoEstructuras({ onCerrar, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const traer = useCallback(() => getEstructurasHistorias(true).then(setDatos).catch((e) => setError(e.message)), []);
  useEffect(() => { traer(); }, [traer]);
  const armando = datos?.armando || datos?.revision?.estado === 'armando';
  useEffect(() => {
    if (!armando) return undefined;
    const t = setInterval(traer, 5000);
    return () => clearInterval(t);
  }, [armando, traer]);

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = previo; };
  }, [onCerrar]);

  const revisar = async () => { setError(''); try { setDatos(await estructurasRevisar()); } catch (e) { setError(e.message); } };
  const decidir = async (clave, estado) => {
    setError('');
    try { setDatos(await estructuraDecidir(clave, estado)); onCambio?.(); } catch (e) { setError(e.message); }
  };

  const rev = datos?.revision;
  const aviso = !datos ? 'Cargando…'
    : armando ? 'Leyendo las historias nuevas…'
      : [`${datos.dias} secuencias leídas`, `${datos.sueltas} sueltas`,
        rev ? `última revisión ${fecha(rev.creadoAt.slice(0, 10))}${rev.estado === 'error' ? ' (falló)' : ''}` : null].filter(Boolean).join(' · ');

  return createPortal(
    <div className="dc" role="dialog" aria-modal="true" aria-label="Estructuras de historias">
      <header className="dc-barra">
        <div className="dc-nombre">
          <span className="dc-icono" aria-hidden="true" />
          <div>
            <b>Estructuras de historias</b>
            <span className="dc-aviso">{aviso}</span>
          </div>
        </div>
        <div className="dc-acciones">
          <button type="button" className="btn ghost" disabled={armando || !datos} onClick={revisar}>{armando ? 'Revisando…' : 'Revisar ahora'}</button>
          <button type="button" className="btn" onClick={onCerrar}>Cerrar</button>
        </div>
      </header>
      <div className="dc-mesa">
        <article className="dc-hoja">
          <h1 className="dc-titulo">Estructuras de historias</h1>
          {error && <p className="pz-error">{error}</p>}
          {rev?.estado === 'error' && <p className="pz-error">{rev.error}</p>}
          {(datos?.estructuras || []).map((e) => (
            <section key={e.clave} className={`es-bloque${e.estado === 'propuesta' ? ' propuesta' : ''}`}>
              <div className="es-cabeza">
                <h2 className="es-nombre">{e.nombre}</h2>
                {e.estado === 'propuesta' && (
                  <div className="es-decidir">
                    <span className="es-badge">Propuesta</span>
                    <button type="button" className="btn sm primary" onClick={() => decidir(e.clave, 'activa')}>Aceptar</button>
                    <button type="button" className="btn sm" onClick={() => decidir(e.clave, 'descartada')}>Descartar</button>
                  </div>
                )}
              </div>
              <p className="es-meta">
                {[e.respuestas != null ? `${e.respuestas} respuestas (mediana)` : null, e.historias ? `${e.historias} historias` : null,
                  `${e.ejemplos.length} secuencias`].filter(Boolean).join(' · ')}
              </p>
              {e.cuando && <p className="es-cuando">{e.cuando}</p>}
              <ol className="es-pasos">
                {e.pasos.map((p, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i}><span className="es-rol">{ROL[p.rol] || p.rol}</span>{p.que}</li>
                ))}
              </ol>
              <div className="es-ejemplos">
                {e.ejemplos.map((x) => (
                  <span key={x.fecha} className="es-ej">{fecha(x.fecha)}{x.respuestas != null ? ` · ${x.respuestas}` : ''}</span>
                ))}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>,
    document.body,
  );
}
