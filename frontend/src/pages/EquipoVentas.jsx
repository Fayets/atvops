import { useState } from 'react';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import { asignarRolesVentas, getEquipoRoles } from '../data/api.js';
import { useResource } from '../lib/hooks.js';

const ETIQUETA = { setter: 'Setter', closer: 'Closer' };

/**
 * El equipo de ventas: qué hace cada persona. Lo maneja el director (Lucas).
 *
 * Una persona puede tener los dos roles —Cris agenda y también cierra— y con cada uno ve
 * su pantalla y entra en los números de ese rol. Quien figura como closer es quien
 * aparece en "Quién la tomó" al cargar una llamada.
 *
 * El rol principal de la cuenta (Nick entra como closer) queda marcado y fijo: sacarlo
 * cambiaría qué ve esa persona al entrar, y eso no se decide desde acá.
 */
export default function EquipoVentas() {
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useResource(() => getEquipoRoles(), [tick]);
  const [local, setLocal] = useState(null);
  const [guardando, setGuardando] = useState('');
  const [aviso, setAviso] = useState('');

  const personas = local ?? data?.personas ?? [];
  const roles = data?.roles ?? ['closer', 'setter'];

  const alternar = async (p, rol) => {
    const nuevos = p.roles.includes(rol) ? p.roles.filter((r) => r !== rol) : [...p.roles, rol];
    setGuardando(p.username);
    setAviso('');
    try {
      const r = await asignarRolesVentas(p.username, nuevos);
      setLocal(r.personas);
    } catch (e) {
      setAviso(e?.message || 'No se pudo guardar.');
    } finally {
      setGuardando('');
    }
  };

  if (loading && !data) return <div className="page"><SkeletonBlock height={320} /></div>;
  if (error && !data) return <div className="page"><ErrorState error={error} /></div>;

  const conRol = personas.filter((p) => p.roles.length);
  const resto = personas.filter((p) => !p.roles.length);

  const Fila = ({ p }) => (
    <li className="eqv-fila">
      <span className="eqv-avatar" aria-hidden="true">{(p.nombre || p.username).slice(0, 1).toUpperCase()}</span>
      <span className="eqv-quien">
        <b>{p.nombre}</b>
        <span className="dim">{p.cargo || p.username}</span>
      </span>
      <span className="eqv-roles">
        {roles.map((rol) => {
          const activo = p.roles.includes(rol);
          const fijo = p.fijos.includes(rol);
          return (
            <button key={rol} type="button" className={`chip${activo ? ' active' : ''}`}
              aria-pressed={activo} disabled={fijo || guardando === p.username}
              title={fijo ? 'Es el rol principal de su cuenta' : undefined}
              onClick={() => alternar(p, rol)}>
              {ETIQUETA[rol] ?? rol}
            </button>
          );
        })}
      </span>
    </li>
  );

  return (
    <div className="page">
      {aviso && <p className="aud-aviso">{aviso}</p>}
      <section className="card eqv">
        <h2 className="eqv-titulo">Equipo de ventas <span className="dim">· {conRol.length}</span></h2>
        <ul className="eqv-lista">{conRol.map((p) => <Fila key={p.username} p={p} />)}</ul>
      </section>
      {resto.length > 0 && (
        <section className="card eqv">
          <h2 className="eqv-titulo">Resto del equipo <span className="dim">· {resto.length}</span></h2>
          <ul className="eqv-lista">{resto.map((p) => <Fila key={p.username} p={p} />)}</ul>
        </section>
      )}
    </div>
  );
}
