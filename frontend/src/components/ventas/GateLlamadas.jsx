import { useEffect, useState } from 'react';
import LlamadasPendientes from './LlamadasPendientes.jsx';
import { getMisLlamadas, login } from '../../data/api.js';
import { mesId } from '../../lib/format.js';
import { GATE_KEY as CLAVE_SALIDA } from '../../lib/auth.js';
import { useRol } from '../../lib/RolContext.jsx';
const ROLES_SALIDA = ['admin', 'founder', 'operaciones'];

/** Salida discreta: un admin, founder u ops pone su clave y libera la pantalla. */
function SalidaAdmin({ para, onLiberar }) {
  const [abierto, setAbierto] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState(null);
  const [probando, setProbando] = useState(false);

  const liberar = async (e) => {
    e.preventDefault();
    setProbando(true);
    setError(null);
    try {
      const r = await login(usuario.trim(), clave);
      const rol = r?.user?.rol;
      if (!ROLES_SALIDA.includes(rol)) {
        setError('Ese usuario no puede liberar la pantalla.');
        return;
      }
      try {
        // Vale solo para este usuario y esta pestaña: al salir o cambiar de usuario se pierde.
        sessionStorage.setItem(CLAVE_SALIDA, JSON.stringify({ admin: r.user.username, para }));
      } catch {
        /* sin sessionStorage: libera igual por esta vez */
      }
      onLiberar(r.user.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setProbando(false);
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        className="gate-salida-punto"
        onClick={() => setAbierto(true)}
        aria-label="Salida para administradores"
        title=""
      >
        ·
      </button>
    );
  }

  return (
    <form className="gate-salida" onSubmit={liberar}>
      <input
        value={usuario}
        onChange={(e) => setUsuario(e.target.value)}
        placeholder="usuario"
        autoComplete="username"
        aria-label="Usuario"
      />
      <input
        type="password"
        value={clave}
        onChange={(e) => setClave(e.target.value)}
        placeholder="clave"
        autoComplete="current-password"
        aria-label="Clave"
      />
      <button className="btn sm primary" type="submit" disabled={probando || !usuario.trim() || !clave}>
        {probando ? '…' : 'Salir'}
      </button>
      <button className="btn sm" type="button" onClick={() => setAbierto(false)}>Cancelar</button>
      {error && <div className="gate-salida-error">{error}</div>}
    </form>
  );
}

/**
 * Los closers no pueden usar el sistema con llamadas sin cargar: hasta que carguen
 * el resultado de todas, ven esta pantalla. Cada tarjeta desaparece al completarla.
 */
export default function GateLlamadas() {
  const { rol, user } = useRol();
  const yo = user?.username ?? null;
  const [data, setData] = useState(null);
  const [restantes, setRestantes] = useState(null);
  const [liberado, setLiberado] = useState(() => {
    try {
      const guardado = JSON.parse(sessionStorage.getItem(CLAVE_SALIDA) ?? 'null');
      return guardado?.para && guardado.para === yo ? guardado.admin : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (rol !== 'closer') return;
    let vivo = true;
    // Solo el mes en curso: lo de meses cerrados ya no se carga, y trabarle el sistema
    // al closer por llamadas de hace tres semanas no le sirve a nadie.
    getMisLlamadas(undefined, mesId())
      .then((d) => {
        if (!vivo) return;
        setData(d);
        setRestantes((d.llamadas ?? []).filter((l) => l.estado === 'sin_reportar'));
      })
      .catch(() => { /* si el CRM no responde, no bloqueamos el sistema */ });
    return () => { vivo = false; };
  }, [rol]);

  const bloquea = rol === 'closer' && !liberado && Boolean(data) && Boolean(restantes?.length);

  // Mientras bloquea, la app de atrás no scrollea: si no, quedan dos barras.
  useEffect(() => {
    document.body.classList.toggle('gate-abierto', bloquea);
    return () => document.body.classList.remove('gate-abierto');
  }, [bloquea]);

  if (!bloquea) return null;

  const cargadas = (data.llamadas ?? []).filter((l) => l.estado === 'sin_reportar').length - restantes.length;

  return (
    <div className="gate-llamadas">
      <div className="gate-caja">
        <SalidaAdmin para={yo} onLiberar={setLiberado} />
        <header>
          <h1>Cargá tus llamadas</h1>
          <p>
            Tenés {restantes.length} llamada{restantes.length === 1 ? '' : 's'} sin resultado.
            Cargalas para seguir usando el sistema: de ahí salen el cash, la facturación y tus métricas.
          </p>
          {cargadas > 0 && <div className="gate-progreso">{cargadas} listas · {restantes.length} restantes</div>}
        </header>

        <LlamadasPendientes
          pendientes={restantes}
          programas={data.programas ?? []}
          estados={data.estados ?? []}
          onGuardado={(nuevo, id) => {
            setData(nuevo);
            setRestantes((prev) => prev.filter((l) => l.id !== id));
          }}
        />
      </div>
    </div>
  );
}
