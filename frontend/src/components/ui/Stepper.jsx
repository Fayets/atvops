import { formatFecha } from '../../lib/format.js';

const ICONO = { completado: '✓', en_curso: '•', pendiente: '', bloqueado: '!' };

/**
 * Timeline vertical de un proceso de onboarding.
 * @param {{ pasos: import('../../data/types.js').PasoOnboarding[], diasTranscurridos: number }} props
 */
export default function Stepper({ pasos, diasTranscurridos }) {
  return (
    <div className="stepper">
      {pasos.map((p, i) => {
        const atrasado =
          p.estado !== 'completado' && diasTranscurridos > p.diaObjetivo;
        return (
          <div key={p.id} className={`step ${p.estado}`}>
            <div className="step-dot">{ICONO[p.estado] || i + 1}</div>
            <div className="step-body">
              <h4>
                {p.nombre}
                {atrasado && (
                  <span style={{ fontSize: 11, color: 'var(--brand-hi)', fontWeight: 500 }}>
                    {diasTranscurridos - p.diaObjetivo} d de retraso
                  </span>
                )}
              </h4>
              <div className="step-meta">
                {p.responsable} · día {p.diaObjetivo}
                {p.completadoAt ? ` · hecho el ${formatFecha(p.completadoAt)}` : ''}
              </div>
              {p.detalle && <div className="step-detalle">{p.detalle}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
