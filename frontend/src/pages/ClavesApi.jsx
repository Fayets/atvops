import { useState, useEffect } from 'react';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import LogoPlataforma from '../components/ui/LogoPlataforma.jsx';
import Modal from '../components/ui/Modal.jsx';
import { getClaves, guardarClave, probarClave } from '../data/api.js';

function hace(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const dias = Math.round((Date.now() - t) / 86400000);
  if (dias < 1) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 60) return `hace ${dias} días`;
  return `hace ${Math.round(dias / 30)} meses`;
}

/**
 * Las claves de las plataformas que ATV Ops consulta: una tarjeta por plataforma, con su logo,
 * y los campos se editan en una ventana aparte.
 *
 * Nunca se muestra un secreto entero: del servidor solo vienen los últimos cuatro
 * caracteres y el largo. Alcanza para reconocer cuál está cargada —"¿esta es la que renové
 * o la vieja?"— sin que la pantalla sea un lugar de donde copiarse tokens.
 */
export default function ClavesApi() {
  const [plataformas, setPlataformas] = useState(null);
  const [error, setError] = useState(null);
  const [borrador, setBorrador] = useState({});
  const [ocupado, setOcupado] = useState('');
  const [aviso, setAviso] = useState({});
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    getClaves()
      .then((d) => { setPlataformas(d.plataformas || []); setError(null); })
      .catch(setError);
  }, []);

  const escribir = (plataforma, clave, valor) => {
    setBorrador((b) => ({ ...b, [plataforma]: { ...(b[plataforma] || {}), [clave]: valor } }));
  };

  const guardar = async (plataforma) => {
    const cambios = borrador[plataforma] || {};
    if (!Object.values(cambios).some((v) => String(v || '').trim())) {
      setAviso((a) => ({ ...a, [plataforma]: { tono: 'off', texto: 'No escribiste nada para cambiar.' } }));
      return;
    }
    setOcupado(plataforma);
    setAviso((a) => ({ ...a, [plataforma]: null }));
    try {
      const r = await guardarClave(plataforma, cambios);
      setPlataformas(r.plataformas || []);
      setBorrador((b) => ({ ...b, [plataforma]: {} }));
      setAviso((a) => ({ ...a, [plataforma]: { tono: 'ok', texto: `Guardado: ${r.cambiados.join(', ')}.` } }));
      setAbierta(null);
    } catch (e) {
      setAviso((a) => ({ ...a, [plataforma]: { tono: 'alert', texto: e.message } }));
    } finally {
      setOcupado('');
    }
  };

  const probar = async (plataforma) => {
    setOcupado(plataforma);
    setAviso((a) => ({ ...a, [plataforma]: null }));
    try {
      const r = await probarClave(plataforma);
      const tono = r.ok === true ? 'ok' : r.ok === false ? 'alert' : 'off';
      setAviso((a) => ({ ...a, [plataforma]: { tono, texto: r.detalle } }));
    } catch (e) {
      setAviso((a) => ({ ...a, [plataforma]: { tono: 'alert', texto: e.message } }));
    } finally {
      setOcupado('');
    }
  };

  const editando = (plataformas || []).find((p) => p.plataforma === abierta);

  return (
    <div className="page">
      {error ? <ErrorState error={error} /> : null}
      {!plataformas && !error ? <SkeletonBlock height={320} /> : null}

      <div className="claves-grilla">
        {(plataformas || []).map((p) => {
          const msg = aviso[p.plataforma];
          const cuando = hace(p.actualizadoAt);
          return (
            <article key={p.plataforma} className={`clave-tarjeta${p.cargada ? '' : ' vacia'}`}>
              <button type="button" className="clave-abrir" onClick={() => setAbierta(p.plataforma)}
                aria-label={`Editar ${p.etiqueta}`}>
                <LogoPlataforma plataforma={p.plataforma} size={44} />
                <span className="clave-nombre">{p.etiqueta}</span>
                <span className={`clave-estado ${p.cargada ? 'ok' : 'off'}`}>
                  <i aria-hidden="true" />
                  {p.cargada ? (cuando ? `Cargada · ${cuando}` : 'Cargada') : 'Sin cargar'}
                </span>
              </button>
              <div className="clave-pie">
                <button type="button" className="btn sm ghost" onClick={() => probar(p.plataforma)}
                  disabled={ocupado === p.plataforma || !p.cargada}>
                  {ocupado === p.plataforma ? 'Probando…' : 'Probar'}
                </button>
                <button type="button" className="btn sm" onClick={() => setAbierta(p.plataforma)}>
                  {p.cargada ? 'Editar' : 'Cargar'}
                </button>
              </div>
              {msg ? <p className={`claves-aviso tono-${msg.tono}`}>{msg.texto}</p> : null}
            </article>
          );
        })}
      </div>

      <Modal open={Boolean(editando)} onClose={() => setAbierta(null)} title={editando?.etiqueta || ''}>
        {editando ? (
          <div className="clave-editor">
            <div className="clave-editor-cab">
              <LogoPlataforma plataforma={editando.plataforma} size={36} />
              <span className="dim">Lo que dejes vacío queda como está. Para vaciar un campo, escribí BORRAR.</span>
            </div>
            {editando.campos.map((c) => (
              <label key={c.clave} className="claves-campo">
                <span className="claves-label">
                  {c.label}
                  {c.secreto ? <span className="claves-secreto" title="Nunca se muestra entero">secreto</span> : null}
                </span>
                <span className="claves-actual dim">{c.valor ? `actual: ${c.valor}` : 'sin cargar'}</span>
                {c.largo ? (
                  <textarea rows={4} value={(borrador[editando.plataforma] || {})[c.clave] || ''}
                    onChange={(e) => escribir(editando.plataforma, c.clave, e.target.value)}
                    placeholder="Pegá el valor nuevo" />
                ) : (
                  <input type="text" value={(borrador[editando.plataforma] || {})[c.clave] || ''}
                    onChange={(e) => escribir(editando.plataforma, c.clave, e.target.value)}
                    placeholder="Pegá el valor nuevo" autoComplete="off" spellCheck={false} />
                )}
                {c.ayuda ? <span className="claves-ayuda dim">{c.ayuda}</span> : null}
              </label>
            ))}
            <div className="claves-pie">
              <button type="button" className="btn primary sm" onClick={() => guardar(editando.plataforma)}
                disabled={ocupado === editando.plataforma}>
                {ocupado === editando.plataforma ? 'Guardando…' : 'Guardar'}
              </button>
              {aviso[editando.plataforma] && aviso[editando.plataforma].tono !== 'ok' ? (
                <span className={`claves-aviso tono-${aviso[editando.plataforma].tono}`}>{aviso[editando.plataforma].texto}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
