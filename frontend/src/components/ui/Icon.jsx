/**
 * Íconos de línea, 16px, trazo 1.5. Inline para no depender de una librería
 * y poder teñirlos con `currentColor`.
 */
const PATHS = {
  home: 'M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4h-5v4H4a1 1 0 0 1-1-1V9.5Z',
  calendario: 'M6 3.5v2M14 3.5v2M3.5 7.5h13M4.5 5h11a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 5h2v2H6.5v-2Zm4.5 0h2v2h-2v-2Z',
  clientes: 'M7.5 9a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Zm6 0a2.25 2.25 0 1 0 0-4.5M2.5 16v-.9C2.5 13 4.7 11.5 7.5 11.5s5 1.5 5 3.6v.9M14 11.7c2 .4 3.5 1.6 3.5 3.4v.9',
  ventas: 'M3 16.5h14M5 13.5V9m4 4.5V5m4 8.5v-6m4 6V3.5',
  marketing: 'M4 8.5v3a1 1 0 0 0 1 1h2l4.5 3.2a.6.6 0 0 0 .95-.5V4.8a.6.6 0 0 0-.95-.5L7 7.5H5a1 1 0 0 0-1 1Zm11 .2a2.6 2.6 0 0 1 0 2.6',
  onboarding: 'M6 10.5 8.8 13l5.2-6M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Z',
  sistemas: 'M4.5 5.5h11M4.5 10h11M4.5 14.5h11M7 3.8v3.4M13 8.3v3.4M7 12.8v3.4',
  alerta: 'M10 7.5v3.2m0 2.6v.2M8.6 3.6 2.9 13.4A1.4 1.4 0 0 0 4.1 15.5h11.8a1.4 1.4 0 0 0 1.2-2.1L11.4 3.6a1.6 1.6 0 0 0-2.8 0Z',
  arrow: 'M7.5 4.5 13 10l-5.5 5.5',
  up: 'M10 15.5v-11M5.5 9 10 4.5 14.5 9',
  down: 'M10 4.5v11M5.5 11l4.5 4.5L14.5 11',
  mas: 'M10 4.5v11M4.5 10h11',
  menos: 'M4.5 10h11',
  refresh: 'M15.5 8.5A5.75 5.75 0 0 0 5.2 6.4M4.5 11.5a5.75 5.75 0 0 0 10.3 2.1M4.2 4.2v2.8h2.8M15.8 15.8V13h-2.8',
  reloj: 'M10 6v4.2l2.6 1.6M10 2.8a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4Z',
  cobranza: 'M3 6.5h14v9H3zM3 9.5h14M6 13h2.5M12.5 5V3.5h-5V5',
  ideas: 'M7.5 15.5h5M8 13.5h4M10 3a4.6 4.6 0 0 0-2.6 8.4c.5.4.8 1 .8 1.6v.5h3.6v-.5c0-.6.3-1.2.8-1.6A4.6 4.6 0 0 0 10 3Z',
  check: 'M4.5 10.5 8.3 14l7.2-8',
  editar: 'M12.5 3.8 16.2 7.5M4 16l.8-3.2L13.3 4.3a1.4 1.4 0 0 1 2 0l.7.7a1.4 1.4 0 0 1 0 2L7.2 15.2 4 16Z',
  borrar: 'M7.5 4.5V3.2A1.2 1.2 0 0 1 8.7 2h2.6a1.2 1.2 0 0 1 1.2 1.2v1.3M4 5.5h12M6.2 5.5V16a1.2 1.2 0 0 0 1.2 1.2h5.2A1.2 1.2 0 0 0 13.8 16V5.5M8.5 8.5v5M11.5 8.5v5',
  config: 'M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM3.4 8.4l1.7-.4.5-1.2-1.1-1.4 1.6-1.6 1.4 1.1 1.2-.5.4-1.7h2.2l.4 1.7 1.2.5 1.4-1.1 1.6 1.6-1.1 1.4.5 1.2 1.7.4v2.2l-1.7.4-.5 1.2 1.1 1.4-1.6 1.6-1.4-1.1-1.2.5-.4 1.7H8.9l-.4-1.7-1.2-.5-1.4 1.1-1.6-1.6 1.1-1.4-.5-1.2-1.7-.4V8.4Z',
};

/**
 * @param {{ name: keyof typeof PATHS, size?: number, className?: string }} props
 */
export default function Icon({ name, size = 16, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
