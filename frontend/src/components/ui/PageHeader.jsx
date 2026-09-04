/**
 * @param {{ eyebrow?: string, title: string, desc?: string, actions?: React.ReactNode }} props
 */
export default function PageHeader({ eyebrow, title, desc, actions }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}
