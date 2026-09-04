import { mediaUrl } from '../../data/api.js';

function iniciales(nombre) {
  return (nombre || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/**
 * @param {{ persona: { nombre: string, foto_url?: string | null }, size?: number }} props
 */
export default function Avatar({ persona, size = 28 }) {
  const url = mediaUrl(persona.foto_url);
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.36) };
  if (url) {
    return <img className="avatar" src={url} alt={persona.nombre} title={persona.nombre} style={style} />;
  }
  return (
    <span className="avatar avatar-ini" title={persona.nombre} style={style}>
      {iniciales(persona.nombre)}
    </span>
  );
}
