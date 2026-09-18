import { useCallback, useEffect, useRef, useState } from 'react';
import Card from '../ui/Card.jsx';
import { SkeletonBlock } from '../ui/Loading.jsx';
import Pill from '../ui/Pill.jsx';
import Grabador from './Grabador.jsx';
import {
  actualizarSesionNota, bajarAudioSesion, borrarSesionNota, crearSesionNota, getSesionNota,
  procesarSesionNota, refinarSesionNota, subirAudioSesion,
} from '../../data/api.js';
import { duracion, fechaCorta, fechaLarga } from '../../lib/setting.js';

const MODOS = [['grabar', 'Grabar'], ['subir', 'Subir audio'], ['texto', 'Pegar texto']];

/** Las notas se leen en párrafos: cada línea con "Título:" va en negrita. */
function Notas({ texto }) {
  return (
    <div className="notas-texto">
      {texto.split(/\n+/).filter((l) => l.trim()).map((linea, i) => {
        const m = linea.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,40}):\s*(.*)$/);
        return m ? <p key={i}><strong>{m[1]}:</strong> {m[2]}</p> : <p key={i} className={i === 0 ? 'notas-titulo' : ''}>{linea}</p>;
      })}
    </div>
  );
}

/** Una sesión abierta: audio, transcripción, notas y lo que se puede hacer con ella. */
function Sesion({ id, pitches, onCerrar, onCambio }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [verTranscripcion, setVerTranscripcion] = useState(false);
  const [pedido, setPedido] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');

  const cargar = useCallback(async (refrescar = true) => {
    try {
      const d = await getSesionNota(id, refrescar);
      setS(d);
      setError('');
      return d;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, [id]);

  useEffect(() => { cargar(false); }, [cargar]);
  // Mientras se transcribe o se redacta, se vuelve a mirar cada tres segundos.
  useEffect(() => {
    if (!s?.proceso || s.proceso === 'error') return undefined;
    const t = setInterval(async () => {
      const d = await cargar();
      if (d && (!d.proceso || d.proceso === 'error')) onCambio();
    }, 3000);
    return () => clearInterval(t);
  }, [s?.proceso, cargar, onCambio]);
  useEffect(() => {
    if (!s?.tieneAudio || audioUrl) return undefined;
    let url = '';
    bajarAudioSesion(id).then((u) => { url = u; setAudioUrl(u); }).catch(() => {});
    return () => url && URL.revokeObjectURL(url);
  }, [s?.tieneAudio, id, audioUrl]);

  const accion = async (fn, texto) => {
    setOcupado(true);
    setError('');
    try {
      await fn();
      await cargar();
      onCambio();
    } catch (e) {
      setError(e.message || texto);
    } finally {
      setOcupado(false);
    }
  };

  if (!s) return <div className="modal-backdrop" role="presentation"><div className="modal-card sesion-modal">{error ? <p className="dim">{error}</p> : <SkeletonBlock height={200} />}</div></div>;

  const pitch = pitches.find((p) => p.id === s.pitchId);
  const enProceso = s.proceso && s.proceso !== 'error';
  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card sesion-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Sesión">
        <header>
          <div>
            <h3>{s.contacto || pitch?.prospecto || 'Sin contacto'}</h3>
            <p className="dim">
              {s.tipo === 'dm' ? 'Conversación por DM' : 'Llamada'} · {fechaLarga(s.fecha)}
              {s.duracionSeg ? ` · ${duracion(s.duracionSeg)}` : ''}{s.diarizado === 'pistas' ? ' · dos pistas' : ''}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>

        <div className="sesion-campos">
          <label>Contacto<input defaultValue={s.contacto || ''} placeholder="Nombre, mail o usuario"
            onBlur={(e) => (e.target.value.trim() || null) !== (s.contacto || null) && accion(() => actualizarSesionNota(id, { contacto: e.target.value }))} /></label>
          <label>Fecha<input type="date" value={s.fecha} onChange={(e) => e.target.value && accion(() => actualizarSesionNota(id, { fecha: e.target.value }))} /></label>
          <label>Pitch<select value={s.pitchId || ''} onChange={(e) => accion(() => actualizarSesionNota(id, { pitchId: e.target.value || null }))}>
            <option value="">Sin asignar</option>
            {pitches.map((p) => <option key={p.id} value={p.id}>{p.prospecto} · {fechaCorta(p.pitchAt)}</option>)}
          </select></label>
        </div>

        {audioUrl && <audio className="sesion-audio" controls src={audioUrl} preload="metadata" />}

        {enProceso && (
          <p className="sesion-proceso"><span className="spinner" /> {s.proceso === 'transcribiendo' ? 'Transcribiendo el audio…' : 'Redactando las notas…'} Podés cerrar: sigue solo.</p>
        )}
        {s.proceso === 'error' && <p className="sesion-error">No se pudo: {s.procesoError}</p>}
        {error && <p className="sesion-error">{error}</p>}

        {s.resumen ? (
          <section className="sesion-notas">
            <div className="sesion-notas-cab">
              <h4>Notas del prospecto</h4>
              <span>
                <button type="button" className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(s.resumen)}>Copiar</button>
                <button type="button" className="btn ghost sm" onClick={() => { setBorrador(s.resumen); setEditando((v) => !v); }}>{editando ? 'Cancelar' : 'Editar'}</button>
              </span>
            </div>
            {editando ? (
              <>
                <textarea className="sesion-textarea" rows={14} value={borrador} onChange={(e) => setBorrador(e.target.value)} />
                <button type="button" className="btn primary sm" disabled={ocupado} onClick={() => accion(() => actualizarSesionNota(id, { resumen: borrador })).then(() => setEditando(false))}>Guardar</button>
              </>
            ) : <Notas texto={s.resumen} />}
            <form className="sesion-refinar" onSubmit={(e) => { e.preventDefault(); if (pedido.trim()) accion(() => refinarSesionNota(id, pedido)).then(() => setPedido('')); }}>
              <input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ajustar las notas: “resumí más el budget”, “agregá lo que dijo del socio”…" disabled={ocupado || enProceso} />
              <button type="submit" className="btn sm" disabled={ocupado || enProceso || !pedido.trim()}>{ocupado ? 'Ajustando…' : 'Ajustar'}</button>
            </form>
          </section>
        ) : !enProceso && (
          <div className="sesion-acciones">
            {s.tieneTranscripcion ? (
              <button type="button" className="btn primary sm" disabled={ocupado} onClick={() => accion(() => procesarSesionNota(id))}>Redactar las notas</button>
            ) : s.tieneAudio ? (
              <button type="button" className="btn primary sm" disabled={ocupado} onClick={() => accion(() => procesarSesionNota(id))}>Transcribir y redactar</button>
            ) : <span className="dim">Esta sesión no tiene audio ni texto.</span>}
          </div>
        )}

        {s.tieneTranscripcion && (
          <section className="sesion-transcripcion">
            <button type="button" className="btn ghost sm" onClick={() => setVerTranscripcion((v) => !v)}>
              {verTranscripcion ? 'Ocultar transcripción' : 'Ver transcripción'}
            </button>
            {verTranscripcion && (
              s.segmentos?.length ? (
                <div className="transcripcion">
                  {s.segmentos.map((seg, i) => (
                    <p key={i}>
                      <span className="dim num">{duracion(seg.inicio)}</span>
                      {seg.hablante && <span className="strong"> {seg.hablante}:</span>} {seg.texto}
                    </p>
                  ))}
                </div>
              ) : <div className="transcripcion"><p>{s.transcripcion}</p></div>
            )}
          </section>
        )}

        <footer className="sesion-pie">
          <span className="dim">{s.origen === 'texto' ? 'Texto pegado' : s.origen === 'subida' ? 'Audio subido' : 'Grabada acá'}{s.motor ? ` · ${s.motor}` : ''}</span>
          <button type="button" className="btn sm alerta" disabled={ocupado} onClick={() => window.confirm('¿Borrar esta sesión? El audio y las notas dejan de verse.') && borrarSesionNota(id).then(() => { onCambio(); onCerrar(); })}>Borrar</button>
        </footer>
      </div>
    </div>
  );
}

/**
 * La pestaña Notes: la librería de sesiones y la nueva sesión (grabar, subir, pegar).
 *
 * @param {{ sesiones: object[], motor: object, pitches: object[], hoy: string, cargando: boolean, onRecargar: () => void }} props
 */
export default function NotasSetting({ sesiones, motor, pitches, hoy, cargando, onRecargar }) {
  const [modo, setModo] = useState('grabar');
  const [contacto, setContacto] = useState('');
  const [pitchId, setPitchId] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [tipo, setTipo] = useState('call');
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [paso, setPaso] = useState('');
  const [error, setError] = useState('');
  const archivo = useRef(null);
  const [busqueda, setBusqueda] = useState('');

  const sinMotor = !motor?.transcripcion;
  const limpiar = () => { setContacto(''); setPitchId(''); setTexto(''); setFecha(hoy); };

  /** Crea la sesión, sube lo que haya y la manda a procesar. */
  const guardar = async ({ audio, audioMic, duracionSeg, textoPegado, nombre }) => {
    setError('');
    try {
      setPaso('Creando la sesión…');
      const s = await crearSesionNota({ contacto, pitchId: pitchId || null, fecha, tipo,
        origen: textoPegado ? 'texto' : audioMic || modo === 'grabar' ? 'grabacion' : 'subida', texto: textoPegado || '' });
      if (audio) {
        setPaso('Subiendo el audio…');
        await subirAudioSesion(s.id, audio, { nombre });
        if (audioMic) await subirAudioSesion(s.id, audioMic, { pista: 'mic' });
        if (duracionSeg) await actualizarSesionNota(s.id, { duracionSeg });
      }
      if (textoPegado || !sinMotor) {
        setPaso('Mandando a procesar…');
        await procesarSesionNota(s.id);
      }
      limpiar();
      onRecargar();
      setAbierta(s.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setPaso('');
    }
  };

  const filtradas = busqueda.trim()
    ? sesiones.filter((s) => `${s.contacto || ''} ${pitches.find((p) => p.id === s.pitchId)?.prospecto || ''}`.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : sesiones;

  return (
    <>
      <Card
        title="Nueva sesión"
        sub="Grabá la llamada, subí el audio o pegá la conversación: sale la transcripción y las notas para el closer"
        actions={(
          <div className="tabs sm">
            {MODOS.map(([v, l]) => <button key={v} type="button" className={`tab${modo === v ? ' active' : ''}`} onClick={() => setModo(v)}>{l}</button>)}
          </div>
        )}
        foot={sinMotor && modo !== 'texto'
          ? 'Todavía no hay motor de transcripción configurado: el audio se guarda igual y podés pegar el texto después. Ops tiene que cargar OPENAI_API_KEY o instalar faster-whisper.'
          : !motor?.notas ? 'Las notas las redacta Claude: hoy no está disponible en este servidor.' : ''}
      >
        <div className="sesion-campos nueva">
          <label>Contacto del prospecto<input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Nombre, mail o usuario" />
            <span className="dim">sin esto la grabación queda sin dueño hasta que se la asignes</span></label>
          <label>Pitch<select value={pitchId} onChange={(e) => setPitchId(e.target.value)}>
            <option value="">Sin asignar</option>
            {pitches.map((p) => <option key={p.id} value={p.id}>{p.prospecto} · {fechaCorta(p.pitchAt)}</option>)}
          </select></label>
          <label>Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
          <label>Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="call">Llamada</option><option value="dm">DMs</option></select></label>
        </div>
        {modo === 'grabar' && <Grabador deshabilitado={Boolean(paso)} onListo={({ audio, audioMic, duracion: d }) => guardar({ audio, audioMic, duracionSeg: d })} />}
        {modo === 'subir' && (
          <div className="subir-audio">
            <input ref={archivo} type="file" accept="audio/*,video/webm,.m4a,.mp3,.wav,.ogg" hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) guardar({ audio: f, nombre: f.name }); }} />
            <button type="button" className="btn primary" disabled={Boolean(paso)} onClick={() => archivo.current?.click()}>Elegir archivo de audio</button>
            <span className="dim">mp3, m4a, wav, webm u ogg. Una llamada de una hora pesa unos 30 MB.</span>
          </div>
        )}
        {modo === 'texto' && (
          <div className="pegar-texto">
            <textarea rows={7} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pegá acá la conversación de DMs o la transcripción que ya tengas" />
            <button type="button" className="btn primary" disabled={Boolean(paso) || !texto.trim()} onClick={() => guardar({ textoPegado: texto })}>Guardar y redactar notas</button>
          </div>
        )}
        {paso && <p className="dim sesion-proceso"><span className="spinner" /> {paso}</p>}
        {error && <p className="sesion-error">{error}</p>}
      </Card>

      <Card
        title={`Librería · ${sesiones.length}`}
        sub="Las sesiones guardadas, de la más nueva a la más vieja"
        actions={<input className="diag-busca" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por contacto" aria-label="Buscar" />}
        flush
      >
        {cargando && !sesiones.length ? <SkeletonBlock height={200} /> : filtradas.length === 0 ? (
          <div className="empty">Todavía no hay sesiones{busqueda ? ' con ese nombre' : ''}.</div>
        ) : (
          <div className="sesiones-lista">
            {filtradas.map((s) => {
              const pitch = pitches.find((p) => p.id === s.pitchId);
              return (
                <button key={s.id} type="button" className="sesion-item" onClick={() => setAbierta(s.id)}>
                  <span className="strong">{s.contacto || pitch?.prospecto || <span className="dim">Sin contacto</span>}</span>
                  <span className="dim">{s.tipo === 'dm' ? 'DM' : 'Call'} · {fechaCorta(s.fecha)}{s.duracionSeg ? ` · ${duracion(s.duracionSeg)}` : ''}</span>
                  <span className="sesion-estado">
                    {s.proceso && s.proceso !== 'error' && <Pill tone="info" dot>{s.proceso === 'transcribiendo' ? 'transcribiendo' : 'redactando'}</Pill>}
                    {s.proceso === 'error' && <Pill tone="alert" dot>falló</Pill>}
                    {s.tieneAudio && <Pill tone="plain">audio</Pill>}
                    {s.tieneTranscripcion && <Pill tone="plain">transcripción</Pill>}
                    {s.tieneResumen ? <Pill tone="ok">notas</Pill> : !s.proceso && <Pill tone="warn">sin notas</Pill>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {abierta != null && <Sesion id={abierta} pitches={pitches} onCerrar={() => setAbierta(null)} onCambio={onRecargar} />}
    </>
  );
}
