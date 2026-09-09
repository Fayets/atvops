/**
 * @param {{ tone?: 'ok' | 'warn' | 'alert' | 'off' | 'plain' | 'info', dot?: boolean,
 *           children: React.ReactNode, title?: string }} props
 */
export default function Pill({ tone = 'plain', dot = false, children, title }) {
  return (
    <span className={`pill ${tone}`} title={title}>
      {dot && <i className="dot" />}
      {children}
    </span>
  );
}
