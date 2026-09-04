import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { crearReunion, borrarReunion, getIntegrantes, getReunionesMes } from '../../data/api.js';
import { ahora, hoyIso, nombreMesAnio } from '../../lib/format.js';
import { useResource } from '../../lib/hooks.js';
import Avatar from '../ui/Avatar.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Normaliza a HH:MM en 24 h. Acepta vacío. */
function normalizarHora24(valor) {
  const limpio = (valor || '').trim();
  if (!limpio) return '';
  const m = limpio.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function isoDe(anio, mes0, dia) {
  return `${anio}-${String(mes0 + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function celdasDelMes(anio, mes0) {
  const offset = (new Date(anio, mes0, 1).getDay() + 6) % 7;
  const dias = new Date(anio, mes0 + 1, 0).getDate();
  const celdas = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= dias; d += 1) celdas.push(d);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}

function participantesDelDia(reuniones) {
  const seen = new Map();
  for (const r of reuniones) {
    for (const p of r.participantes) {
      if (!seen.has(p.id)) seen.set(p.id, p);
    }
  }
  return [...seen.values()];
}

export default function CalendarioReuniones() {
  const hoy = ahora();
  const [cursor, setCursor] = useState({ anio: hoy.getFullYear(), mes0: hoy.getMonth() });
  const [diaSel, setDiaSel] = useState(hoy.getDate());
  const [tick, setTick] = useState(0);
  const [titulo, setTitulo] = useState('');
  const [hora, setHora] = useState('');
  const [elegidos, setElegidos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const { data, loading, error } = useResource(
    () => getReunionesMes(cursor.anio, cursor.mes0 + 1),
    [cursor.anio, cursor.mes0, tick],
  );
  const { data: integrantes } = useResource(getIntegrantes, [tick]);

  const fechaSel = isoDe(cursor.anio, cursor.mes0, diaSel);
  const hoyStr = hoyIso(hoy);
  const reuniones = data?.reuniones ?? [];
  const porDia = useMemo(() => {
    const map = new Map();
    for (const r of reuniones) {
      const key = typeof r.fecha === 'string' ? r.fecha : r.fecha;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return map;
  }, [reuniones]);

  const delDia = porDia.get(fechaSel) ?? [];
  const celdas = celdasDelMes(cursor.anio, cursor.mes0);
  const etiquetaMes = nombreMesAnio(new Date(cursor.anio, cursor.mes0, 1));

  function mover(delta) {
    const d = new Date(cursor.anio, cursor.mes0 + delta, 1);
    setCursor({ anio: d.getFullYear(), mes0: d.getMonth() });
    setDiaSel(1);
  }

  function toggle(id) {
    setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onCrear(event) {
    event.preventDefault();
    setErrorForm('');
    const horaNorm = normalizarHora24(hora);
    if (hora.trim() && horaNorm === null) {
      setErrorForm('La hora tiene que ser 24 h, por ejemplo 14:30.');
      return;
    }
    setGuardando(true);
    try {
      await crearReunion({
        titulo,
        fecha: fechaSel,
        hora: horaNorm || null,
        integrante_ids: elegidos,
      });
      setTitulo('');
      setHora('');
      setElegidos([]);
      setTick((n) => n + 1);
    } catch (err) {
      setErrorForm(err.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  async function onBorrar(id) {
    await borrarReunion(id);
    setTick((n) => n + 1);
  }

  return (
    <Card
      title={null}
      actions={
        <Link to="/configuracion" className="btn">
          Fotos del equipo
        </Link>
      }
    >
      <div className="cal">
        <div className="cal-grid-wrap">
          <div className="cal-nav">
            <button className="btn icon" onClick={() => mover(-1)} type="button" aria-label="Mes anterior">
              <Icon name="arrow" size={14} className="cal-nav-prev" />
            </button>
            <span className="cal-nav-mes">{etiquetaMes}</span>
            <button className="btn icon" onClick={() => mover(1)} type="button" aria-label="Mes siguiente">
              <Icon name="arrow" size={14} />
            </button>
          </div>

          {error ? (
            <p className="login-error">{error.message}</p>
          ) : (
            <div className="cal-grid">
              {DIAS.map((d) => (
                <div key={d} className="cal-dow">
                  {d}
                </div>
              ))}
              {celdas.map((dia, i) => {
                if (!dia) return <div key={`e-${i}`} className="cal-cell vacia" />;
                const iso = isoDe(cursor.anio, cursor.mes0, dia);
                const items = porDia.get(iso) ?? [];
                const gente = participantesDelDia(items);
                const extra = Math.max(0, gente.length - 3);
                const visibles = gente.slice(0, 3);
                return (
                  <button
                    key={iso}
                    type="button"
                    className={`cal-cell${iso === fechaSel ? ' sel' : ''}${iso === hoyStr ? ' hoy' : ''}`}
                    onClick={() => setDiaSel(dia)}
                  >
                    <span className="cal-num num">{dia}</span>
                    {visibles.length > 0 && (
                      <span className="cal-avatares">
                        {visibles.map((p) => (
                          <Avatar key={p.id} persona={p} size={22} />
                        ))}
                        {extra > 0 ? <span className="cal-extra">+{extra}</span> : null}
                      </span>
                    )}
                    {items.length > 0 && visibles.length === 0 ? (
                      <span className="cal-puntos">{items.length} reunión{items.length > 1 ? 'es' : ''}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {loading ? <p className="dim" style={{ marginTop: 8 }}>Cargando…</p> : null}
        </div>

        <div className="cal-dia">
          <div className="eyebrow">Día {diaSel}</div>
          <h3>
            {diaSel} {etiquetaMes}
          </h3>

          {delDia.length === 0 ? (
            <p className="dim" style={{ margin: '8px 0 16px' }}>
              No hay reuniones este día.
            </p>
          ) : (
            <ul className="cal-lista">
              {delDia.map((r) => (
                <li key={r.id} className="cal-item">
                  <div>
                    <div className="cal-item-titulo">
                      {r.hora ? <span className="num dim">{r.hora} · </span> : null}
                      {r.titulo}
                    </div>
                    <div className="cal-avatares" style={{ marginTop: 6 }}>
                      {r.participantes.map((p) => (
                        <Avatar key={p.id} persona={p} size={24} />
                      ))}
                      {r.participantes.length === 0 ? <span className="dim">Sin asignar</span> : null}
                    </div>
                  </div>
                  <button className="btn" type="button" onClick={() => onBorrar(r.id)}>
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form className="cal-form" onSubmit={onCrear}>
            <div className="eyebrow">Nueva reunión</div>
            <input
              placeholder="Título"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="14:30"
              aria-label="Hora (24 h)"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              onBlur={() => {
                const norm = normalizarHora24(hora);
                if (norm) setHora(norm);
              }}
              autoComplete="off"
              maxLength={5}
            />
            <div className="cal-people">
              {(integrantes ?? []).map((p) => (
                <label key={p.id} className={`cal-chip${elegidos.includes(p.id) ? ' on' : ''}`}>
                  <input type="checkbox" checked={elegidos.includes(p.id)} onChange={() => toggle(p.id)} />
                  <Avatar persona={p} size={22} />
                  {p.nombre}
                </label>
              ))}
              {(integrantes ?? []).length === 0 ? (
                <Link to="/configuracion" className="dim">
                  Cargá integrantes y fotos en Configuración.
                </Link>
              ) : null}
            </div>
            {errorForm ? <p className="login-error">{errorForm}</p> : null}
            <button className="btn primary" disabled={guardando || !titulo.trim()} type="submit">
              {guardando ? 'Guardando…' : 'Asignar al día'}
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}
