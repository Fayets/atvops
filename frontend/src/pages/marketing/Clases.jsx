import { useMemo, useState } from 'react';
import Card from '../../components/ui/Card.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Pill from '../../components/ui/Pill.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { ErrorState, SkeletonBlock } from '../../components/ui/Loading.jsx';
import {
  borrarClaseRecurso, borrarClaseSerie, crearClaseRecurso, crearClaseSerie,
  editarClaseRecurso, editarClaseSerie, getClases, guardarClasesPagina, sembrarClases,
} from '../../data/api.js';
import { useResource } from '../../lib/hooks.js';
import '../../styles/recursos.css';

/**
 * Las clases de Juan: lo que se ve en recursos.atvos.io.
 *
 * Una serie es una llamada completa grabada en Fathom más los playbooks que salen de ella.
 * Acá no hay nada de Instagram: lo que se mide es solo lo que pasa en la página.
 */

const VISTAS = [{ value: 'series', label: 'Series' }, { value: 'metricas', label: 'Métricas' }, { value: 'textos', label: 'Textos' }];
const PERIODOS = [{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '90', label: '90 días' }];
const n = (v) => (v == null ? '—' : Number(v).toLocaleString('es-AR'));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const dos = (v) => String(v).padStart(2, '0');

function Spark({ serie }) {
  const w = 72, h = 22;
  const max = Math.max(1, ...(serie || []));
  const puntos = (serie || []).map((v, i) => `${(i / Math.max(1, serie.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(' ');
  return <svg className="rec-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true"><polyline points={puntos} /></svg>;
}

function EditorRecurso({ recurso, series, onClose, onGuardado }) {
  const nuevo = !recurso.id;
  const [f, setF] = useState({
    serieId: recurso.serieId ?? series[0]?.id,
    tipo: recurso.tipo || 'playbook',
    titulo: recurso.titulo || '',
    descripcion: recurso.descripcion || '',
    url: recurso.url || '',
    minutos: recurso.minutos || '',
    paginas: recurso.paginas || '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setError('');
    const datos = {
      titulo: f.titulo, descripcion: f.descripcion, url: f.url,
      minutos: f.tipo === 'llamada' ? Number(f.minutos) || null : null,
      paginas: f.tipo === 'playbook' ? Number(f.paginas) || null : null,
    };
    try {
      if (nuevo) await crearClaseRecurso({ ...datos, serieId: Number(f.serieId), tipo: f.tipo });
      else await editarClaseRecurso(recurso.id, { ...datos, serieId: Number(f.serieId) });
      onGuardado();
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal open title={nuevo ? 'Nuevo recurso' : recurso.titulo} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <label>
          <span>Serie</span>
          <select value={f.serieId} onChange={set('serieId')}>
            {series.map((s) => <option key={s.id} value={s.id}>{dos(s.numero)} · {s.titulo}</option>)}
          </select>
        </label>
        {nuevo && (
          <label>
            <span>Qué es</span>
            <select value={f.tipo} onChange={set('tipo')}>
              <option value="llamada">La llamada completa</option>
              <option value="playbook">Un playbook</option>
            </select>
          </label>
        )}
        <label><span>Título</span><input value={f.titulo} onChange={set('titulo')} required /></label>
        <label><span>De qué va</span><textarea rows={3} value={f.descripcion} onChange={set('descripcion')} /></label>
        <label>
          <span>{f.tipo === 'llamada' ? 'Link de Fathom' : 'Link del PDF'}</span>
          <input value={f.url} onChange={set('url')} placeholder="https://" required />
        </label>
        {f.tipo === 'llamada'
          ? <label><span>Minutos</span><input type="number" min="1" value={f.minutos} onChange={set('minutos')} /></label>
          : <label><span>Páginas</span><input type="number" min="1" value={f.paginas} onChange={set('paginas')} /></label>}
        {error && <p className="form-error">{error}</p>}
        <div className="form-acciones">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditorSerie({ serie, onClose, onGuardado }) {
  const nueva = !serie.id;
  const [titulo, setTitulo] = useState(serie.titulo || '');
  const [numero, setNumero] = useState(serie.numero || '');
  const [error, setError] = useState('');

  async function guardar(e) {
    e.preventDefault();
    setError('');
    try {
      if (nueva) await crearClaseSerie({ titulo, numero: Number(numero) || undefined });
      else await editarClaseSerie(serie.id, { titulo, numero: Number(numero) || undefined });
      onGuardado();
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar.');
    }
  }

  return (
    <Modal open title={nueva ? 'Nueva serie' : serie.titulo} onClose={onClose}>
      <form className="form" onSubmit={guardar}>
        <label><span>Título</span><input value={titulo} onChange={(e) => setTitulo(e.target.value)} required /></label>
        <label><span>Número</span><input type="number" min="1" value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="form-acciones">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function Textos({ pagina, onGuardado }) {
  const [f, setF] = useState(pagina);
  const [estado, setEstado] = useState('');
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setEstado('Guardando…');
    try {
      await guardarClasesPagina(f);
      setEstado('Guardado');
      onGuardado();
    } catch (err) {
      setEstado(err.message || 'No se pudo guardar.');
    }
  }

  return (
    <Card title="Lo que dice la página">
      <form className="form" onSubmit={guardar}>
        <label><span>Título</span><input value={f.titulo || ''} onChange={set('titulo')} /></label>
        <label><span>Firma</span><input value={f.autor || ''} onChange={set('autor')} /></label>
        <label>
          <span>Bajada</span>
          <textarea rows={3} value={f.bajada || ''} onChange={set('bajada')} />
          <small className="dim">Lo que va entre *asteriscos* sale resaltado.</small>
        </label>
        <label><span>Nota de las llamadas</span><input value={f.notaLlamadas || ''} onChange={set('notaLlamadas')} /></label>
        <label><span>Nota de los playbooks</span><input value={f.notaPlaybooks || ''} onChange={set('notaPlaybooks')} /></label>
        <label><span>Nota de las horas</span><input value={f.notaContenido || ''} onChange={set('notaContenido')} /></label>
        <label><span>Título del cierre</span><input value={f.ctaTitulo || ''} onChange={set('ctaTitulo')} /></label>
        <label>
          <span>Texto del cierre</span>
          <textarea rows={3} value={f.ctaTexto || ''} onChange={set('ctaTexto')} />
          <small className="dim">Lo que va entre *asteriscos* sale resaltado.</small>
        </label>
        <label><span>Link del DM</span><input value={f.instagram || ''} onChange={set('instagram')} placeholder="https://ig.me/m/juanxcarrizo" /></label>
        <div className="form-acciones">
          <span className="dim">{estado}</span>
          <button type="submit" className="btn primary">Guardar</button>
        </div>
      </form>
    </Card>
  );
}

export default function Clases() {
  const [vista, setVista] = useState('series');
  const [dias, setDias] = useState('30');
  const [version, setVersion] = useState(0);
  const { data, loading, error } = useResource(() => getClases(dias), [dias, version]);
  const [editando, setEditando] = useState(null);
  const [serieEditando, setSerieEditando] = useState(null);
  const recargar = () => setVersion((v) => v + 1);

  const series = useMemo(() => data?.series || [], [data]);
  const simples = useMemo(() => series.map((s) => ({ id: s.id, numero: s.numero, titulo: s.titulo })), [series]);
  const tot = data?.totales || { visitas: 0, clics: 0, llamadas: 0, playbooks: 0 };

  if (loading && !data) return <div className="page"><SkeletonBlock height={420} /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  async function alternar(r) {
    await editarClaseRecurso(r.id, { activo: !r.activo });
    recargar();
  }

  async function sembrar() {
    await sembrarClases();
    recargar();
  }

  return (
    <div className="page rec">
      <header className="page-head">
        <Tabs value={vista} onChange={setVista} options={VISTAS} />
        <div className="page-head-actions">
          {vista === 'metricas' && <Tabs value={dias} onChange={setDias} options={PERIODOS} />}
          {vista === 'series' && <button type="button" className="btn" onClick={() => setSerieEditando({})}>Nueva serie</button>}
          {vista === 'series' && !!series.length && (
            <button type="button" className="btn primary" onClick={() => setEditando({})}>Nuevo recurso</button>
          )}
        </div>
      </header>

      {!series.length && vista !== 'textos' && (
        <Card title="Todavía no hay series">
          <p className="dim">Se pueden cargar las seis con las que arrancó la página y después editarlas.</p>
          <button type="button" className="btn primary" onClick={sembrar}>Cargar las seis series</button>
        </Card>
      )}

      {vista === 'series' && series.map((s) => (
        <Card
          key={s.id}
          title={`${dos(s.numero)} · ${s.titulo}`}
          actions={(
            <>
              <button type="button" className="btn ghost" onClick={() => editarClaseSerie(s.id, { activa: !s.activa }).then(recargar)}>
                {s.activa ? 'Ocultar' : 'Mostrar'}
              </button>
              <button type="button" className="btn ghost" onClick={() => setSerieEditando(s)}>Editar</button>
            </>
          )}
          flush
        >
          <div className="rec-tabla">
            <table className="data">
              <thead><tr><th>Recurso</th><th>Qué es</th><th className="right">Dura</th><th className="right">Clics</th><th>Dónde</th><th /></tr></thead>
              <tbody>
                {s.recursos.map((r) => (
                  <tr key={r.id} className={r.activo && s.activa ? '' : 'rec-off'}>
                    <td><div className="rec-nombre"><b>{r.titulo}</b><span className="dim">{r.descripcion}</span></div></td>
                    <td>{r.tipo === 'llamada' ? <Pill tone="info" dot>Llamada</Pill> : <Pill tone="plain">Playbook {dos(r.orden)}</Pill>}</td>
                    <td className="right dim num">{r.minutos ? `${r.minutos} min` : r.paginas ? `${r.paginas} pág` : '—'}</td>
                    <td className="right num">{n(r.clics)}</td>
                    <td>{!s.activa ? <Pill tone="off">Serie oculta</Pill> : r.activo ? <Pill tone="plain">En la página</Pill> : <Pill tone="off">Oculto</Pill>}</td>
                    <td className="right">
                      <button type="button" className="btn ghost" onClick={() => alternar(r)}>{r.activo ? 'Ocultar' : 'Mostrar'}</button>
                      <button type="button" className="btn ghost" onClick={() => setEditando({ ...r, serieId: s.id })}>Editar</button>
                    </td>
                  </tr>
                ))}
                {!s.recursos.length && (
                  <tr>
                    <td colSpan={6} className="dim rec-vacio">
                      Serie vacía.
                      <button type="button" className="btn ghost" onClick={() => borrarClaseSerie(s.id).then(recargar)}>Borrarla</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {vista === 'metricas' && (<>
        <section className="rec-kpis card">
          <div><span className="kpi-label">Entraron</span><span className="rec-v num">{n(tot.visitas)}</span><span className="dim">personas distintas por día</span></div>
          <div><span className="kpi-label">Abrieron algo</span><span className="rec-v num">{n(tot.clics)}</span><span className="dim">{pct(tot.clics, tot.visitas)} de los que entraron</span></div>
          <div><span className="kpi-label">Llamadas</span><span className="rec-v num">{n(tot.llamadas)}</span><span className="dim">veces que abrieron una llamada</span></div>
          <div><span className="kpi-label">Playbooks</span><span className="rec-v num">{n(tot.playbooks)}</span><span className="dim">veces que abrieron un PDF</span></div>
        </section>

        <Card title="Qué abren" flush>
          <div className="rec-tabla">
            <table className="data">
              <thead><tr><th>Recurso</th><th>Serie</th><th>Qué es</th><th className="right">Clics</th><th>Por día</th></tr></thead>
              <tbody>
                {series.flatMap((s) => s.recursos.map((r) => ({ ...r, padre: s })))
                  .sort((a, b) => b.clics - a.clics)
                  .map((r) => (
                    <tr key={r.id}>
                      <td><div className="rec-nombre"><b>{r.titulo}</b></div></td>
                      <td className="dim">{dos(r.padre.numero)}</td>
                      <td className="dim">{r.tipo === 'llamada' ? 'Llamada' : `Playbook ${dos(r.orden)}`}</td>
                      <td className="right num">{n(r.clics)}</td>
                      <td><Spark serie={r.serie} /></td>
                    </tr>
                  ))}
                {!series.length && <tr><td colSpan={5} className="dim rec-vacio">Todavía no hay series cargadas.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </>)}

      {vista === 'textos' && data && <Textos pagina={data.pagina} onGuardado={recargar} />}

      {editando && <EditorRecurso recurso={editando} series={simples} onClose={() => setEditando(null)} onGuardado={recargar} />}
      {serieEditando && <EditorSerie serie={serieEditando} onClose={() => setSerieEditando(null)} onGuardado={recargar} />}
    </div>
  );
}
