import { useCallback, useEffect, useState } from 'react';
import {
  actualizarSesionNota, bajarAudioSesion, borrarSesionNota, getSesionNota, procesarSesionNota, refinarSesionNota,
} from '../../data/api.js';
import { CANAL_PILL, LLAMADA_ESTADO, PITCH_ESTADO, diaMes, diaSemana, duracion } from '../../lib/setting.js';

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

/**
 * Una sesión de la librería: el audio, las notas y todo lo que se puede hacer con ella.
 *
 * Se abre en el lugar y no en un modal a propósito: el setter escucha un pedazo, lee las
 * notas y pasa a la siguiente sin perder dónde estaba.
 */
export default function SesionItem({ sesion, pitches, onCambio }) {
  const [s, setS] = useState(sesion);
  const [panel, setPanel] = useState('');       // notas | transcripcion | editar | lead
  const [audioUrl, setAudioUrl] = useState('');
  const [borrador, setBorrador] = useState('');
  const [pedido, setPedido] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [traerAudio, setTraerAudio] = useState(false);

  const pitch = pitches.find((p) => p.id === s.pitchId);
  const estado = pitch
    ? (pitch.pitchEstado === 'booked' ? LLAMADA_ESTADO[pitch.llamadaEstado || 'scheduled'] : PITCH_ESTADO[pitch.pitchEstado])
    : null;

  const cargar = useCallback(async (refrescar = true) => {
    const d = await getSesionNota(s.id, refrescar);
    setS(d);
    return d;
  }, [s.id]);

  // Mientras transcribe o redacta, se vuelve a mirar cada tres segundos.
  useEffect(() => {
    if (!s.proceso || s.proceso === 'error') return undefined;
    const t = setInterval(async () => {
      const d = await cargar().catch(() => null);
      if (d && (!d.proceso || d.proceso === 'error')) onCambio();
    }, 3000);
    return () => clearInterval(t);
  }, [s.proceso, cargar, onCambio]);

  // El audio se baja recién cuando se pide: la librería tiene decenas de llamadas y
  // traerlas todas al abrirla serían cientos de megas por nada.
  useEffect(() => {
    if (!traerAudio || !s.tieneAudio) return undefined;
    let url = '';
    let vivo = true;
    bajarAudioSesion(s.id)
      .then((u) => {
        // Si la tarjeta ya se fue, el blob se tira: si no, queda ocupando memoria.
        if (!vivo) return URL.revokeObjectURL(u);
        url = u;
        return setAudioUrl(u);
      })
      .catch(() => {});
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [traerAudio, s.tieneAudio, s.id]);

  const accion = async (fn) => {
    setOcupado(true);
    setError('');
    try {
      await fn();
      await cargar();
      onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const abrirNotas = async () => {
    if (panel === 'notas') return setPanel('');
    if (!s.resumen) await cargar(false).catch(() => {});
    return setPanel('notas');
  };
  const enProceso = s.proceso && s.proceso !== 'error';

  return (
    <article className="sesion-card">
      <header>
        <span className="sesion-quien">
          <span className="sesion-nombre">{s.contacto || pitch?.prospecto || 'Sin identificar'}</span>
          {estado ? (
            <>
              <span className={`pill-estado tono-${estado.tone}`}>{estado.label}</span>
              <span className="pill-canal">{CANAL_PILL[pitch.canal]}</span>
            </>
          ) : <span className="pill-estado tono-off">no se encontró match</span>}
        </span>
        <span className="sesion-cuando">
          <span className="sesion-dia">{diaSemana(s.fecha)}</span>
          <span className="sesion-fecha">{diaMes(s.fecha)}</span>
          {s.duracionSeg ? <span className="sesion-dur">{duracion(s.duracionSeg)}</span> : null}
        </span>
      </header>

      {s.tieneAudio && (audioUrl ? (
        <audio className="sesion-audio" controls autoPlay src={audioUrl} preload="metadata" />
      ) : (
        <button type="button" className="sesion-play" disabled={traerAudio} onClick={() => setTraerAudio(true)}>
          <span className="sesion-play-icono">▶</span>
          {traerAudio ? 'Cargando el audio…' : `Escuchar${s.duracionSeg ? ` · ${duracion(s.duracionSeg)}` : ''}`}
        </button>
      ))}

      {enProceso && (
        <p className="sesion-proceso"><span className="spinner" />
          {s.proceso === 'transcribiendo' ? 'Transcribiendo el audio…' : 'Redactando las notas…'} Sigue solo aunque cierres.
        </p>
      )}
      {s.proceso === 'error' && <p className="sesion-error">No se pudo: {s.procesoError}</p>}
      {error && <p className="sesion-error">{error}</p>}

      <div className="sesion-acciones">
        {s.tieneResumen && (
          <button type="button" className="btn ghost sm" onClick={abrirNotas}>
            {panel === 'notas' ? 'Ocultar notas' : 'Leer las notas'}
          </button>
        )}
        {s.tieneResumen && (
          <button type="button" className="btn ghost sm" onClick={async () => {
            if (panel === 'editar') return setPanel('');
            const d = s.resumen ? s : await cargar(false);
            setBorrador(d.resumen || '');
            return setPanel('editar');
          }}>Editar nota</button>
        )}
        {s.tieneTranscripcion && (
          <button type="button" className="btn ghost sm" onClick={async () => {
            if (panel === 'transcripcion') return setPanel('');
            if (!s.transcripcion) await cargar(false).catch(() => {});
            return setPanel('transcripcion');
          }}>Ver transcripción</button>
        )}
        {!enProceso && (s.tieneTranscripcion || s.tieneAudio) && (
          <button type="button" className="btn ghost sm" disabled={ocupado}
            onClick={() => accion(() => procesarSesionNota(s.id))}>
            {s.tieneResumen ? 'Rehacer notas' : s.tieneTranscripcion ? 'Redactar notas' : 'Transcribir y redactar'}
          </button>
        )}
        {s.tieneResumen && (
          <button type="button" className="btn ghost sm"
            onClick={async () => navigator.clipboard?.writeText((s.resumen ? s : await cargar(false)).resumen || '')}>
            Copiar
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={() => setPanel(panel === 'lead' ? '' : 'lead')}>
          {pitch ? 'Cambiar lead' : 'Asignar a un lead'}
        </button>
        <button type="button" className="btn ghost sm peligro" disabled={ocupado}
          onClick={() => window.confirm('¿Borrar esta sesión? El audio y las notas dejan de verse.')
            && borrarSesionNota(s.id).then(onCambio)}>
          Borrar
        </button>
      </div>

      {panel === 'lead' && (
        <div className="sesion-campos">
          <label>Contacto<input defaultValue={s.contacto || ''} placeholder="Nombre, mail o usuario"
            onBlur={(e) => (e.target.value.trim() || null) !== (s.contacto || null)
              && accion(() => actualizarSesionNota(s.id, { contacto: e.target.value }))} /></label>
          <label>Lead<select value={s.pitchId || ''}
            onChange={(e) => accion(() => actualizarSesionNota(s.id, { pitchId: e.target.value || null }))}>
            <option value="">Sin asignar</option>
            {pitches.map((p) => <option key={p.id} value={p.id}>{p.prospecto} · {diaMes(p.pitchAt)}</option>)}
          </select></label>
          <label>Fecha<input type="date" value={s.fecha}
            onChange={(e) => e.target.value && accion(() => actualizarSesionNota(s.id, { fecha: e.target.value }))} /></label>
        </div>
      )}

      {panel === 'notas' && s.resumen && (
        <>
          <Notas texto={s.resumen} />
          <form className="sesion-refinar" onSubmit={(e) => {
            e.preventDefault();
            if (pedido.trim()) accion(() => refinarSesionNota(s.id, pedido)).then(() => setPedido(''));
          }}>
            <input value={pedido} onChange={(e) => setPedido(e.target.value)} disabled={ocupado}
              placeholder="Ajustar: “resumí más el budget”, “agregá lo que dijo del socio”…" />
            <button type="submit" className="btn sm" disabled={ocupado || !pedido.trim()}>{ocupado ? 'Ajustando…' : 'Ajustar'}</button>
          </form>
        </>
      )}

      {panel === 'editar' && (
        <>
          <textarea className="sesion-textarea" rows={14} value={borrador} onChange={(e) => setBorrador(e.target.value)} />
          <button type="button" className="btn primary sm" disabled={ocupado}
            onClick={() => accion(() => actualizarSesionNota(s.id, { resumen: borrador })).then(() => setPanel(''))}>
            Guardar
          </button>
        </>
      )}

      {panel === 'transcripcion' && (
        <div className="transcripcion">
          {s.segmentos?.length
            ? s.segmentos.map((seg, i) => (
              <p key={i}>
                <span className="dim num">{duracion(seg.inicio)}</span>
                {seg.hablante && <span className="strong"> {seg.hablante}:</span>} {seg.texto}
              </p>
            ))
            : <p>{s.transcripcion}</p>}
        </div>
      )}
    </article>
  );
}
