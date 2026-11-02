import { useRef, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import CalendarioSemana from './CalendarioSemana.jsx';
import { DIAS, fechaCorta, sumarDias } from '../../lib/daily.js';
import { cargarTareasDaily, importarDaily } from '../../data/api.js';

/**
 * Cargar la semana desde el documento del domingo.
 *
 * Mucha gente ya la escribe afuera —un Google Doc, muchas veces hecho con Claude— y
 * después la copiaba día por día. Acá se pega el link del doc y arranca solo: no hay
 * botón para leerlo. Lo único que queda por hacer es mirar el reparto, elegir la semana
 * y cargar; lo que quede mal se corrige en la daily como cualquier otra tarea.
 *
 * El mismo campo toma las dos cosas: un link de Docs se lee solo, y la semana escrita o
 * pegada ahí mismo se lee con el botón (escribiendo, leer en cada tecla sería leer a
 * medias). Entraba solo el link y Franco lo pidió de vuelta: no siempre hay un Doc.
 *
 * La semana se elige en un calendario y no se da por supuesta: el documento del domingo
 * casi siempre es el de la semana que viene, y la pantalla está parada en la de ahora.
 */

// Un link de Google Docs. El id lo vuelve a sacar el backend, que es quien lo baja.
const ES_DOC = /docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]{10,}/;
// Todo el campo es un link y nada más: así un texto que arranca con un link no se confunde.
const SOLO_LINK = /^https?:\/\/\S+$/i;
// Menos que esto no es una semana: el botón de leer no se prende todavía.
const MINIMO = 12;

const TIPOS = [['velocidad', 'Velocidad'], ['desplazamiento', 'Desplazamiento']];

export default function CargarDaily({ semana, hoy, onCargado }) {
  const [abierto, setAbierto] = useState(false);
  // A qué semana van. Arranca en la que está en pantalla y se cambia en el calendario.
  const [destino, setDestino] = useState(semana);
  const [fuente, setFuente] = useState('');
  const [propuesta, setPropuesta] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  // El último link que ya se leyó: sin esto, tocar una tecla en el campo lo vuelve a pedir.
  const leido = useRef('');
  // Y una espera corta antes de leer: tipeando a mano el link es válido a mitad de camino
  // —el id ya tiene largo suficiente— y se leería un documento que no es.
  const espera = useRef(null);

  function abrir() {
    setDestino(semana);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setFuente('');
    setPropuesta(null);
    setError(null);
    leido.current = '';
    clearTimeout(espera.current);
  }

  // Apenas hay un link de Docs en el campo se lee solo: pegarlo es todo el paso. El texto
  // escrito a mano no, que a mitad de camino es media semana: ese va con el botón.
  function escribir(valor) {
    setFuente(valor);
    setError(null);
    clearTimeout(espera.current);
    const texto = valor.trim();
    if (!texto || !SOLO_LINK.test(texto)) return;
    espera.current = setTimeout(() => {
      if (ES_DOC.test(texto)) {
        if (texto === leido.current) return;
        leido.current = texto;
        leer({ url: texto });
      } else {
        // Un link que no es de Docs no dispara nada: sin esto el campo se queda mudo.
        setError('Ese link no es de Google Docs. Copiá el de la barra del navegador.');
      }
    }, 500);
  }

  async function leer(cuerpo) {
    setTrabajando(true);
    setError(null);
    try {
      const r = await importarDaily(cuerpo);
      setPropuesta(r.tareas.map((t, i) => ({ ...t, id: i })));
    } catch (err) {
      setError(err.message);
      leido.current = '';
    } finally {
      setTrabajando(false);
    }
  }

  async function cargar() {
    setTrabajando(true);
    setError(null);
    try {
      const r = await cargarTareasDaily(destino, propuesta.map(({ texto, tipo, dia }) => ({ texto, tipo, dia })));
      onCargado(destino, r.semana, r.cargadas);
      cerrar();
    } catch (err) {
      setError(err.message);
      setTrabajando(false);
    }
  }

  // Lo que hay en el campo es una semana escrita, no un link: ahí aparece el botón.
  const escrito = fuente.trim().length >= MINIMO && !SOLO_LINK.test(fuente.trim());

  const cambiar = (id, campo, valor) => setPropuesta((p) => p.map((t) => (t.id === id ? { ...t, [campo]: valor } : t)));
  const quitar = (id) => setPropuesta((p) => p.filter((t) => t.id !== id));

  // Las sueltas van al final: son los objetivos de la semana, no las de un día.
  const grupos = [...DIAS.map((_, i) => i), null]
    .map((dia) => ({ dia, tareas: (propuesta ?? []).filter((t) => t.dia === dia) }))
    .filter((g) => g.tareas.length);

  return (
    <>
      <button type="button" className="btn" onClick={abrir}>Cargar semana</button>

      <Modal open={abierto} onClose={cerrar} title="Cargar la semana desde tu documento" wide className="dl-importar">
        {!propuesta ? (
          <>
            <label className="campo">
              <span>Pegá el link de tu Google Doc, o escribí tu semana acá</span>
              <textarea
                id="dl-fuente"
                rows={escrito ? 12 : 3}
                autoFocus
                value={fuente}
                disabled={trabajando}
                onChange={(e) => escribir(e.target.value)}
                placeholder={'https://docs.google.com/document/d/…\n\nLunes\n- Lo que hago el lunes'}
              />
            </label>
            {trabajando && <div className="dl-imp-leyendo">Leyendo…</div>}
            {error && <div className="ronda-evento error">{error}</div>}
            <div className="llamada-acciones">
              <button type="button" className="btn" onClick={cerrar}>Cancelar</button>
              {escrito && (
                <button type="button" className="btn primary" disabled={trabajando}
                  onClick={() => leer({ texto: fuente })}>Leer</button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="dl-imp-cab">
              <b>{propuesta.length} {propuesta.length === 1 ? 'tarea' : 'tareas'}</b>
              <span className="dl-imp-semana">
                Van a la semana del {fechaCorta(destino)} al {fechaCorta(sumarDias(destino, 6))}
              </span>
              <button type="button" className="btn sm ghost" onClick={() => setPropuesta(null)}>Volver</button>
            </div>
            <div className="dl-imp-cols">
              <CalendarioSemana semana={destino} hoy={hoy} onElegir={setDestino} />
              <div className="dl-imp-tareas">
            {grupos.map((g) => (
              <section key={g.dia ?? 'semana'} className="dl-imp-dia">
                <h4>{g.dia === null ? 'Abiertas en la semana' : DIAS[g.dia]}</h4>
                {g.tareas.map((t) => (
                  <div className="dl-imp-fila" key={t.id}>
                    <input value={t.texto} onChange={(e) => cambiar(t.id, 'texto', e.target.value)}
                      aria-label="Tarea" />
                    <select value={t.dia ?? ''} onChange={(e) => cambiar(t.id, 'dia', e.target.value === '' ? null : Number(e.target.value))}
                      aria-label="Día">
                      {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      <option value="">En la semana</option>
                    </select>
                    <select value={t.tipo} onChange={(e) => cambiar(t.id, 'tipo', e.target.value)} aria-label="Tipo">
                      {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button type="button" className="dl-x" onClick={() => quitar(t.id)}
                      aria-label={`Quitar ${t.texto}`} title="Quitar">✕</button>
                  </div>
                ))}
              </section>
            ))}
              </div>
            </div>
            {error && <div className="ronda-evento error">{error}</div>}
            <div className="llamada-acciones">
              <button type="button" className="btn" onClick={cerrar}>Cancelar</button>
              <button type="button" className="btn primary" onClick={cargar} disabled={trabajando || !propuesta.length}>
                {trabajando ? 'Cargando…' : `Cargar ${propuesta.length}`}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
