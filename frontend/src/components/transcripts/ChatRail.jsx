import { colorAutor } from '../../lib/autores.js';
import { hace } from '../../lib/format.js';

/**
 * Lista de canales del visor de chats, con el último mensaje real de cada uno.
 * @param {{ canales: object[], activo: string | null, onSelect: (canal: object) => void,
 *           busqueda: string, onBuscar: (v: string) => void }} props
 */
export default function ChatRail({ canales, activo, onSelect, busqueda, onBuscar }) {
  const ahora = new Date();
  return (
    <aside className="chat-rail">
      <div className="chat-rail-head">
        <div className="buscador" style={{ minWidth: 0 }}>
          <span style={{ color: 'var(--text-3)' }}>⌕</span>
          <input
            type="search"
            placeholder="Buscar canal, autor o texto"
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
            aria-label="Buscar chat"
          />
        </div>
      </div>
      <div className="chat-rail-lista">
        {canales.length === 0 && <div className="empty">Ningún canal coincide.</div>}
        {canales.map((c) => (
          <button key={c.id} className={`chat-item${activo === c.id ? ' activo' : ''}`} onClick={() => onSelect(c)}>
            <div className="chat-item-top">
              <span className="chat-item-nombre">
                <span style={{ color: 'var(--text-3)' }}>#</span>
                {c.canal}
              </span>
              <span className="chat-item-hora">{c.ultimo_mensaje_at ? hace(c.ultimo_mensaje_at, ahora) : '—'}</span>
            </div>
            <div className="chat-item-preview">
              {c.ultimo_autor && <b style={{ color: colorAutor(c.ultimo_autor) }}>{c.ultimo_autor}: </b>}
              {c.ultimo_texto || 'sin mensajes'}
            </div>
            <div className="chat-item-meta">
              <span className="cat">{c.categoria}</span>
              <span>{c.mensajes} msgs</span>
              <span>·</span>
              <span>{c.autores.length} {c.autores.length === 1 ? 'autor' : 'autores'}</span>
              {c.adjuntos > 0 && <span>· 📎 {c.adjuntos}</span>}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
