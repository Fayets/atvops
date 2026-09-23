import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { borrarWebinar, duplicarWebinar, getWebinars } from '../data/api.js';
import { formatValue } from '../lib/format.js';
import { fasesDeWebinar } from '../lib/webinarFases.js';

const ESTADO = {
  borrador: { tone: 'off', label: 'borrador' },
  configurado: { tone: 'info', label: 'configurado' },
  en_vivo: { tone: 'ok', label: 'en vivo' },
  finalizado: { tone: 'warn', label: 'finalizado' },
};

const CTA = {
  call_funnel: 'Call funnel',
  checkout: 'Checkout directo',
  formulario: 'Formulario',
};

function fechaCorta(iso) {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/**
 * Listado / gestión de webinars. El embudo vive en el home `/webinars`.
 */
export default function WebinarsListado() {
  const navigate = useNavigate();
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  useEffect(() => {
    setCargando(true);
    getWebinars()
      .then((w) => { setLista(w); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setCargando(false));
  }, []);

  const duplicar = async (id) => {
    setOcupado(id);
    try {
      const nuevo = await duplicarWebinar(id);
      navigate(`/webinars/${nuevo.id}`);
    } catch (e) {
      window.alert(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const borrar = async (id, nombre) => {
    if (!window.confirm(`¿Borrar “${nombre}”? Se esconde del listado.`)) return;
    setOcupado(id);
    try {
      await borrarWebinar(id);
      setLista((l) => l.filter((w) => w.id !== id));
    } catch (e) {
      window.alert(e.message);
    } finally {
      setOcupado(null);
    }
  };

  if (error) {
    return <div className="page"><ErrorState error={error} /></div>;
  }

  return (
    <div className="page">
      <PageHeader
        title="Listado de webinars"
        actions={(
          <div className="webinar-head-actions">
            <Link to="/webinars" className="btn ghost">← Embudo</Link>
            <Link to="/webinars/nuevo" className="btn primary">+ Crear webinar</Link>
          </div>
        )}
      />

      {cargando ? <SkeletonBlock height={280} /> : lista.length === 0 ? (
        <Card>
          <div className="empty webinars-vacio">
            <p>Todavía no hay webinars.</p>
            <Link to="/webinars/nuevo" className="btn primary">Crear el primero</Link>
          </div>
        </Card>
      ) : (
        <div className="webinars-grid">
          {lista.map((w) => {
            const est = ESTADO[w.estado] || ESTADO.borrador;
            const fases = (w.fases?.length === 3)
              ? w.fases
              : fasesDeWebinar(w.metricas || {}, { benchmarks: w.benchmarks });
            return (
              <article key={w.id} className="webinar-card">
                <header className="webinar-card-head">
                  <div>
                    <Link to={`/webinars/${w.id}`} className="webinar-nombre">{w.nombre}</Link>
                    {w.tema ? <p className="webinar-tema dim">{w.tema}</p> : null}
                  </div>
                  <Pill tone={est.tone} dot>{est.label}</Pill>
                </header>
                <div className="webinar-meta">
                  <span>{fechaCorta(w.fechaHora)}</span>
                  <span>{CTA[w.ctaTipo] || w.ctaTipo}</span>
                </div>
                <div className="webinar-kpis webinar-kpis-fases">
                  {fases.map((f) => {
                    const valor = f.portadaValor ?? f.portada?.valor;
                    const formato = f.portadaFormato || f.portada?.formato || 'count';
                    const label = f.portadaLabel || f.portada?.label || f.titulo;
                    const texto = valor == null
                      ? '—'
                      : formato === 'pct'
                        ? `${valor}%`
                        : formatValue(valor, formato === 'usd' ? 'usd' : 'count');
                    return (
                      <div key={f.id} className={`sem-${f.semaforo || 'off'}`}>
                        <span className="webinar-semaforo mini" />
                        <span className="num">{texto}</span>
                        <span className="dim">{label}</span>
                      </div>
                    );
                  })}
                </div>
                <footer className="webinar-card-foot">
                  <Link to={`/webinars/${w.id}`} className="btn sm">Configurar</Link>
                  <Link
                    to="/webinars"
                    className="btn ghost sm"
                    onClick={() => localStorage.setItem('atv.webinar.activo', String(w.id))}
                  >
                    Ver embudo
                  </Link>
                  <button type="button" className="btn ghost sm" disabled={ocupado === w.id}
                    onClick={() => duplicar(w.id)}>Duplicar</button>
                  <button type="button" className="btn ghost sm peligro" disabled={ocupado === w.id}
                    onClick={() => borrar(w.id, w.nombre)}>Borrar</button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
