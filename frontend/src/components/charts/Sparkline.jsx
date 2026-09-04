/**
 * Sparkline sin ejes: solo la forma de la serie. Se dibuja con viewBox fijo y
 * `preserveAspectRatio="none"`, con `vectorEffect` para que el trazo no se
 * deforme al estirarse.
 * @param {{ data: number[], height?: number, color?: string, area?: boolean }} props
 */
export default function Sparkline({ data, height = 34, color = 'var(--brand)', area = true }) {
  if (!data || data.length < 2) return <div style={{ height }} />;

  const W = 100;
  const H = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;

  const puntos = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return [x, y];
  });

  const linea = puntos.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const relleno = `${linea} L${W} ${H} L0 ${H} Z`;
  const id = `spark-${data.length}-${Math.round(min)}-${Math.round(max)}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={relleno} fill={`url(#${id})`} />}
      <path
        d={linea}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={puntos[puntos.length - 1][0]}
        cy={puntos[puntos.length - 1][1]}
        r="1.6"
        fill={color}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
