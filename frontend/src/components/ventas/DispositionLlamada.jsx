import { useEffect, useState } from 'react';
import {
  DISPOSITIONS,
  METODOS_PAGO,
  MOTIVOS_CANCELADO,
  MOTIVOS_DESCALIFICACION,
  MOTIVOS_REAGENDADO,
  OBJECTIONS,
  OFFER_TIERS,
  ORIGEN_LABEL,
  PROXIMOS_PASOS,
} from '../../lib/dispositions.js';
import { formatFechaHora } from '../../lib/format.js';

const EMPTY = {
  disposition: '',
  cerró: null,
  montoUsd: '',
  offerTier: '',
  metodoPago: '',
  fechaPagoEstimada: '',
  objection: '',
  proximoPaso: '',
  motivo: '',
  nurture: null,
  avisoNoShow: null,
  reagendarNoShow: null,
  nuevaFechaAt: '',
  notas: '',
};

function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Modal rápido de disposition post-llamada.
 * @param {{
 *   llamada: object,
 *   onCerrar: () => void,
 *   onGuardar: (payload: object) => void | Promise<void>,
 * }} props
 */
export default function DispositionLlamada({ llamada, onCerrar, onGuardar }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    offerTier: llamada?.offerTier || 'Boost',
    disposition: llamada?.estado && llamada.estado !== 'agendado' ? llamada.estado : '',
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      ...EMPTY,
      offerTier: llamada?.offerTier || 'Boost',
      disposition: llamada?.estado && llamada.estado !== 'agendado' ? llamada.estado : '',
      montoUsd: llamada?.montoUsd != null ? String(llamada.montoUsd) : '',
      notas: llamada?.notasCloser || '',
    });
    setError('');
  }, [llamada]);

  if (!llamada) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const d = form.disposition;

  const validar = () => {
    if (!d) return 'Elegí una disposition.';
    if (d === 'show_calificado') {
      if (form.cerró == null) return 'Indicá si cerró.';
      if (form.cerró === true) {
        if (!form.montoUsd || Number(form.montoUsd) <= 0) return 'Ingresá el monto del cierre.';
        if (!form.offerTier) return 'Confirmá el offer tier.';
        if (!form.metodoPago) return 'Elegí método de pago.';
      } else {
        if (!form.objection) return 'Elegí la objection principal.';
        if (!form.proximoPaso) return 'Elegí el próximo paso.';
      }
    }
    if (d === 'show_descalificado' && !form.motivo) return 'Elegí el motivo de descalificación.';
    if (d === 'no_show') {
      if (form.avisoNoShow == null) return '¿Intentó avisar?';
      if (form.reagendarNoShow == null) return '¿Reagendar o marcar perdido?';
    }
    if (d === 'reagendado') {
      if (!form.nuevaFechaAt) return 'Elegí la nueva fecha y hora.';
      if (!form.motivo) return 'Elegí el motivo del reagendado.';
    }
    if (d === 'cancelado' && !form.motivo) return 'Elegí el motivo de cancelación.';
    if (d === 'cerrado') {
      if (!form.montoUsd || Number(form.montoUsd) <= 0) return 'El monto del cierre es obligatorio.';
      if (!form.offerTier) return 'Confirmá el offer tier.';
      if (!form.metodoPago) return 'Elegí método de pago.';
    }
    return '';
  };

  const guardar = async () => {
    const err = validar();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = {
        llamadaId: llamada.id,
        disposition: d,
        cerró: form.cerró,
        montoUsd: form.montoUsd ? Number(form.montoUsd) : null,
        offerTier: form.offerTier || llamada.offerTier,
        metodoPago: form.metodoPago || null,
        fechaPagoEstimada: form.fechaPagoEstimada || null,
        objection: form.objection || null,
        proximoPaso: form.proximoPaso || null,
        motivo: form.motivo || null,
        nurture: form.nurture,
        avisoNoShow: form.avisoNoShow,
        reagendarNoShow: form.reagendarNoShow,
        nuevaFechaAt: fromDatetimeLocal(form.nuevaFechaAt),
        notas: form.notas.trim() || null,
      };
      await onGuardar(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop disp-backdrop" onClick={onCerrar} role="presentation">
      <div
        className="modal-card disp-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Disposition · ${llamada.prospecto}`}
      >
        <header className="disp-head">
          <div>
            <h3>{llamada.prospecto}</h3>
            <div className="disp-meta">
              {formatFechaHora(llamada.fechaAt)}
              {' · '}
              {llamada.offerTier || '—'}
              {' · '}
              {ORIGEN_LABEL[llamada.origen] ?? llamada.origen}
            </div>
          </div>
          <button type="button" className="btn ghost disp-close" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        <section className="disp-section">
          <div className="disp-section-title">Disposition</div>
          <div className="disp-grid">
            {DISPOSITIONS.map((opt) => {
              const active = d === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`disp-card color-${opt.color}${active ? ' active' : ''}${opt.destacado ? ' destacado' : ''}`}
                  onClick={() => set({ disposition: opt.id, cerró: null })}
                >
                  <span className="disp-card-label">{opt.label}</span>
                  <span className="disp-card-desc">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {d && (
          <section className="disp-section disp-fields">
            <div className="disp-section-title">Detalle</div>

            {d === 'show_calificado' && (
              <>
                <fieldset className="disp-fieldset">
                  <legend>¿Cerró?</legend>
                  <div className="disp-toggle">
                    <button type="button" className={`btn sm${form.cerró === true ? ' primary' : ''}`} onClick={() => set({ cerró: true })}>
                      Sí
                    </button>
                    <button type="button" className={`btn sm${form.cerró === false ? ' primary' : ''}`} onClick={() => set({ cerró: false })}>
                      No
                    </button>
                  </div>
                </fieldset>
                {form.cerró === true && (
                  <div className="disp-form-grid">
                    <label>
                      Monto del cierre (USD)
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="100"
                        value={form.montoUsd}
                        onChange={(e) => set({ montoUsd: e.target.value })}
                      />
                    </label>
                    <label>
                      Offer tier
                      <select className="select" value={form.offerTier} onChange={(e) => set({ offerTier: e.target.value })}>
                        {OFFER_TIERS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Método de pago
                      <select className="select" value={form.metodoPago} onChange={(e) => set({ metodoPago: e.target.value })}>
                        <option value="">Elegir…</option>
                        {METODOS_PAGO.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {form.cerró === false && (
                  <div className="disp-form-grid">
                    <label>
                      Objection principal
                      <select className="select" value={form.objection} onChange={(e) => set({ objection: e.target.value })}>
                        <option value="">Elegir…</option>
                        {OBJECTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Próximo paso
                      <select className="select" value={form.proximoPaso} onChange={(e) => set({ proximoPaso: e.target.value })}>
                        <option value="">Elegir…</option>
                        {PROXIMOS_PASOS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </>
            )}

            {d === 'show_descalificado' && (
              <div className="disp-form-grid">
                <label>
                  Motivo de descalificación
                  <select className="select" value={form.motivo} onChange={(e) => set({ motivo: e.target.value })}>
                    <option value="">Elegir…</option>
                    {MOTIVOS_DESCALIFICACION.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <fieldset className="disp-fieldset">
                  <legend>¿Mover a nurture?</legend>
                  <div className="disp-toggle">
                    <button type="button" className={`btn sm${form.nurture === true ? ' primary' : ''}`} onClick={() => set({ nurture: true })}>Sí</button>
                    <button type="button" className={`btn sm${form.nurture === false ? ' primary' : ''}`} onClick={() => set({ nurture: false })}>No</button>
                  </div>
                </fieldset>
              </div>
            )}

            {d === 'no_show' && (
              <div className="disp-form-grid">
                <fieldset className="disp-fieldset">
                  <legend>¿Intentó avisar?</legend>
                  <div className="disp-toggle">
                    <button type="button" className={`btn sm${form.avisoNoShow === true ? ' primary' : ''}`} onClick={() => set({ avisoNoShow: true })}>Sí</button>
                    <button type="button" className={`btn sm${form.avisoNoShow === false ? ' primary' : ''}`} onClick={() => set({ avisoNoShow: false })}>No</button>
                  </div>
                </fieldset>
                <fieldset className="disp-fieldset">
                  <legend>¿Reagendar?</legend>
                  <div className="disp-toggle">
                    <button type="button" className={`btn sm${form.reagendarNoShow === true ? ' primary' : ''}`} onClick={() => set({ reagendarNoShow: true, disposition: 'reagendado' })}>
                      Sí · nueva fecha
                    </button>
                    <button type="button" className={`btn sm${form.reagendarNoShow === false ? ' primary' : ''}`} onClick={() => set({ reagendarNoShow: false })}>
                      No · perdido
                    </button>
                  </div>
                </fieldset>
              </div>
            )}

            {d === 'reagendado' && (
              <div className="disp-form-grid">
                <label>
                  Nueva fecha y hora
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.nuevaFechaAt || toDatetimeLocal(llamada.fechaAt)}
                    onChange={(e) => set({ nuevaFechaAt: e.target.value })}
                  />
                </label>
                <label>
                  Motivo
                  <select className="select" value={form.motivo} onChange={(e) => set({ motivo: e.target.value })}>
                    <option value="">Elegir…</option>
                    {MOTIVOS_REAGENDADO.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {d === 'cancelado' && (
              <div className="disp-form-grid">
                <label>
                  Motivo
                  <select className="select" value={form.motivo} onChange={(e) => set({ motivo: e.target.value })}>
                    <option value="">Elegir…</option>
                    {MOTIVOS_CANCELADO.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <fieldset className="disp-fieldset">
                  <legend>¿Mover a nurture?</legend>
                  <div className="disp-toggle">
                    <button type="button" className={`btn sm${form.nurture === true ? ' primary' : ''}`} onClick={() => set({ nurture: true })}>Sí</button>
                    <button type="button" className={`btn sm${form.nurture === false ? ' primary' : ''}`} onClick={() => set({ nurture: false })}>No</button>
                  </div>
                </fieldset>
              </div>
            )}

            {d === 'cerrado' && (
              <div className="disp-form-grid">
                <label>
                  Monto del cierre (USD) *
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="100"
                    value={form.montoUsd}
                    onChange={(e) => set({ montoUsd: e.target.value })}
                  />
                </label>
                <label>
                  Offer tier *
                  <select className="select" value={form.offerTier} onChange={(e) => set({ offerTier: e.target.value })}>
                    {OFFER_TIERS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Método de pago *
                  <select className="select" value={form.metodoPago} onChange={(e) => set({ metodoPago: e.target.value })}>
                    <option value="">Elegir…</option>
                    {METODOS_PAGO.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Fecha de pago estimada
                  <input
                    className="input"
                    type="date"
                    value={form.fechaPagoEstimada}
                    onChange={(e) => set({ fechaPagoEstimada: e.target.value })}
                  />
                </label>
              </div>
            )}

            <label className="disp-notas">
              Notas del closer
              <textarea
                className="input"
                rows={3}
                value={form.notas}
                onChange={(e) => set({ notas: e.target.value })}
                placeholder="Breve: qué pasó, next step…"
              />
            </label>
          </section>
        )}

        {error && <p className="disp-error">{error}</p>}

        <footer className="disp-actions">
          <button type="button" className="btn" onClick={onCerrar} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={guardar} disabled={saving || !d}>
            {d === 'reagendado' ? 'Confirmar reagendado' : d === 'cerrado' ? 'Confirmar cierre' : 'Guardar disposition'}
          </button>
        </footer>
      </div>
    </div>
  );
}
