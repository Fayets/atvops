import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorState, SkeletonBlock } from '../ui/Loading.jsx';
import { getRecursosContenido, getRecursosLanding, guardarRecursosLanding } from '../../data/api.js';
import { useResource } from '../../lib/hooks.js';

/**
 * El editor de recursos.atvos.io: qué se ve (un video de YouTube, un reel, una secuencia
 * de historias o un link de Loom/Vimeo), qué dice y qué recurso se lleva. A la derecha, la
 * landing como la va a ver la gente, en vivo.
 */

const LANDING = 'https://recursos.atvos.io';
const FUENTES = [['youtube', 'YouTube'], ['reel', 'Reels'], ['secuencia', 'Secuencias'], ['link', 'Loom o Vimeo']];
const dur = (s) => { const n = Number(s) || 0; return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const fd = (iso) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}` : '');
const num = (v) => (v == null ? '' : Number(v).toLocaleString('es-AR'));
const BAJADA = {
  regalo: '**Mirá el video completo** y llevate el recurso para armar tu propio proceso.',
  whatsapp: '**Mirá el video completo** y pedime el recurso por WhatsApp.',
};
const BOTON = { regalo: 'Descargar recursos', whatsapp: 'Pedir el recurso por WhatsApp' };

// La vista previa usa la letra de la landing. Se carga una vez, solo en esta pantalla.
function usePoppins() {
  useEffect(() => {
    if (document.getElementById('poppins-landing')) return;
    const l = document.createElement('link');
    l.id = 'poppins-landing';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap';
    document.head.appendChild(l);
  }, []);
}

function partes(texto, marca) {
  const re = marca === '**' ? /(\*\*[^*]+\*\*)/ : /(\*[^*]+\*)/;
  return String(texto || '').split(re).filter(Boolean).map((p, i) => {
    const n = marca.length;
    return p.startsWith(marca) && p.endsWith(marca) && p.length > n * 2
      ? (marca === '**' ? <b key={i}>{p.slice(n, -n)}</b> : <em key={i}>{p.slice(n, -n)}</em>)
      : <span key={i}>{p}</span>;
  });
}

function Elegir({ fuente, contenido, sel, onSel }) {
  if (fuente === 'youtube') {
    return (
      <div className="lnd-picks yt">
        {contenido.youtube.map((v) => (
          <button key={v.id} type="button" className="lnd-pick" aria-pressed={sel === v.id} onClick={() => onSel(v.id, v)}>
            <span className="lnd-im">{v.imagen && <img src={v.imagen} alt="" loading="lazy" />}<span className="lnd-badge">{dur(v.duracion)}</span></span>
            <span className="lnd-t">{v.titulo}</span>
            <span className="lnd-m">{fd(v.fecha)}{v.vistas != null && ` · ${num(v.vistas)} vistas`}</span>
          </button>
        ))}
      </div>
    );
  }
  if (fuente === 'reel') {
    return (
      <div className="lnd-picks reel">
        {contenido.reels.map((v) => (
          <button key={v.id} type="button" className="lnd-pick" aria-pressed={sel === v.id} onClick={() => onSel(v.id, v)} title={v.caption}>
            <span className="lnd-im">{v.imagen && <img src={v.imagen} alt="" loading="lazy" />}{v.palabra && <span className="lnd-kw">{v.palabra}</span>}</span>
            <span className="lnd-m">{fd(v.fecha)}{v.vistas != null && ` · ${num(v.vistas)}`}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="lnd-picks sec">
      {contenido.secuencias.map((s) => {
        const videos = s.historias.filter((h) => h.video).length;
        return (
          <button key={s.fecha} type="button" className="lnd-pick" aria-pressed={sel === s.fecha} onClick={() => onSel(s.fecha, s)}>
            <span className="lnd-tira">{s.historias.slice(0, 4).map((h) => (h.imagen ? <img key={h.id} src={h.imagen} alt="" loading="lazy" /> : <i key={h.id} />))}</span>
            <span className="lnd-t">Historias del {fd(s.fecha)}</span>
            <span className="lnd-m">{s.historias.length} historias{videos ? ` · ${videos} con video` : ''}</span>
          </button>
        );
      })}
      {!contenido.secuencias.length && <p className="dim">No hay historias de los últimos 45 días.</p>}
    </div>
  );
}

function Historias({ historias }) {
  const [i, setI] = useState(0);
  const n = historias.length;
  const h = historias[Math.min(i, n - 1)];
  if (!h) return null;
  return (
    <>
      <div className="lnd-bars">{historias.map((x, k) => <i key={x.id} className={k <= i ? 'on' : ''} />)}</div>
      {h.video ? <video key={h.id} src={h.video} poster={h.imagen || undefined} autoPlay muted loop playsInline /> : h.imagen && <img src={h.imagen} alt="" />}
      <div className="lnd-tap">
        <button type="button" aria-label="Historia anterior" onClick={() => setI((i - 1 + n) % n)} />
        <button type="button" aria-label="Historia siguiente" onClick={() => setI((i + 1) % n)} />
      </div>
    </>
  );
}

function Prevista({ f, media, dispositivo }) {
  const DL = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" /></svg>;
  const WA = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z" /></svg>;
  const vertical = f.mediaTipo === 'reel' || f.mediaTipo === 'secuencia';
  return (
    <div className={`lnd-screen${dispositivo === 'cel' ? ' cel' : ''}`}>
      <div className="lnd-top"><span>ATV — Aumenta tu valor</span><span>Por Juan Carrizo · @juanxcarrizo</span></div>
      <div className="lnd-hero">
        {f.etiqueta && <span className="lnd-pill">{f.etiqueta}</span>}
        <h3 className="lnd-h1">{partes(f.titular, '*')}</h3>
        {f.bajada && <p className="lnd-sub">{partes(f.bajada, '**')}</p>}
        <div className={`lnd-media ${vertical ? 'v' : 'h'}`}>
          {f.mediaTipo === 'secuencia' && media?.historias ? <Historias key={media.fecha} historias={media.historias} /> : (
            <>
              {media?.imagen ? <img src={media.imagen} alt="" /> : <span className="lnd-gen">{f.mediaTipo === 'link' ? 'Video de Loom o Vimeo' : 'Elegí un video'}</span>}
              {f.mediaTipo === 'reel' && <span className="lnd-ig">Reel</span>}
              <span className="lnd-play" />
              {f.duracion && f.mediaTipo !== 'reel' && <span className="lnd-dur">{f.duracion}</span>}
            </>
          )}
        </div>
        <span className={`lnd-cta${f.entrega === 'whatsapp' ? ' wa' : ''}`}>{f.entrega === 'whatsapp' ? WA : DL}{f.boton}</span>
        <span className="lnd-mas">Ver todos los recursos →</span>
      </div>
    </div>
  );
}

export default function EditorLanding({ recursos, onPublicado }) {
  usePoppins();
  const contenido = useResource(() => getRecursosContenido(), []);
  const actual = useResource(() => getRecursosLanding(), []);
  if (contenido.error || actual.error) return <ErrorState error={contenido.error || actual.error} />;
  if (!contenido.data || !actual.data) return <SkeletonBlock height={520} />;
  if (!recursos.length) return <p className="dim lnd-vacio">Todavía no hay recursos: aparecen solos cuando alguien comenta la palabra de un reel, o cargá uno con Nuevo recurso.</p>;
  return <Formulario contenido={contenido.data} inicial={actual.data} recursos={recursos} onPublicado={onPublicado} />;
}

function Formulario({ contenido, inicial, recursos, onPublicado }) {
  const destacado = recursos.find((r) => r.destacado);
  const arranque = () => {
    const r = recursos.find((x) => x.id === inicial.recursoId) || destacado || recursos[0];
    const entrega = r?.entrega || 'whatsapp';
    const tipo = inicial.mediaTipo === 'loom' || inicial.mediaTipo === 'vimeo' ? 'link' : (inicial.mediaTipo || 'youtube');
    return {
      recursoId: r?.id ?? '', entrega, link: r?.link || '',
      mediaTipo: inicial.mediaId ? tipo : 'youtube',
      mediaId: inicial.mediaId || contenido.youtube[0]?.id || '',
      etiqueta: inicial.etiqueta ?? 'Video + recurso',
      titular: inicial.titular || r?.titular || r?.titulo || '',
      bajada: inicial.bajada ?? BAJADA[entrega],
      boton: inicial.boton ?? BOTON[entrega],
      duracion: inicial.duracion || '',
    };
  };
  const [f, setF] = useState(arranque);
  const [elegidos, setElegidos] = useState(() => ({ [f.mediaTipo]: f.mediaId }));
  const [dispositivo, setDispositivo] = useState('pc');
  const [estado, setEstado] = useState({ ocupado: false, error: '', ok: '' });
  const titRef = useRef(null);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setEstado((e) => ({ ...e, ok: '' })); };

  const media = useMemo(() => {
    if (f.mediaTipo === 'youtube') { const v = contenido.youtube.find((x) => x.id === f.mediaId); return v && { imagen: v.imagen }; }
    if (f.mediaTipo === 'reel') { const v = contenido.reels.find((x) => x.id === f.mediaId); return v && { imagen: v.imagen }; }
    if (f.mediaTipo === 'secuencia') { const s = contenido.secuencias.find((x) => x.fecha === f.mediaId); return s && { fecha: s.fecha, historias: s.historias }; }
    return null;
  }, [f.mediaTipo, f.mediaId, contenido]);

  const elegidoTxt = (() => {
    if (f.mediaTipo === 'youtube') return contenido.youtube.find((x) => x.id === f.mediaId)?.titulo;
    if (f.mediaTipo === 'reel') { const v = contenido.reels.find((x) => x.id === f.mediaId); return v && `Reel del ${fd(v.fecha)}`; }
    if (f.mediaTipo === 'secuencia') { const s = contenido.secuencias.find((x) => x.fecha === f.mediaId); return s && `Historias del ${fd(s.fecha)} · ${s.historias.length}`; }
    return f.mediaId;
  })();

  function cambiarFuente(tipo) {
    setElegidos((e) => ({ ...e, [f.mediaTipo]: f.mediaId }));
    const previo = elegidos[tipo];
    const porDefecto = tipo === 'youtube' ? contenido.youtube[0]?.id : tipo === 'reel' ? contenido.reels[0]?.id
      : tipo === 'secuencia' ? contenido.secuencias[0]?.fecha : '';
    setF((x) => ({ ...x, mediaTipo: tipo, mediaId: previo ?? porDefecto ?? '' }));
  }

  function elegir(id, item) {
    setF((x) => ({ ...x, mediaId: id, duracion: f.mediaTipo === 'youtube' && item?.duracion ? dur(item.duracion) : x.duracion }));
    setEstado((e) => ({ ...e, ok: '' }));
  }

  function cambiarEntrega(entrega) {
    // Si el texto era el de fábrica, acompaña el cambio; si marketing lo escribió, se respeta.
    setF((x) => ({
      ...x, entrega,
      bajada: x.bajada === BAJADA[x.entrega] ? BAJADA[entrega] : x.bajada,
      boton: x.boton === BOTON[x.entrega] ? BOTON[entrega] : x.boton,
    }));
  }

  function cambiarRecurso(id) {
    const r = recursos.find((x) => x.id === Number(id));
    setF((x) => ({ ...x, recursoId: Number(id), link: r?.link || '', entrega: r?.entrega || x.entrega }));
  }

  function pasarARojo() {
    const el = titRef.current;
    if (!el) return;
    const a = el.selectionStart, z = el.selectionEnd;
    if (a === z) return;
    const t = f.titular;
    const limpio = (s) => s.replace(/\*/g, '');
    set('titular', `${limpio(t.slice(0, a))}*${limpio(t.slice(a, z)).trim()}*${limpio(t.slice(z))}`);
  }

  async function publicar() {
    setEstado({ ocupado: true, error: '', ok: '' });
    try {
      await guardarRecursosLanding({ ...f, mediaTipo: f.mediaTipo === 'link' ? 'loom' : f.mediaTipo });
      setEstado({ ocupado: false, error: '', ok: 'Publicado. La landing ya muestra esto.' });
      onPublicado?.();
    } catch (err) {
      setEstado({ ocupado: false, error: err.message, ok: '' });
    }
  }

  const recurso = recursos.find((r) => r.id === Number(f.recursoId));
  return (
    <div className="lnd-grid">
      <div className="lnd-col">
        <section className="card">
          <header className="card-head lnd-head"><span className="lnd-paso">1</span><h3>Qué se ve</h3><span className="lnd-elegido">{elegidoTxt}</span></header>
          <div className="card-body lnd-body">
            <div className="lnd-seg" role="tablist">
              {FUENTES.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={f.mediaTipo === k} onClick={() => cambiarFuente(k)}>
                  {label}
                  {k === 'youtube' && <span>{contenido.youtube.length}</span>}
                  {k === 'reel' && <span>{contenido.reels.length}</span>}
                  {k === 'secuencia' && <span>{contenido.secuencias.length}</span>}
                </button>
              ))}
            </div>
            {f.mediaTipo === 'link' ? (
              <label className="campo"><span>Link del video</span>
                <input value={f.mediaId} onChange={(e) => set('mediaId', e.target.value)} placeholder="loom.com/share/… o vimeo.com/…" />
              </label>
            ) : (
              <Elegir fuente={f.mediaTipo} contenido={contenido} sel={f.mediaId} onSel={elegir} />
            )}
          </div>
        </section>

        <section className="card">
          <header className="card-head lnd-head"><span className="lnd-paso">2</span><h3>Qué dice</h3></header>
          <div className="card-body lnd-body">
            <label className="campo"><span>Etiqueta</span><input value={f.etiqueta} onChange={(e) => set('etiqueta', e.target.value)} /></label>
            <div className="campo">
              <span className="lnd-titbar">Titular
                <button type="button" className="lnd-rojo" onMouseDown={(e) => e.preventDefault()} onClick={pasarARojo}>Pasar a rojo</button>
              </span>
              <textarea ref={titRef} rows={2} value={f.titular} onChange={(e) => set('titular', e.target.value)} aria-label="Titular" />
            </div>
            <label className="campo"><span>Bajada</span><textarea rows={2} value={f.bajada} onChange={(e) => set('bajada', e.target.value)} /></label>
            <div className="lnd-dos">
              <label className="campo"><span>Texto del botón</span><input value={f.boton} onChange={(e) => set('boton', e.target.value)} /></label>
              <label className="campo"><span>Duración</span><input value={f.duracion} onChange={(e) => set('duracion', e.target.value)} placeholder="23:18" /></label>
            </div>
          </div>
        </section>

        <section className="card">
          <header className="card-head lnd-head"><span className="lnd-paso">3</span><h3>Qué se lleva</h3>
            <span className="lnd-elegido">{recurso && `${recurso.palabra} · ${f.entrega === 'regalo' ? 'se descarga' : 'por WhatsApp'}`}</span>
          </header>
          <div className="card-body lnd-body">
            <label className="campo"><span>Recurso</span>
              <select value={f.recursoId} onChange={(e) => cambiarRecurso(e.target.value)}>
                {recursos.map((r) => <option key={r.id} value={r.id}>{r.palabra} · {r.titulo}</option>)}
              </select>
            </label>
            <div className="campo"><span>Entrega</span>
              <div className="rec-toggle" role="group" aria-label="Entrega">
                <button type="button" aria-pressed={f.entrega === 'regalo'} onClick={() => cambiarEntrega('regalo')}>Se descarga directo</button>
                <button type="button" aria-pressed={f.entrega !== 'regalo'} onClick={() => cambiarEntrega('whatsapp')}>Se pide por WhatsApp</button>
              </div>
            </div>
            {f.entrega === 'regalo' && (
              <label className="campo"><span>Link del documento</span><input value={f.link} onChange={(e) => set('link', e.target.value)} placeholder="docs.google.com/document/d/…/copy" /></label>
            )}
          </div>
        </section>

        <div className="lnd-acciones">
          <button type="button" className="btn primary" onClick={publicar} disabled={estado.ocupado}>{estado.ocupado ? 'Publicando…' : 'Publicar en la landing'}</button>
          <button type="button" className="btn ghost" onClick={() => { setF(arranque()); setEstado({ ocupado: false, error: '', ok: '' }); }}>Descartar cambios</button>
          {estado.error && <span className="rec-msg alert">{estado.error}</span>}
          {estado.ok && <span className="rec-msg ok">{estado.ok} <a href={LANDING} target="_blank" rel="noreferrer">Abrir</a></span>}
        </div>
      </div>

      <aside className="lnd-prev">
        <div className="lnd-prev-h">
          <b>Así se ve</b><span className="dim">recursos.atvos.io</span>
          <div className="lnd-seg lnd-dev" role="tablist">
            <button type="button" role="tab" aria-selected={dispositivo === 'pc'} onClick={() => setDispositivo('pc')}>Compu</button>
            <button type="button" role="tab" aria-selected={dispositivo === 'cel'} onClick={() => setDispositivo('cel')}>Celular</button>
          </div>
        </div>
        <Prevista f={f} media={media} dispositivo={dispositivo} />
      </aside>
    </div>
  );
}
