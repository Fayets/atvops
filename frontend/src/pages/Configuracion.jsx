import { useRef, useState } from 'react';
import Avatar from '../components/ui/Avatar.jsx';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { borrarIntegrante, crearIntegrante, getIntegrantes, subirFotoIntegrante } from '../data/api.js';
import { useResource } from '../lib/hooks.js';

export default function Configuracion() {
  const [tick, setTick] = useState(0);
  const [nombre, setNombre] = useState('');
  const [errorForm, setErrorForm] = useState('');
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef(null);
  const [fotoPara, setFotoPara] = useState(null);
  const { data, loading, error } = useResource(getIntegrantes, [tick]);

  async function onCrear(event) {
    event.preventDefault();
    setErrorForm('');
    setGuardando(true);
    try {
      await crearIntegrante(nombre);
      setNombre('');
      setTick((n) => n + 1);
    } catch (err) {
      setErrorForm(err.message || 'No se pudo crear.');
    } finally {
      setGuardando(false);
    }
  }

  function pedirFoto(id) {
    setFotoPara(id);
    fileRef.current?.click();
  }

  async function onFoto(event) {
    const file = event.target.files?.[0];
    const id = fotoPara;
    event.target.value = '';
    setFotoPara(null);
    if (!file || !id) return;
    try {
      await subirFotoIntegrante(id, file);
      setTick((n) => n + 1);
    } catch (err) {
      setErrorForm(err.message || 'No se pudo subir la foto.');
    }
  }

  async function onBorrar(id) {
    await borrarIntegrante(id);
    setTick((n) => n + 1);
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Equipo"
        title="Configuración"
        desc="Cargá a quienes aparecen en el calendario y su foto. El cuadrado de cada día muestra a los que están en las reuniones de ese día."
      />

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFoto} />

      <Card title="Integrantes" sub="Tocá la foto para cambiarla">
        {error ? <ErrorState error={error} /> : null}
        {loading && !data ? <SkeletonBlock height={120} /> : null}

        <div className="equipo-grid">
          {(data ?? []).map((p) => (
            <div key={p.id} className="equipo-card">
              <button className="equipo-foto" type="button" onClick={() => pedirFoto(p.id)} title="Cambiar foto">
                <Avatar persona={p} size={72} />
              </button>
              <div className="equipo-nombre">{p.nombre}</div>
              <button className="btn" type="button" onClick={() => onBorrar(p.id)}>
                Quitar
              </button>
            </div>
          ))}
        </div>

        <form className="cal-form" onSubmit={onCrear} style={{ marginTop: 20, maxWidth: 360 }}>
          <div className="eyebrow">Sumar integrante</div>
          <input
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
          {errorForm ? <p className="login-error">{errorForm}</p> : null}
          <button className="btn primary" disabled={guardando || !nombre.trim()} type="submit">
            {guardando ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
      </Card>
    </div>
  );
}
