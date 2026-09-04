/**
 * Barra de progreso contra un objetivo.
 * @param {{ pct: number, tone?: 'brand' | 'ok' | 'warn' }} props
 */
export default function Bar({ pct, tone = 'brand' }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={`bar${tone === 'brand' ? '' : ` ${tone}`}`}>
      <span style={{ width: `${w}%` }} />
    </div>
  );
}
