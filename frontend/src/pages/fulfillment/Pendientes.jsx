import { useEffect, useRef, useState } from 'react';
import { ErrorState } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { confirmarUpdate, ejecutarRondaPendientes, getPendientes, getProgresoRonda, getUpdateTexto } from '../../data/api.js';
import { hace } from '../../lib/format.js';

/**
 * Updates: un botón. Corre la ronda en el servidor (Claude lee lo nuevo de cada
 * canal y actualiza los pedidos abiertos), muestra el avance canal por canal y
 * deja el update listo para editar y copiar a #updates.
 */
export default function Pendientes() {
  const [estado, setEstado] = useState(null);
  const [texto, setTexto] = useState('');
  const [progreso, setProgreso] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [confirmado, setConfirmado] = useState(null); // { texto, confirmadoPor, confirmadoAt }
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const feedRef = useRef(null);

  const cargar = async ({ tomarBorrador = false } = {}) => {
    const [e, t] = await Promise.all([getPendientes(), getUpdateTexto()]);
    setEstado(e);
    const conf = e.updateConfirmado;
    // Si hay un update confirmado después de la última ronda, se muestra ese; si no, el borrador de la ronda.
    const confirmadoVigente = conf && e.ultimaRonda && new Date(conf.confirmadoAt) >= new Date(e.ultimaRonda.ejecutadoAt);
    if (!tomarBorrador && confirmadoVigente) {
      setConfirmado(conf);
      setTexto(conf.texto);
    } else if (e.ultimaRonda) {
      setConfirmado(null);
      setTexto(t);
    }
  };

  const seguir = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const p = await getProgresoRonda();
        setProgreso(p);
        if (p.enCurso) seguir();
        else await cargar({ tomarBorrador: true });
      } catch (err) {
        setError(err);
      }
    }, 1500);
  };

  useEffect(() => {
    cargar().catch(setError);
    getProgresoRonda().then((p) => { if (p.enCurso) { setProgreso(p); seguir(); } }).catch(() => {});
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [progreso?.eventos?.length]);

  const correr = async () => {
    setError(null);
    try {
      setProgreso(await ejecutarRondaPendientes());
      seguir();
    } catch (err) {
      setError(err);
    }
  };

  const confirmar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const c = await confirmarUpdate(texto);
      setConfirmado(c);
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sin permiso de portapapeles: el texto queda seleccionable */
    }
  };

  const enCurso = Boolean(progreso?.enCurso);
  const ultima = estado?.ultimaRonda;
  const pct = progreso?.total ? Math.round((progreso.procesados / progreso.total) * 100) : 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment"
        title="Updates"
        desc={ultima ? `Último update ${hace(ultima.ejecutadoAt, new Date())} · ${ultima.canales_leidos ?? 0} canales leídos` : 'Todavía no se corrió ningún update.'}
        actions={
          <button className="btn primary" onClick={correr} disabled={enCurso}>
            {enCurso ? 'Leyendo canales…' : 'Correr update'}
          </button>
        }
      />

      {error && <ErrorState error={error} />}

      {progreso && (enCurso || !texto) && (
        <div className="ronda-progreso">
          <div className="ronda-barra"><div className="ronda-barra-fill" style={{ width: `${pct}%` }} /></div>
          <div className="ronda-cifras">
            <span className="strong">{progreso.total ? `${progreso.procesados} / ${progreso.total} canales` : 'Preparando…'}</span>
            <span className="dim">{progreso.leidos} con novedades · {progreso.saltados} sin cambios · {progreso.cambios} pedidos actualizados · US$ {(progreso.costoUsd ?? 0).toFixed(3)}</span>
            {enCurso && progreso.canalActual && <span className="dim">leyendo #{progreso.canalActual}</span>}
          </div>
          <div className="ronda-feed" ref={feedRef}>
            {(progreso.eventos ?? []).map((ev, i) => (
              <div key={i} className={`ronda-evento ${ev.tipo}`}><span className="dim num">{ev.at}</span> {ev.texto}</div>
            ))}
          </div>
        </div>
      )}

      {texto && !enCurso && (
        <div className="update-editor">
          <textarea
            className="update-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={Math.min(40, texto.split('\n').length + 2)}
            spellCheck={false}
          />
          <div className="update-acciones">
            <span className="dim">
              {confirmado && confirmado.texto === texto
                ? `Confirmado por ${confirmado.confirmadoPor} ${hace(confirmado.confirmadoAt, new Date())}. Guardado en el cerebro.`
                : confirmado
                  ? 'Editaste el update confirmado. Confirmalo de nuevo para guardar los cambios.'
                  : 'Editá lo que haga falta y confirmá para guardarlo.'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar'}</button>
              <button className="btn primary" onClick={confirmar} disabled={guardando || (confirmado && confirmado.texto === texto)}>
                {guardando ? 'Guardando…' : confirmado && confirmado.texto === texto ? 'Confirmado ✓' : 'Confirmar update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!texto && !progreso && !error && <div className="empty">Tocá “Correr update” para armar el primero.</div>}
    </div>
  );
}
