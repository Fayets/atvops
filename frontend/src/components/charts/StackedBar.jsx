/**
 * Barra apilada al 100%. Se usa para el mix de conversación: de qué habla el
 * cliente en su canal. Implementación y celebración son buenas señales; queja
 * es una alarma temprana.
 *
 * @param {{ partes: { label: string, valor: number, color: string }[],
 *           alto?: number, leyenda?: boolean }} props
 */
export default function StackedBar({ partes, alto = 10, leyenda = true }) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', height: alto, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-3)' }}>
        {partes.map((p) => (
          <span
            key={p.label}
            title={`${p.label}: ${Math.round((p.valor / total) * 100)}%`}
            style={{ width: `${(p.valor / total) * 100}%`, background: p.color }}
          />
        ))}
      </div>
      {leyenda && (
        <div className="legend">
          {partes.map((p) => (
            <span className="k" key={p.label}>
              <i style={{ background: p.color }} />
              {p.label} <span className="num" style={{ color: 'var(--text-3)' }}>{Math.round((p.valor / total) * 100)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
