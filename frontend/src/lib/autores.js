/**
 * Color estable por autor.
 *
 * Ojo con lo que este color NO es: hoy el pipeline no distingue staff de
 * cliente (no hay rol, ni id de usuario persistido, solo el `display_name` que
 * el bot escribe en el .txt). Así que esto identifica personas dentro de un
 * canal, no roles. La distinción staff/cliente es el paso siguiente.
 */
const PALETA = [
  '#e12b26',
  '#f97066',
  '#34d399',
  '#f0b429',
  '#7aa2f7',
  '#c084fc',
  '#2dd4bf',
  '#fb923c',
];

/** @param {string} nombre */
export function colorAutor(nombre) {
  let h = 0;
  for (let i = 0; i < nombre.length; i += 1) {
    h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  }
  return PALETA[h % PALETA.length];
}

/** Iniciales para el avatar. @param {string} nombre */
export function inicialesAutor(nombre) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}
