import { useEffect, useState } from 'react';
import { ErrorState } from '../../components/ui/Loading.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { ejecutarRondaPendientes, getPendientes, getUpdateTexto } from '../../data/api.js';
import { hace } from '../../lib/format.js';

/**
 * Updates: un botón. Corre la ronda (Claude lee lo nuevo de cada canal y actualiza
 * los pedidos abiertos) y deja el update listo para editar y copiar a #updates.
 */
export default function Pendientes() {
  const [estado, setEstado] = useState(null);
  const [texto, setTexto] = useState('');
  const [corriendo, setCorriendo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([getPendientes(), getUpdateTexto()])
      .then(([e, t]) => { if (vivo) { setEstado(e); if (e.ultimaRonda) setTexto(t); } })
      .catch((err) => vivo && setError(err));
    return () => { vivo = false; };
  }, []);

  const correr = async () => {
    setCorriendo(true);
    setError(null);
    try {
      const e = await ejecutarRondaPendientes();
      setEstado(e);
      setTexto(await getUpdateTexto());
    } catch (err) {
      setError(err);
    } finally {
      setCorriendo(false);
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

  const ultima = estado?.ultimaRonda;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fulfillment"
        title="Updates"
        desc={ultima ? `Último update ${hace(ultima.ejecutadoAt, new Date())} · ${ultima.canales_leidos ?? 0} canales leídos` : 'Todavía no se corrió ningún update.'}
        actions={
          <button className="btn primary" onClick={correr} disabled={corriendo}>
            {corriendo ? 'Leyendo canales…' : 'Correr update'}
          </button>
        }
      />

      {error && <ErrorState error={error} />}

      {texto ? (
        <div className="update-editor">
          <textarea
            className="update-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={Math.min(40, texto.split('\n').length + 2)}
            spellCheck={false}
          />
          <div className="update-acciones">
            <span className="dim">Editá lo que haga falta y copialo a #updates.</span>
            <button className="btn" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar'}</button>
          </div>
        </div>
      ) : (
        !error && <div className="empty">{corriendo ? 'Claude está leyendo los canales, tarda unos minutos.' : 'Tocá “Correr update” para armar el primero.'}</div>
      )}
    </div>
  );
}
