/** La línea chiquita de los últimos días, al lado de un número. */
export default function Spark({ serie = [] }) {
  const w = 72, h = 22;
  const mx = Math.max(...serie, 1);
  const pts = serie.map((v, i) => [(i / Math.max(serie.length - 1, 1)) * w, h - 1.5 - (v / mx) * (h - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1] || [0, h];
  return (
    <svg className="rec-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h}Z`} fill="var(--s1)" fillOpacity="0.07" />
      <path d={d} fill="none" stroke="var(--s1)" strokeWidth="1.3" />
      <circle cx={lx} cy={ly} r="2" fill="var(--s1)" />
    </svg>
  );
}
