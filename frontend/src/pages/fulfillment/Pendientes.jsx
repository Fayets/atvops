import { useEffect, useRef, useState } from 'react';
import { ErrorState } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { confirmarUpdate, descartarBorrador, ejecutarRondaPendientes, getPendientes, getProgresoRonda, getUpdateTexto } from '../../data/api.js';
import { hace } from '../../lib/format.js';

/**
 * Updates: un botón. La ronda solo propone (Claude lee lo nuevo de cada canal);
 * nada queda guardado hasta que el CSM confirma el update. Confirmar aplica la
 * propuesta al registro, mueve los ledgers y guarda el texto en el cerebro.
 */
export default function Pendientes() {
  const [estado, setEstado] = useState(null);
  const [texto, setTexto] = useState('');
  const [progreso, setProgreso] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const feedRef = useRef(null);

  const cargar = async () => {
    const [e, t] = await Promise.all([getPendientes(), getUpdateTexto()]);
    setEstado(e);
    setTexto(e.borrador ? t : (e.updateConfirmado?.texto ?? ''));
  };

  const seguir = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const p = await getProgresoRonda();
        setProgreso(p);
        if (p.enCurso) seguir();
        else await cargar();
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
      await confirmarUpdate(texto);
      setProgreso(null);
      await cargar();
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  };

  const descartar = async () => {
    if (!window.confirm('¿Descartar la propuesta de esta ronda? El registro queda como estaba.')) return;
    setError(null);
    try {
      await descartarBorrador();
      setProgreso(null);
      await cargar();
    } catch (err) {
      setError(err);
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
  const borrador = estado?.borrador;
  const confirmado = estado?.updateConfirmado;
  const pct = progreso?.total ? Math.round((progreso.procesados / progreso.total) * 100) : 0;

  let desc = 'Todavía no se corrió ningún update.';
  if (borrador) desc = `Propuesta sin confirmar de ${hace(borrador.terminadoAt ?? borrador.generadoAt, new Date())} · ${borrador.canales} canales con novedades. Nada queda guardado hasta que confirmes.`;
  else if (confirmado) desc = `Último update confirmado por ${confirmado.confirmadoPor} ${hace(confirmado.confirmadoAt, new Date())}.`;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment"
        title="Updates"
        desc={desc}
        actions={
          <button className="btn primary" onClick={correr} disabled={enCurso}>
            {enCurso ? 'Leyendo canales…' : 'Correr update'}
          </button>
        }
      />

      {error && <ErrorState error={error} />}

      {progreso && enCurso && (
        <div className="ronda-progreso">
          <div className="ronda-barra"><div className="ronda-barra-fill" style={{ width: `${pct}%` }} /></div>
          <div className="ronda-cifras">
            <span className="strong">{progreso.total ? `${progreso.procesados} / ${progreso.total} canales` : 'Preparando…'}</span>
            <span className="dim">{progreso.leidos} leídos · {progreso.saltados} sin cambios · {progreso.reutilizados ?? 0} ya propuestos · {progreso.cambios} cambios propuestos · US$ {(progreso.costoUsd ?? 0).toFixed(3)}</span>
            {progreso.canalActual && <span className="dim">leyendo {progreso.canalActual.split(', ').map((c) => `#${c}`).join(', ')}</span>}
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
          {borrador?.error && <div className="ronda-evento error" style={{ fontSize: 12.5 }}>Canales con error en la ronda (se reintentan en la próxima): {borrador.error.split('\n').length}</div>}
          <textarea
            className="update-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={Math.min(40, texto.split('\n').length + 2)}
            spellCheck={false}
          />
          <div className="update-acciones">
            <span className="dim">
              {borrador
                ? 'Editá lo que haga falta. Confirmar guarda el update y aplica la propuesta al registro.'
                : confirmado
                  ? `Confirmado por ${confirmado.confirmadoPor} ${hace(confirmado.confirmadoAt, new Date())}. Guardado en el cerebro.`
                  : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {borrador && <button className="btn" onClick={descartar}>Descartar</button>}
              <button className="btn" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar'}</button>
              {borrador && (
                <button className="btn primary" onClick={confirmar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Confirmar update'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!texto && !enCurso && !error && <div className="empty">Tocá “Correr update” para armar el primero.</div>}
    </div>
  );
}
