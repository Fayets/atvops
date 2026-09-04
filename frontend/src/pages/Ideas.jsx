import Card from '../components/ui/Card.jsx';
import IdeasBloque from '../components/home/IdeasBloque.jsx';
import { ErrorState, SkeletonBlock, SkeletonKpis } from '../components/ui/Loading.jsx';
import { useIdeas } from '../lib/useIdeas.jsx';

export default function Ideas() {
  const { ideas, loading, error } = useIdeas();
  const tareas = ideas.filter((i) => i.estado === 'tarea');
  const porPersona = ['Ale', 'Franco'].map((p) => ({ p, n: tareas.filter((t) => t.asignada === p).length }));

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} />
      </div>
    );
  }

  return (
    <div className="page">
      {loading ? (
        <>
          <SkeletonKpis n={4} />
          <SkeletonBlock height={320} />
        </>
      ) : (
        <>
          <div className="kpi-grid">
            <article className="kpi sm">
              <div className="kpi-label">Ideas abiertas</div>
              <div className="kpi-value-row">
                <span className="kpi-value num">{ideas.filter((i) => i.estado === 'idea').length}</span>
              </div>
            </article>
            {porPersona.map(({ p, n }) => (
              <article key={p} className="kpi sm">
                <div className="kpi-label">Tareas de {p}</div>
                <div className="kpi-value-row">
                  <span className="kpi-value num">{n}</span>
                </div>
              </article>
            ))}
            <article className="kpi sm">
              <div className="kpi-label">Hechas</div>
              <div className="kpi-value-row">
                <span className="kpi-value num">{ideas.filter((i) => i.estado === 'hecha').length}</span>
              </div>
            </article>
          </div>

          <Card title="Todas" sub="Las nuevas arriba · tildá para marcar hecha · asigná con un clic">
            <IdeasBloque />
          </Card>
        </>
      )}
    </div>
  );
}
