import { useEffect, useState } from 'react';
import { API_BASE } from '../../data/api.js';
import { getToken } from '../../lib/auth.js';

/**
 * Un adjunto del transcript. Las imágenes se muestran: primero desde disco
 * (el bot las descarga al capturar), si no desde el link de Discord — que
 * caduca a las 24 h, así que si falla se avisa en vez de mostrar un ícono roto.
 * @param {{ adjunto: { url: string, nombre: string, es_imagen: boolean, local: string | null },
 *           categoria: string, canal: string, onCarga?: () => void }} props
 */
export default function Adjunto({ adjunto, categoria, canal, onCarga }) {
  const [src, setSrc] = useState(adjunto.local ? null : adjunto.url);
  const [vencida, setVencida] = useState(false);

  useEffect(() => {
    if (!adjunto.local || !adjunto.es_imagen) return undefined;
    let url = null;
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(
          `${API_BASE}/api/transcripts/${encodeURIComponent(categoria)}/${encodeURIComponent(canal)}/adjuntos/${encodeURIComponent(adjunto.local)}`,
          { headers: { Authorization: `Bearer ${getToken()}` } },
        );
        if (!r.ok) throw new Error(String(r.status));
        url = URL.createObjectURL(await r.blob());
        if (!cancelado) setSrc(url);
      } catch {
        if (!cancelado) setSrc(adjunto.url);
      }
    })();
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [adjunto.local, adjunto.es_imagen, adjunto.url, categoria, canal]);

  if (!adjunto.es_imagen) {
    return (
      <a className="msg-adjunto" href={adjunto.url} target="_blank" rel="noreferrer noopener">
        📎 {adjunto.nombre}
      </a>
    );
  }

  if (vencida) {
    return (
      <a className="msg-adjunto vencida" href={adjunto.url} target="_blank" rel="noreferrer noopener" title="Discord caduca los links de imágenes a las 24 h; el bot guarda las nuevas en disco">
        🖼 {adjunto.nombre} · imagen vencida en Discord
      </a>
    );
  }

  if (!src) return <div className="msg-imagen cargando" />;

  return (
    <a href={src} target="_blank" rel="noreferrer noopener" className="msg-imagen-link">
      <img
        className="msg-imagen"
        src={src}
        alt={adjunto.nombre}
        loading="lazy"
        onLoad={onCarga}
        onError={() => setVencida(true)}
      />
    </a>
  );
}
