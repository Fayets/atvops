import { useLayoutEffect, useRef, useState } from 'react';
import Card from '../ui/Card.jsx';
import Modal from '../ui/Modal.jsx';
import Pill from '../ui/Pill.jsx';
import Spark from './Spark.jsx';
import {
  borrarClaseSerie, crearClaseRecurso, crearClaseSerie,
  editarClaseRecurso, editarClaseSerie, guardarClasesPagina, sembrarClases,
} from '../../data/api.js';

/**
 * Las clases de Juan, dentro de Recursos: lo que se ve en la raíz de recursos.atvos.io.
 *
 * Una serie es una llamada completa grabada en Fathom más los playbooks que salen de ella.
 * Acá no hay nada de Instagram: lo que se mide es solo lo que pasa en la página.
 */

const n = (v) => (v == null ? '—' : Number(v).toLocaleString('es-AR'));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const dos = (v) => String(v).padStart(2, '0');

// La página de verdad, en vivo. En local apunta al dev de atv-recursos-mkt.
const LANDING = window.location.hostname === 'localhost' ? 'http://localhost:5178' : 'https://recursos.atvos.io';
const ANCHOS = { pc: 1280, cel: 390 };

/** La landing adentro del panel: se ve lo que ve la gente, no una maqueta que se despega. */
function Prevista({ dispositivo, version }) {
  const caja = useRef(null);
  const [ancho, setAncho] = useState(0);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const w = ANCHOS[dispositivo];
  const alto = dispositivo === 'cel' ? 780 : 820;
  const escala = ancho ? Math.min(1, ancho / w) : 0;

  return (
    <div className="lnd-marco" ref={caja} style={{ height: escala ? alto * escala : 420 }}>
      {!!escala && (
        <iframe
          key={`${dispositivo}-${version}`}
          title="Así se ve la página de clases"
          src={LANDING}
          width={w}
          height={alto}
          style={{ transform: `scale(${escala})` }}
          loading="lazy"
        />
      )}
    </div>
  );
}

/** El panel de la derecha: la página en vivo, como en el editor del video. */
export function PrevistaClases({ version }) {
  const [dispositivo, setDispositivo] = useState('pc');
  return (
    <aside className="lnd-prev">
      <div className="lnd-prev-h">
        <b>Así se ve</b>
        <a className="dim" href={LANDING} target="_blank" rel="noreferrer">recursos.atvos.io</a>
        <div className="lnd-seg lnd-dev" role="tablist">
          <button type="button" role="tab" aria-selected={dispositivo === 'pc'} onClick={() => setDispositivo('pc')}>Compu</button>
          <button type="button" role="tab" aria-selected={dispositivo === 'cel'} onClick={() => setDispositivo('cel')}>Celular</button>
        </div>
      </div>
      <Prevista dispositivo={dispositivo} version={version} />
    </aside>
  );
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
      <form className="rec-form rec-editor" onSubmit={guardar}>
        <label className="campo">
          <span>Serie</span>
          <select value={f.serieId} onChange={set('serieId')}>
            {series.map((s) => <option key={s.id} value={s.id}>{dos(s.numero)} · {s.titulo}</option>)}
          </select>
        </label>
        {nuevo && (
          <label className="campo">
            <span>Qué es</span>
            <select value={f.tipo} onChange={set('tipo')}>
              <option value="llamada">La llamada completa</option>
              <option value="playbook">Un playbook</option>
            </select>
          </label>
        )}
        <label className="campo"><span>Título</span><input value={f.titulo} onChange={set('titulo')} required /></label>
        <label className="campo"><span>De qué va</span><textarea rows={3} value={f.descripcion} onChange={set('descripcion')} /></label>
        <label className="campo">
          <span>{f.tipo === 'llamada' ? 'Link de Fathom' : 'Link del PDF'}</span>
          <input value={f.url} onChange={set('url')} placeholder="https://" required />
        </label>
        {f.tipo === 'llamada'
          ? <label className="campo"><span>Minutos</span><input type="number" min="1" value={f.minutos} onChange={set('minutos')} /></label>
          : <label className="campo"><span>Páginas</span><input type="number" min="1" value={f.paginas} onChange={set('paginas')} /></label>}
        {error && <p className="rec-msg alert">{error}</p>}
        <div className="rec-acciones">
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
      <form className="rec-form rec-editor" onSubmit={guardar}>
        <label className="campo"><span>Título</span><input value={titulo} onChange={(e) => setTitulo(e.target.value)} required /></label>
        <label className="campo"><span>Número</span><input type="number" min="1" value={numero} onChange={(e) => setNumero(e.target.value)} /></label>
        {error && <p className="rec-msg alert">{error}</p>}
        <div className="rec-acciones">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

export function TextosClases({ pagina, onGuardado }) {
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
      <form className="rec-form" onSubmit={guardar}>
        <div className="rec-dos">
          <label className="campo"><span>Título</span><input value={f.titulo || ''} onChange={set('titulo')} /></label>
          <label className="campo"><span>Firma</span><input value={f.autor || ''} onChange={set('autor')} /></label>
        </div>
        <label className="campo">
          <span>Bajada · lo que va entre *asteriscos* sale resaltado</span>
          <textarea rows={3} value={f.bajada || ''} onChange={set('bajada')} />
        </label>
        <div className="rec-dos">
          <label className="campo"><span>Nota de las llamadas</span><input value={f.notaLlamadas || ''} onChange={set('notaLlamadas')} /></label>
          <label className="campo"><span>Nota de los playbooks</span><input value={f.notaPlaybooks || ''} onChange={set('notaPlaybooks')} /></label>
        </div>
        <div className="rec-dos">
          <label className="campo"><span>Nota de las horas</span><input value={f.notaContenido || ''} onChange={set('notaContenido')} /></label>
          <label className="campo"><span>Link del DM</span><input value={f.instagram || ''} onChange={set('instagram')} placeholder="https://ig.me/m/juanxcarrizo" /></label>
        </div>
        <label className="campo"><span>Título del cierre</span><input value={f.ctaTitulo || ''} onChange={set('ctaTitulo')} /></label>
        <label className="campo">
          <span>Texto del cierre · lo que va entre *asteriscos* sale resaltado</span>
          <textarea rows={3} value={f.ctaTexto || ''} onChange={set('ctaTexto')} />
        </label>
        <div className="rec-acciones">
          <span className="dim rec-msg">{estado}</span>
          <button type="submit" className="btn primary">Guardar</button>
        </div>
      </form>
    </Card>
  );
}

/** La pestaña: las series con sus recursos y, abajo, lo que dice la página. */
export function SeriesClases({ series, pagina, recargar, editando, setEditando, serieEditando, setSerieEditando }) {
  const simples = series.map((s) => ({ id: s.id, numero: s.numero, titulo: s.titulo }));

  const alternar = (r) => editarClaseRecurso(r.id, { activo: !r.activo }).then(recargar);
  const sembrar = () => sembrarClases().then(recargar);

  return (
    <>
      {!series.length && (
        <Card title="Todavía no hay series">
          <button type="button" className="btn primary" onClick={sembrar}>Cargar las seis series</button>
        </Card>
      )}

      {series.map((s) => (
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
              <thead><tr><th>Recurso</th><th>Qué es</th><th className="right">Clics</th><th /></tr></thead>
              <tbody>
                {s.recursos.map((r) => (
                  <tr key={r.id} className={r.activo && s.activa ? '' : 'rec-off'}>
                    <td><div className="rec-nombre"><b>{r.titulo}</b><span className="dim">{r.descripcion}</span></div></td>
                    <td>
                      <div className="rec-nombre">
                        {r.tipo === 'llamada' ? <Pill tone="info" dot>Llamada</Pill> : <Pill tone="plain">Playbook {dos(r.orden)}</Pill>}
                        <span className="dim">{r.minutos ? `${r.minutos} min` : r.paginas ? `${r.paginas} págs.` : ''}</span>
                      </div>
                    </td>
                    <td className="right num">{n(r.clics)}</td>
                    <td className="right">
                      <button type="button" className="btn ghost" onClick={() => alternar(r)}>{r.activo ? 'Ocultar' : 'Mostrar'}</button>
                      <button type="button" className="btn ghost" onClick={() => setEditando({ ...r, serieId: s.id })}>Editar</button>
                    </td>
                  </tr>
                ))}
                {!s.recursos.length && (
                  <tr>
                    <td colSpan={4} className="dim rec-vacio">
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

      {pagina && <TextosClases pagina={pagina} onGuardado={recargar} />}

      {editando && <EditorRecurso recurso={editando} series={simples} onClose={() => setEditando(null)} onGuardado={recargar} />}
      {serieEditando && <EditorSerie serie={serieEditando} onClose={() => setSerieEditando(null)} onGuardado={recargar} />}
    </>
  );
}

/** Lo que pasa en la página de clases: visitas y quién abre cada llamada y cada playbook. */
export function MetricasClases({ series, totales }) {
  const tot = totales || { visitas: 0, personas: 0, clics: 0, llamadas: 0, playbooks: 0 };
  const todos = series.flatMap((s) => s.recursos.map((r) => ({ ...r, padre: s }))).sort((a, b) => b.clics - a.clics);

  return (
    <>
      <section className="rec-kpis card">
        <div><span className="kpi-label">Entraron</span><span className="rec-v num">{n(tot.visitas)}</span><span className="dim">personas distintas por día</span></div>
        <div><span className="kpi-label">Abrieron algo</span><span className="rec-v num">{n(tot.personas)}</span><span className="dim">{pct(tot.personas, tot.visitas)} de los que entraron · {n(tot.clics)} clics</span></div>
        <div><span className="kpi-label">Llamadas</span><span className="rec-v num">{n(tot.llamadas)}</span><span className="dim">veces que abrieron una llamada</span></div>
        <div><span className="kpi-label">Playbooks</span><span className="rec-v num">{n(tot.playbooks)}</span><span className="dim">veces que abrieron un PDF</span></div>
      </section>

      <Card title="Qué abren" flush>
        <div className="rec-tabla">
          <table className="data">
            <thead><tr><th>Recurso</th><th>Serie</th><th>Qué es</th><th className="right">Clics</th><th>Por día</th></tr></thead>
            <tbody>
              {todos.map((r) => (
                <tr key={r.id}>
                  <td><div className="rec-nombre"><b>{r.titulo}</b></div></td>
                  <td className="dim">{dos(r.padre.numero)}</td>
                  <td className="dim">{r.tipo === 'llamada' ? 'Llamada' : `Playbook ${dos(r.orden)}`}</td>
                  <td className="right num">{n(r.clics)}</td>
                  <td><Spark serie={r.serie} /></td>
                </tr>
              ))}
              {!todos.length && <tr><td colSpan={5} className="dim rec-vacio">Todavía no hay series cargadas.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
