import { useEffect, useMemo, useState } from 'react';
import {
  SETTER_AVATARES,
  SETTER_OPTIONS,
  reporteSetterVacio,
  totalAvatares,
} from '../../lib/reporteSetter.js';

/**
 * Modal: Reporte Diario — Setter (mismo layout que el form operativo).
 * @param {{
 *   abierto: boolean,
 *   perfil?: { id?: string, nombre?: string },
 *   fechaDefault?: string,
 *   initial?: object | null,
 *   onCerrar: () => void,
 *   onGuardar: (payload: object) => void | Promise<void>,
 * }} props
 */
export default function ReporteSetter({
  abierto,
  perfil,
  fechaDefault = '',
  initial = null,
  onCerrar,
  onGuardar,
}) {
  const setterDefault = useMemo(() => {
    if (perfil?.id && SETTER_OPTIONS.some((o) => o.value === perfil.id)) return perfil.id;
    const byName = SETTER_OPTIONS.find(
      (o) => o.label.toLowerCase() === (perfil?.nombre || '').toLowerCase(),
    );
    return byName?.value || perfil?.id || '';
  }, [perfil]);

  const [form, setForm] = useState(() =>
    reporteSetterVacio({ fecha: fechaDefault, setterId: setterDefault }),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    if (initial?.completado && initial.payload) {
      setForm({ ...reporteSetterVacio({ fecha: fechaDefault, setterId: setterDefault }), ...initial.payload });
    } else {
      setForm(reporteSetterVacio({ fecha: fechaDefault, setterId: setterDefault }));
    }
    setError('');
  }, [abierto, fechaDefault, setterDefault, initial]);

  if (!abierto) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setNum = (key, raw) => {
    const n = Math.max(0, Number(raw) || 0);
    set({ [key]: n });
  };
  const setAvatar = (id, raw) => {
    const n = Math.max(0, Number(raw) || 0);
    setForm((f) => ({ ...f, avatares: { ...f.avatares, [id]: n } }));
  };

  const guardar = async () => {
    if (!form.fecha) {
      setError('Indicá la fecha del reporte.');
      return;
    }
    if (!form.setterId) {
      setError('Seleccioná el setter.');
      return;
    }
    const sumaAvatar = totalAvatares(form.avatares);
    if (form.agendas > 0 && sumaAvatar > 0 && sumaAvatar !== form.agendas) {
      setError(`La suma de avatares (${sumaAvatar}) no coincide con agendas (${form.agendas}).`);
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onGuardar({ ...form });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop disp-backdrop" onClick={onCerrar} role="presentation">
      <div
        className="modal-card setter-reporte-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reporte Diario — Setter"
      >
        <header className="setter-reporte-head">
          <h3>Reporte Diario — Setter</h3>
          <button type="button" className="btn ghost disp-close" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="setter-reporte-body">
          <div className="setter-reporte-row-2">
            <label>
              Fecha
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => set({ fecha: e.target.value })}
              />
            </label>
            <label>
              Setter (selección)
              <select value={form.setterId} onChange={(e) => set({ setterId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {SETTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="setter-reporte-metrics">
            <label>
              Conversaciones
              <input type="number" min="0" value={form.conversaciones} onChange={(e) => setNum('conversaciones', e.target.value)} />
            </label>
            <label>
              Agendas
              <input type="number" min="0" value={form.agendas} onChange={(e) => setNum('agendas', e.target.value)} />
            </label>
            <label>
              Calendlys enviados
              <input type="number" min="0" value={form.calendlysEnviados} onChange={(e) => setNum('calendlysEnviados', e.target.value)} />
            </label>
            <label>
              Seguimientos
              <input type="number" min="0" value={form.seguimientos} onChange={(e) => setNum('seguimientos', e.target.value)} />
            </label>
            <label>
              Outbounds
              <input type="number" min="0" value={form.outbounds} onChange={(e) => setNum('outbounds', e.target.value)} />
            </label>
          </div>

          <section className="setter-reporte-avatares">
            <div className="setter-reporte-avatares-title">Avatar / Tipo de agendas generadas</div>
            <div className="setter-reporte-avatares-list">
              {SETTER_AVATARES.map((a) => (
                <label key={a.id} className="setter-reporte-avatar-row">
                  <span>{a.label}</span>
                  <input
                    type="number"
                    min="0"
                    value={form.avatares[a.id] ?? 0}
                    onChange={(e) => setAvatar(a.id, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>

          <label className="setter-reporte-text">
            Tipo de tráfico
            <textarea
              rows={3}
              value={form.tipoTrafico}
              onChange={(e) => set({ tipoTrafico: e.target.value })}
              placeholder="Ej.: más lento de lo habitual, picos al mediodía..."
            />
          </label>

          <label className="setter-reporte-text">
            ¿Fue un día bueno o malo?
            <textarea
              rows={3}
              value={form.diaBuenoMalo}
              onChange={(e) => set({ diaBuenoMalo: e.target.value })}
              placeholder="Ej.: Bueno — buen volumen y calidad de leads..."
            />
          </label>

          <label className="setter-reporte-text">
            Feedback a MKT
            <textarea
              rows={3}
              value={form.feedbackMkt}
              onChange={(e) => set({ feedbackMkt: e.target.value })}
              placeholder="Qué viste en conversaciones que sirva para creativos, copy o segmentación..."
            />
          </label>

          {error && <p className="disp-error" style={{ margin: '0 0 8px' }}>{error}</p>}
        </div>

        <footer className="disp-actions">
          <button type="button" className="btn" onClick={onCerrar} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={guardar} disabled={saving}>
            {saving ? 'Guardando…' : 'Enviar reporte'}
          </button>
        </footer>
      </div>
    </div>
  );
}
