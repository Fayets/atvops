import { useMemo, useRef, useState } from 'react';
import Card from '../ui/Card.jsx';
import { SkeletonBlock } from '../ui/Loading.jsx';
import Grabador from './Grabador.jsx';
import SesionItem from './SesionItem.jsx';
import { actualizarSesionNota, crearSesionNota, procesarSesionNota, subirAudioSesion } from '../../data/api.js';
import { diaMes, lunesDe, sumarDias } from '../../lib/setting.js';

const MODOS = [['grabar', 'Grabar'], ['subir', 'Subir audio'], ['texto', 'Pegar texto']];

/**
 * La pestaña Notes: grabar la llamada y la librería de lo grabado.
 *
 * Lead Notes es donde se carga; Librería es donde se lee. Están separadas porque son dos
 * momentos distintos: grabar pasa una vez por llamada, leer las notas pasa cada vez que
 * el closer se prepara.
 */
export default function NotasSetting({ sesiones, motor, pitches, hoy, cargando, onRecargar }) {
  const [tab, setTab] = useState('nueva');
  const [modo, setModo] = useState('grabar');
  const [contacto, setContacto] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [paso, setPaso] = useState('');
  const [error, setError] = useState('');
  const archivo = useRef(null);

  const sinMotor = !motor?.transcripcion;
  const lunes = lunesDe(hoy);
  const domingo = sumarDias(lunes, 6);

  const sinMatch = sesiones.filter((s) => !s.pitchId && !s.contacto);
  const semana = useMemo(() => {
    const deLaSemana = sesiones.filter((s) => s.fecha >= lunes && s.fecha <= domingo);
    const calls = pitches.filter((p) => p.pitchEstado === 'booked' && p.fechaLlamada >= lunes && p.fechaLlamada <= domingo);
    const conGrabacion = calls.filter((p) => sesiones.some((s) => s.pitchId === p.id && s.tieneAudio));
    return { sesiones: deLaSemana, calls: calls.length, conGrabacion: conGrabacion.length };
  }, [sesiones, pitches, lunes, domingo]);

  const listadas = { todas: sesiones, semana: semana.sesiones, sinMatch }[filtro] ?? sesiones;

  /** Crea la sesión, sube lo que haya y la manda a procesar. */
  const guardar = async ({ audio, audioMic, duracionSeg, textoPegado, nombre }) => {
    setError('');
    try {
      setPaso('Creando la sesión…');
      const s = await crearSesionNota({
        contacto, fecha, tipo: textoPegado ? 'dm' : 'call',
        origen: textoPegado ? 'texto' : modo === 'grabar' ? 'grabacion' : 'subida',
        texto: textoPegado || '',
      });
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
      setContacto('');
      setTexto('');
      onRecargar();
      setTab('libreria');
    } catch (e) {
      setError(e.message);
    } finally {
      setPaso('');
    }
  };

  return (
    <>
      <div className="tabs sm notas-tabs">
        <button type="button" className={`tab${tab === 'nueva' ? ' active' : ''}`} onClick={() => setTab('nueva')}>Lead Notes</button>
        <button type="button" className={`tab${tab === 'libreria' ? ' active' : ''}`} onClick={() => setTab('libreria')}>
          Librería <span className="num">{sesiones.length}</span>
        </button>
      </div>

      {tab === 'nueva' && (
        <Card
          title="Nueva sesión"
          actions={(
            <div className="tabs sm">
              {MODOS.map(([v, l]) => (
                <button key={v} type="button" className={`tab${modo === v ? ' active' : ''}`} onClick={() => setModo(v)}>{l}</button>
              ))}
            </div>
          )}
          foot={sinMotor && modo !== 'texto'
            ? 'Todavía no hay motor de transcripción configurado: el audio se guarda igual y podés pegar el texto después.'
            : !motor?.notas ? 'Las notas las redacta Claude: hoy no está disponible en este servidor.' : ''}
        >
          <div className="sesion-campos nueva">
            <label>Contacto del prospecto
              <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="email, teléfono o @usuario" />
              <span className="dim">sin esto la grabación queda sin dueño hasta que se la asignes</span>
            </label>
            <label>Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
          </div>
          {modo === 'grabar' && (
            <Grabador deshabilitado={Boolean(paso)}
              onListo={({ audio, audioMic, duracion: d }) => guardar({ audio, audioMic, duracionSeg: d })} />
          )}
          {modo === 'subir' && (
            <div className="subir-audio">
              <input ref={archivo} type="file" accept="audio/*,video/webm,.m4a,.mp3,.wav,.ogg" hidden
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) guardar({ audio: f, nombre: f.name }); }} />
              <button type="button" className="btn primary" disabled={Boolean(paso)} onClick={() => archivo.current?.click()}>
                Elegir archivo de audio
              </button>
              <span className="dim">mp3, m4a, wav, webm u ogg. Una llamada de una hora pesa unos 30 MB.</span>
            </div>
          )}
          {modo === 'texto' && (
            <div className="pegar-texto">
              <textarea rows={7} value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="Pegá acá la conversación de DMs o la transcripción que ya tengas" />
              <button type="button" className="btn primary" disabled={Boolean(paso) || !texto.trim()}
                onClick={() => guardar({ textoPegado: texto })}>Guardar y redactar notas</button>
            </div>
          )}
          {paso && <p className="dim sesion-proceso"><span className="spinner" /> {paso}</p>}
          {error && <p className="sesion-error">{error}</p>}
        </Card>
      )}

      {tab === 'libreria' && (
        <Card
          title="Librería"
          sub={`Semana del ${diaMes(lunes)} al ${diaMes(domingo)}: ${semana.sesiones.length} ${semana.sesiones.length === 1 ? 'sesión grabada' : 'sesiones grabadas'} · ${semana.conGrabacion} de ${semana.calls} calls agendadas tienen grabación`}
          actions={(
            <div className="tabs sm">
              <button type="button" className={`tab${filtro === 'todas' ? ' active' : ''}`} onClick={() => setFiltro('todas')}>Todas</button>
              <button type="button" className={`tab${filtro === 'semana' ? ' active' : ''}`} onClick={() => setFiltro('semana')}>Esta semana</button>
              <button type="button" className={`tab${filtro === 'sinMatch' ? ' active' : ''}`} onClick={() => setFiltro('sinMatch')}>
                Sin match <span className="num">{sinMatch.length}</span>
              </button>
            </div>
          )}
          flush
        >
          {cargando && !sesiones.length ? <SkeletonBlock height={200} /> : listadas.length === 0 ? (
            <div className="empty">No hay sesiones acá.</div>
          ) : (
            <div className="sesiones-lista">
              {listadas.map((s) => <SesionItem key={s.id} sesion={s} pitches={pitches} onCambio={onRecargar} />)}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
