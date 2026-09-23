import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal centrado reutilizable: Escape, click afuera y X cierran.
 * @param {{ open: boolean, onClose: () => void, title: string, children: import('react').ReactNode,
 *           className?: string, wide?: boolean }} props
 */
export default function Modal({ open, onClose, title, children, className = '', wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal-card modal-docs${wide ? ' wide' : ''}${className ? ` ${className}` : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-docs-head">
          <h2>{title}</h2>
          <button type="button" className="btn icon modal-docs-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="modal-docs-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
