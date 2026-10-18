import { useEffect, useRef, useState } from 'react';
import { corregirCtaReel } from '../../data/api.js';

/**
 * Si Ops tomó al reel como reel con CTA, con qué palabra, y la forma de corregirlo.
 * "Detectado" es lo que decidió Ops solo; "Marcado" es lo que corrigió una persona y manda.
 */
export default function CtaReel({ reelId, cta, onCambio }) {
  const [abierto, setAbierto] = useState(null); // la posición del menú, o null si está cerrado
  const [palabra, setPalabra] = useState(cta?.palabra ?? '');
  const [estado, setEstado] = useState('');
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => { setPalabra(cta?.palabra ?? ''); }, [cta?.palabra]);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (!ref.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setAbierto(null);
    };
    const esc = (e) => { if (e.key === 'Escape') setAbierto(null); };
    const cerrar = () => setAbierto(null);
    window.addEventListener('scroll', cerrar, true);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', cerrar, true);
    };
  }, [abierto]);

  async function guardar(esCta, conPalabra = null) {
    setEstado('Recontando…');
    try {
      const r = await corregirCtaReel(reelId, esCta, conPalabra);
      setEstado('');
      setAbierto(null);
      onCambio?.(r);
    } catch (e) {
      setEstado(e.message || 'No se pudo guardar.');
    }
  }

  const es = Boolean(cta?.esCta);
  const manual = cta?.origen === 'manual';
  return (
    <span className="cta-reel" ref={ref}>
      <button type="button" className={`cta-reel-pill${es ? ' si' : ''}`}
        onClick={(e) => {
          // El menú va fijo en la pantalla: la tabla recorta lo que se sale de la columna.
          const r = e.currentTarget.getBoundingClientRect();
          setAbierto((v) => (v ? null : { top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 316) }));
        }}
        title={manual ? `Lo marcó ${cta?.por || 'alguien'} a mano. Tocá para cambiarlo.` : 'Lo detectó Ops por los comentarios. Tocá para corregirlo.'}>
        {es ? `CTA · ${cta?.palabra ?? ''}` : 'Sin CTA'}
        {manual && <em>a mano</em>}
      </button>
      {abierto && (
        <span className="cta-reel-menu" ref={menuRef} style={{ top: abierto.top, left: abierto.left }} role="dialog" aria-label="Corregir CTA del reel">
          <b>¿Este reel tiene CTA?</b>
          <form className="cta-reel-fila" onSubmit={(e) => { e.preventDefault(); guardar(true, palabra.trim() || null); }}>
            <input value={palabra} onChange={(e) => setPalabra(e.target.value)} placeholder="Palabra (vacío = la que detecte Ops)"
              aria-label="Palabra del CTA" />
            <button type="submit" className="btn sm primary">Sí, con CTA</button>
          </form>
          <button type="button" className="btn sm" onClick={() => guardar(false)}>No tiene CTA</button>
          {manual && <button type="button" className="btn sm ghost" onClick={() => guardar(null)}>Que lo decida Ops</button>}
          {estado && <span className="dim cta-reel-estado">{estado}</span>}
        </span>
      )}
    </span>
  );
}
