import { useEffect, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
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
 * Las claves de las plataformas que ATV Ops consulta.
 *
 * Nunca se muestra un secreto entero: del servidor solo vienen los últimos cuatro
 * caracteres y el largo. Alcanza para reconocer cuál está cargada, que es la pregunta
 * real —"¿esta es la que renové o la vieja?"— sin que la pantalla sea un lugar de donde
 * copiarse tokens.
 */
export default function ClavesApi() {
  const [plataformas, setPlataformas] = useState(null);
  const [error, setError] = useState(null);
  const [borrador, setBorrador] = useState({});
  const [ocupado, setOcupado] = useState('');
  const [aviso, setAviso] = useState({});

  const cargar = () => {
    getClaves()
      .then((d) => { setPlataformas(d.plataformas || []); setError(null); })
      .catch(setError);
  };
  useEffect(cargar, []);

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
      setAviso((a) => ({
        ...a,
        [plataforma]: { tono: 'ok', texto: `Guardado: ${r.cambiados.join(', ')}.` },
      }));
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

  return (
    <div className="page">
      <PageHeader
        eyebrow="Sistema"
        titulo="Claves API"
        sub="Las credenciales de las plataformas que ATV Ops consulta. Un campo vacío no se toca."
      />

      {error ? <ErrorState error={error} /> : null}
      {!plataformas && !error ? <SkeletonBlock height={320} /> : null}

      {(plataformas || []).map((p) => {
        const msg = aviso[p.plataforma];
        const cuando = hace(p.actualizadoAt);
        return (
          <Card
            key={p.plataforma}
            title={p.etiqueta}
            sub={
              p.cargada
                ? `Cargada${cuando ? ` · actualizada ${cuando}` : ''}${p.origen ? ` · ${p.origen}` : ''}`
                : 'Sin cargar'
            }
            actions={
              <div className="claves-acciones">
                <Pill tone={p.cargada ? 'ok' : 'off'} dot>
                  {p.cargada ? 'cargada' : 'vacía'}
                </Pill>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => probar(p.plataforma)}
                  disabled={ocupado === p.plataforma}
                >
                  Probar
                </button>
              </div>
            }
          >
            <div className="claves-campos">
              {p.campos.map((c) => (
                <label key={c.clave} className={`claves-campo${c.largo ? ' es-largo' : ''}`}>
                  <span className="claves-label">
                    {c.label}
                    {c.secreto ? (
                      <span className="claves-secreto" title="Nunca se muestra entero">
                        secreto
                      </span>
                    ) : null}
                  </span>
                  <span className="claves-actual dim">
                    {c.valor ? `actual: ${c.valor}` : 'sin cargar'}
                  </span>
                  {c.largo ? (
                    <textarea
                      rows={4}
                      value={(borrador[p.plataforma] || {})[c.clave] || ''}
                      onChange={(e) => escribir(p.plataforma, c.clave, e.target.value)}
                      placeholder="Pegá el valor nuevo"
                    />
                  ) : (
                    <input
                      type="text"
                      value={(borrador[p.plataforma] || {})[c.clave] || ''}
                      onChange={(e) => escribir(p.plataforma, c.clave, e.target.value)}
                      placeholder="Pegá el valor nuevo"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                  {c.ayuda ? <span className="claves-ayuda dim">{c.ayuda}</span> : null}
                </label>
              ))}
            </div>

            <div className="claves-pie">
              <button
                type="button"
                className="btn sm"
                onClick={() => guardar(p.plataforma)}
                disabled={ocupado === p.plataforma}
              >
                {ocupado === p.plataforma ? 'Guardando…' : 'Guardar cambios'}
              </button>
              {msg ? <span className={`claves-aviso tono-${msg.tono}`}>{msg.texto}</span> : null}
            </div>
          </Card>
        );
      })}

      {plataformas ? (
        <p className="dim claves-nota">
          Un campo que dejás vacío queda como está: la pantalla muestra los secretos
          enmascarados, así que guardar lo que se ve los borraría todos. Para vaciar uno a
          propósito, escribí <code>BORRAR</code>.
        </p>
      ) : null}
    </div>
  );
}
