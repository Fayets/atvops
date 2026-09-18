import { useEffect, useRef, useState } from 'react';

const MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';

function grabar(stream) {
  const partes = [];
  const rec = new MediaRecorder(stream, { ...(MIME ? { mimeType: MIME } : {}), audioBitsPerSecond: 32000 });
  rec.ondataavailable = (e) => e.data.size > 0 && partes.push(e.data);
  const fin = new Promise((res) => { rec.onstop = () => res(new Blob(partes, { type: MIME || 'audio/webm' })); });
  rec.start(1000);
  return { rec, fin };
}

/**
 * Graba en el navegador: el micrófono siempre, y si se pide, el audio de la pestaña donde
 * está la llamada. Con las dos pistas la transcripción sabe quién habló.
 *
 * @param {{ onListo: ({ audio: Blob, audioMic?: Blob, duracion: number }) => void, deshabilitado?: boolean }} props
 */
export default function Grabador({ onListo, deshabilitado }) {
  const [estado, setEstado] = useState('listo'); // listo | grabando
  const [conPestana, setConPestana] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState('');
  const ref = useRef(null);

  useEffect(() => () => ref.current?.detener?.(true), []);
  useEffect(() => {
    if (estado !== 'grabando') return undefined;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado]);

  const empezar = async () => {
    setError('');
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      let sistema = null;
      if (conPestana) {
        try {
          const disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          disp.getVideoTracks().forEach((t) => t.stop());
          if (disp.getAudioTracks().length) sistema = new MediaStream(disp.getAudioTracks());
          else setError('La pestaña compartida no tenía audio: se graba solo tu micrófono.');
        } catch {
          setError('No se compartió la pestaña: se graba solo tu micrófono.');
        }
      }
      const gMic = grabar(mic);
      const gSis = sistema ? grabar(sistema) : null;
      const inicio = Date.now();
      ref.current = {
        detener: async (descartar = false) => {
          gMic.rec.state !== 'inactive' && gMic.rec.stop();
          gSis && gSis.rec.state !== 'inactive' && gSis.rec.stop();
          mic.getTracks().forEach((t) => t.stop());
          sistema?.getTracks().forEach((t) => t.stop());
          if (descartar) return;
          const [bMic, bSis] = await Promise.all([gMic.fin, gSis ? gSis.fin : null]);
          const duracion = Math.round((Date.now() - inicio) / 1000);
          onListo(bSis ? { audio: bSis, audioMic: bMic, duracion } : { audio: bMic, duracion });
        },
      };
      setSegundos(0);
      setEstado('grabando');
    } catch (e) {
      setError(e?.name === 'NotAllowedError' ? 'Sin permiso para usar el micrófono.' : (e.message || 'No se pudo grabar.'));
    }
  };

  const parar = async () => {
    setEstado('listo');
    await ref.current?.detener();
    ref.current = null;
  };

  const mm = String(Math.floor(segundos / 60)).padStart(2, '0');
  const ss = String(segundos % 60).padStart(2, '0');
  return (
    <div className="grabador">
      {estado === 'listo' ? (
        <button type="button" className="grabador-boton" onClick={empezar} disabled={deshabilitado}>
          <span className="grabador-punto" />
          <span>Click para grabar</span>
          <span className="dim">Se graba en el navegador · {conPestana ? 'micrófono + pestaña' : 'sólo tu micrófono'}</span>
        </button>
      ) : (
        <button type="button" className="grabador-boton grabando" onClick={parar}>
          <span className="grabador-punto" />
          <span className="num">{mm}:{ss}</span>
          <span className="dim">Click para terminar y guardar</span>
        </button>
      )}
      <label className="grabador-check">
        <input type="checkbox" checked={conPestana} onChange={(e) => setConPestana(e.target.checked)} disabled={estado === 'grabando'} />
        <span>
          <strong>Grabar también el audio de la pestaña</strong>
          <span className="dim">Sin esto se graba sólo tu micrófono y la voz del prospecto no queda. Al prenderlo se abre el diálogo de compartir: elegí la pestaña donde está la llamada y activá "Compartir audio de la pestaña". Compartir la pantalla entera o una ventana no captura audio en Mac.</span>
        </span>
      </label>
      {error && <p className="grabador-error">{error}</p>}
    </div>
  );
}
