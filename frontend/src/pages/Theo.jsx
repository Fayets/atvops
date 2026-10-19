import { useCallback, useEffect, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import {
  accionTheoMensaje, editarTheoEnvio, editarTheoMensaje, enviarTheoAhora, getTheoEnvios, getTheoMensaje,
  getTheoMensajes, getTheoSemana, guardarJidGrupoTheo,
} from '../data/api.js';
import '../styles/theo.css';

const ESTADO = {
  pendiente: ['warn', 'Por salir'],
  enviado: ['ok', 'Enviado'],
  fallido: ['alert', 'Falló'],
  frenado: ['off', 'No se mandó'],
};

const hora = (iso) => (iso ? iso.slice(11, 16) : '');
const dia = (iso) => {
  if (!iso) return 'En cola';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' });
};

/**
 * Lo que manda Theo por WhatsApp. Lo que todavía no salió se edita, se frena o se manda
 * ya; lo que salió queda como registro. La ven sistemas y operaciones.
 */
export default function Theo() {
  const [tab, setTab] = useState('semana');
  return (
    <div className="page">
      <PageHeader
        eyebrow="Sistema · Theo"
        title="Lo que manda Theo"
        desc="Todo lo que Theo manda por WhatsApp pasa por acá. Lo que todavía no salió se puede editar o frenar. Lo que ya salió queda como registro."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'semana', label: 'Semana' },
          { value: 'pendientes', label: 'Por salir' },
          { value: 'enviados', label: 'Enviados' },
          { value: 'envios', label: 'Envíos automáticos' },
        ]}
      />
      {tab === 'semana' ? <Semana /> : tab === 'envios' ? <Envios /> : <Mensajes key={tab} vista={tab} />}
    </div>
  );
}

function Kpis({ r }) {
  if (!r) return null;
  return (
    <div className="th-kpis" style={{ marginTop: 'var(--space-4)' }}>
      <div className="th-kpi"><b>{r.pendientes}</b><span>por salir</span></div>
      <div className="th-kpi"><b>{r.enviados_hoy}</b><span>enviados hoy</span></div>
      <div className={`th-kpi${r.fallidos ? ' alert' : ''}`}><b>{r.fallidos}</b><span>fallaron esta semana</span></div>
      <div className="th-kpi"><b>{r.envios_activos}/{r.envios}</b><span>envíos automáticos prendidos</span></div>
    </div>
  );
}

function Mensajes({ vista }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(null);
  const [envio, setEnvio] = useState('');
  const [q, setQ] = useState('');

  const cargar = useCallback(() => getTheoMensajes(vista, { envio, q })
    .then((r) => { setData(r); setError(null); return r; })
    .catch(setError), [vista, envio, q]);

  useEffect(() => {
    const t = setTimeout(cargar, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, q]);

  // Lo que está por salir se refresca solo: la daily cambia a medida que el equipo guarda.
  useEffect(() => {
    if (vista !== 'pendientes') return undefined;
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, [vista, cargar]);

  if (error && !data) return <div style={{ marginTop: 16 }}><ErrorState error={error} /></div>;
  if (!data) return <div style={{ marginTop: 16 }}><SkeletonBlock height={360} /></div>;

  const lista = data.mensajes;
  const actual = lista.find((m) => m.id === sel) ?? lista[0] ?? null;
  const dias = [...new Set(lista.map((m) => dia(vista === 'pendientes' ? m.sale_at : (m.enviado_at ?? m.sale_at))))];

  return (
    <>
      <Kpis r={data.resumen} />
      <div className="th-grid" style={{ marginTop: 0 }}>
        <Card flush>
          {vista === 'enviados' && (
            <div className="th-filtros">
              <select value={envio} onChange={(e) => setEnvio(e.target.value)} aria-label="Envío">
                <option value="">Todos los envíos</option>
                <option value="daily">Daily completada</option>
                <option value="llamadas">Resultado de cada llamada</option>
                <option value="landing">Landing sin registros</option>
                <option value="capacidad">Capacidad Operativa</option>
              </select>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el texto" aria-label="Buscar en el texto" />
            </div>
          )}
          {lista.length === 0 && (
            <p className="th-vacio">{vista === 'pendientes' ? 'No hay nada por salir.' : 'Todavía no salió nada en los últimos 30 días.'}</p>
          )}
          {dias.map((d) => (
            <div key={d}>
              <div className="th-dia">{d}</div>
              {lista.filter((m) => dia(vista === 'pendientes' ? m.sale_at : (m.enviado_at ?? m.sale_at)) === d).map((m) => {
                const [tono, label] = ESTADO[m.estado];
                return (
                  <button key={m.id} type="button" className="th-item" aria-pressed={actual?.id === m.id} onClick={() => setSel(m.id)}>
                    <time>{m.ia && m.estado === 'pendiente' ? 'en cola' : hora(vista === 'pendientes' ? m.sale_at : (m.enviado_at ?? m.sale_at))}</time>
                    <div className="t">
                      <b>{m.envio_nombre}</b>
                      <span>{(m.texto || '').split('\n')[0]}</span>
                      <small>→ {m.grupo ?? 'sin grupo'}{m.editado_por ? ` · editado por ${m.editado_por}` : ''}</small>
                    </div>
                    <Pill tone={m.sin_grupo && m.estado === 'pendiente' ? 'alert' : tono}>{m.sin_grupo && m.estado === 'pendiente' ? 'Sin grupo' : label}</Pill>
                  </button>
                );
              })}
            </div>
          ))}
        </Card>
        {actual ? <Detalle key={actual.id + actual.estado} m={actual} onCambio={cargar} /> : <span />}
      </div>
    </>
  );
}

function Detalle({ m, onCambio }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(m.texto);
  const [estado, setEstado] = useState('');
  const [tono, label] = ESTADO[m.estado];
  const pendiente = m.estado === 'pendiente';

  async function hacer(fn) {
    setEstado('');
    try {
      await fn();
      setEditando(false);
      onCambio();
    } catch (e) {
      setEstado(e.message);
    }
  }

  return (
    <Card flush className="th-det">
      <div className="th-dh">
        <span style={{ alignSelf: 'flex-start' }}><Pill tone={tono}>{label}</Pill></span>
        <h2>{m.envio_nombre}{m.prospecto ? ` · ${m.prospecto}` : ''}</h2>
        <div className="th-meta">
          <span>Grupo <b>{m.grupo ?? '—'}</b></span>
          {pendiente
            ? <span>Sale <b>{m.ia ? 'en la próxima corrida' : `${dia(m.sale_at)} ${hora(m.sale_at)}`}</b></span>
            : <span>{m.estado === 'enviado' ? 'Salió' : 'Era para'} <b>{dia(m.enviado_at ?? m.sale_at)} {hora(m.enviado_at ?? m.sale_at)}</b></span>}
          <span>{m.ia ? 'Lo escribió la IA' : 'Lo armó Ops'}</span>
        </div>
      </div>
      {m.error && <div className="th-error">{m.error}</div>}
      {m.sin_grupo && pendiente && <div className="th-aviso">Este envío no tiene grupo de WhatsApp: no va a salir. Cargalo en Envíos automáticos.</div>}
      {editando ? (
        <div style={{ padding: '12px 18px' }}>
          <textarea className="th-edit" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto del mensaje" />
        </div>
      ) : (
        <div className="th-chat">
          <div className="th-burbuja">{m.vista || m.texto || '(vacío)'}<time>{hora(m.enviado_at)}</time></div>
        </div>
      )}
      <div className="th-acciones">
        {(pendiente || m.estado === 'fallido') && (editando ? (
          <>
            <button type="button" className="btn primary" disabled={!texto.trim()}
              onClick={() => hacer(() => editarTheoMensaje(m.id, texto))}>Guardar cambios</button>
            <button type="button" className="btn ghost" onClick={() => { setTexto(m.texto); setEditando(false); }}>Descartar</button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => setEditando(true)}>Editar</button>
            {m.mandar_ahora && (
              <button type="button" className="btn" onClick={() => hacer(() => accionTheoMensaje(m.id, 'ahora'))}>
                {m.estado === 'fallido' ? 'Reintentar' : 'Mandar ahora'}
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => hacer(() => accionTheoMensaje(m.id, 'frenar'))}>No mandar</button>
          </>
        ))}
        {m.estado === 'frenado' && (
          <button type="button" className="btn" onClick={() => hacer(() => accionTheoMensaje(m.id, 'volver'))}>Volver a la cola</button>
        )}
        {m.estado === 'enviado' && (
          <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(m.texto).then(() => setEstado('Copiado'), () => {})}>Copiar texto</button>
        )}
        {estado && <span className="dim">{estado}</span>}
      </div>
      <div className="th-nota">
        {pendiente && (m.se_arma_al_salir
          ? <><b>Se arma a las 23:00</b> con quién guardó su daily hasta ese momento. Si lo editás queda fijo y ya no se actualiza solo.</>
          : <><b>Editar cambia solo este envío.</b> Para cambiar todos los que vienen, editá la plantilla en Envíos automáticos.</>)}
        {m.estado === 'enviado' && <><b>Lo que ya salió no se puede cambiar desde acá:</b> WhatsApp no deja que Theo edite lo que mandó. Si hay un error, mandá una corrección.</>}
        {m.estado === 'frenado' && <>Lo frenó {m.frenado_por ?? 'alguien'} antes de que saliera.</>}
        {m.estado === 'fallido' && <>Se reintenta solo hasta tres veces mientras no se venza. También podés reintentarlo a mano.</>}
      </div>
    </Card>
  );
}

function Envios() {
  const [envios, setEnvios] = useState(null);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState('daily');
  const cargar = useCallback(() => getTheoEnvios().then((r) => { setEnvios(r); setError(null); }).catch(setError), []);
  useEffect(() => { cargar(); }, [cargar]);

  if (error && !envios) return <div style={{ marginTop: 16 }}><ErrorState error={error} /></div>;
  if (!envios) return <div style={{ marginTop: 16 }}><SkeletonBlock height={360} /></div>;
  const actual = envios.find((e) => e.clave === sel) ?? envios[0];

  async function prender(e) {
    try {
      await editarTheoEnvio(e.clave, { activo: !e.activo });
      cargar();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="th-grid">
      <Card flush>
        {envios.map((e) => (
          <div key={e.clave} className="th-job" aria-current={e.clave === actual.clave}>
            <div><b>{e.nombre}</b><small>{e.cuando} · → {e.grupo ?? 'sin grupo'}</small></div>
            <button type="button" className="th-switch" role="switch" aria-checked={e.activo}
              aria-label={`${e.activo ? 'Apagar' : 'Prender'} ${e.nombre}`} onClick={() => prender(e)} />
            <div className="how">
              <span className="th-chip">{e.fuente}</span>
              {e.ia ? <span className="th-chip ia">Escribe la IA</span> : <span className="th-chip">Sin IA</span>}
              {e.plantilla && <span className="th-chip">Plantilla editable</span>}
              {!e.grupo_jid && e.clave === 'daily' && <Pill tone="alert">Falta el grupo</Pill>}
              <button type="button" className="btn ghost sm" onClick={() => setSel(e.clave)}>Ver →</button>
            </div>
          </div>
        ))}
      </Card>
      <EnvioDetalle key={actual.clave} e={actual} onGuardado={cargar} />
    </div>
  );
}

function EnvioDetalle({ e, onGuardado }) {
  const [plantilla, setPlantilla] = useState(e.plantilla ?? '');
  const [grupo, setGrupo] = useState(e.grupo ?? '');
  const [jid, setJid] = useState(e.grupo_jid ?? '');
  const [estado, setEstado] = useState('');
  const editable = e.clave === 'daily'; // las llamadas salen por avisar-llamadas.py, con su grupo fijo

  async function etiquetar() {
    try {
      await editarTheoEnvio(e.clave, { etiquetar: !e.etiquetar });
      onGuardado();
    } catch (err) {
      setEstado(err.message);
    }
  }

  async function guardar() {
    setEstado('Guardando…');
    try {
      await editarTheoEnvio(e.clave, {
        grupo, grupo_jid: jid, ...(e.plantilla != null ? { plantilla } : {}),
      });
      setEstado('Guardado. Vale desde el próximo envío.');
      onGuardado();
    } catch (err) {
      setEstado(err.message);
    }
  }

  return (
    <Card flush className="th-det">
      <div className="th-dh">
        <h2>{e.nombre}</h2>
        <div className="th-meta"><span><b>{e.cuando}</b></span><span>→ <b>{e.grupo ?? 'sin grupo'}</b></span></div>
      </div>
      {editable ? (
        <div className="th-campos">
          <label>Nombre del grupo<input value={grupo} onChange={(ev) => setGrupo(ev.target.value)} /></label>
          <label>ID del grupo de WhatsApp<input value={jid} onChange={(ev) => setJid(ev.target.value)} placeholder="120363…@g.us" /></label>
          <div className="th-etiquetar">
            <button type="button" className="th-switch" role="switch" aria-checked={e.etiquetar}
              aria-label="Etiquetar a todos" onClick={etiquetar} />
            <span><b>Etiquetar a todos</b><small>Cada uno de la lista va como mención: le llega el aviso aunque tenga el grupo silenciado.</small></span>
          </div>
          {e.plantilla != null && (
            <label>Plantilla
              <textarea className="th-edit" style={{ minHeight: 130 }} value={plantilla} onChange={(ev) => setPlantilla(ev.target.value)} />
              <span className="th-vars">{(e.variables ?? []).map((v) => <code key={v}>{v}</code>)}</span>
            </label>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="button" className="btn primary" onClick={guardar}>Guardar</button>
            <span className="dim">{estado}</span>
          </div>
        </div>
      ) : null}
      {e.nota && <div className="th-nota">{e.nota}</div>}
      {e.actualizado_por && <div className="th-nota">Último cambio: {e.actualizado_por}.</div>}
    </Card>
  );
}

/* ------------------------------------------------------------------ la semana en grilla */

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ESTADO_CELDA = {
  enviado: 'Salió', fallido: 'Falló', frenado: 'Frenado', pendiente: 'En cola', programado: 'Todavía no',
  no_salio: 'No salió', sin_llamadas: 'Sin llamadas', sin_registro: 'Sin registro',
};

function sumar(iso, dias) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Domingo a sábado, un grupo por fila: cada automatización pintada según si salió. */
function Semana() {
  const [desde, setDesde] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const [abierto, setAbierto] = useState(null); // { item, grupo, jid, fecha }
  useEffect(() => {
    let vivo = true;
    getTheoSemana(desde).then((r) => vivo && (setData(r), setError(null))).catch((e) => vivo && setError(e));
    return () => { vivo = false; };
  }, [desde, tick]);

  if (error && !data) return <div style={{ marginTop: 16 }}><ErrorState error={error} /></div>;
  if (!data) return <div style={{ marginTop: 16 }}><SkeletonBlock height={320} /></div>;
  const dias = data.filas[0]?.dias.map((d) => d.fecha) ?? [];
  const esActual = dias.includes(data.hoy);

  return (
    <section className="th-semana">
      <div className="th-semana-cab">
        <div className="dl-weeknav">
          <button type="button" className="btn ghost sm" onClick={() => setDesde(sumar(data.desde, -7))} aria-label="Semana anterior">←</button>
          <b>Semana del {fechaCorta(data.desde)} al {fechaCorta(sumar(data.desde, 6))}</b>
          <button type="button" className="btn ghost sm" disabled={esActual} onClick={() => setDesde(sumar(data.desde, 7))} aria-label="Semana siguiente">→</button>
        </div>
        <div className="th-leyenda">
          <span><i className="enviado" />Salió</span>
          <span><i className="no_salio" />No salió o falló</span>
          <span><i className="programado" />Todavía no le toca</span>
          <span><i className="sin_registro" />Ops no lo registra</span>
        </div>
      </div>
      <div className="th-grilla-scroll">
        <div className="th-grilla">
          <div className="th-g-cab th-g-grupo">Grupo</div>
          {dias.map((f, i) => (
            <div key={f} className={`th-g-cab${f === data.hoy ? ' hoy' : ''}`}>{DIAS_SEMANA[i]}<small>{fechaCorta(f)}</small></div>
          ))}
          {data.filas.map((fila) => (
            <Fila key={fila.grupo} fila={fila} hoy={data.hoy}
              onAbrir={(item, fecha) => setAbierto({ item, fecha, grupo: fila.grupo, jid: fila.jid })} />
          ))}
        </div>
      </div>
      {abierto && <Evento ev={abierto} etiquetas={data.etiquetas} onCerrar={() => setAbierto(null)} onCambio={() => setTick((n) => n + 1)} />}
    </section>
  );
}

function Fila({ fila, hoy, onAbrir }) {
  return (
    <>
      <div className="th-g-grupo th-g-nombre">{fila.grupo}</div>
      {fila.dias.map((d) => (
        <div key={d.fecha} className={`th-g-celda${d.fecha === hoy ? ' hoy' : ''}`}>
          {d.items.map((it) => (
            <button type="button" key={it.clave} className={`th-g-item ${it.estado}`} title={`${ESTADO_CELDA[it.estado]} · ${it.detalle ?? ''}`}
              onClick={() => onAbrir(it, d.fecha)}>
              <b>{it.nombre}</b>
              {it.clave === 'llamadas' ? (
                <>
                  <span>{it.estado === 'programado' ? it.detalle
                    : it.esperadas ? `${it.enviados} de ${it.esperadas} resúmenes` : ESTADO_CELDA[it.estado]}</span>
                  {it.llamadas?.length > 0 && (
                    <ul className="th-g-llamadas">
                      {it.llamadas.map((l) => (
                        <li key={`${l.hora}-${l.quien}`} className={it.estado === 'programado' ? 'agendada' : l.estado}
                          title={l.estado === 'enviado' ? 'El resumen salió' : l.estado === 'pendiente' ? 'El resumen está en cola'
                            : l.estado === 'frenado' ? 'El resumen se frenó' : 'Todavía no llegó el Fathom'}>
                          <i>{it.estado === 'programado' ? '·' : l.estado === 'enviado' ? '✓' : l.estado === 'pendiente' ? '…' : l.estado === 'frenado' ? '–' : '✕'}</i>
                          {l.hora} {l.quien}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <span>{it.hora ? `${it.hora} · ` : ''}{ESTADO_CELDA[it.estado]}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

const fechaCorta = (iso) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };

const BORRADOR = {
  recordatorio_semana: 'Equipo 👋 recuerden preparar para mañana el documento con sus objetivos de la semana: las tareas del rol y las de desplazamiento. Lo presentamos en la weekly.',
  daily: 'Recuerden actualizar su daily en ATV Ops antes de las 23:30.',
};

/** Un evento de la grilla: su mensaje de ese día (editar, frenar, mandar ya) y mandar uno a mano. */
function Evento({ ev, etiquetas, onCerrar, onCambio }) {
  const { item, grupo, fecha } = ev;
  const [m, setM] = useState(null);
  const [texto, setTexto] = useState('');
  const [nuevo, setNuevo] = useState(BORRADOR[item.clave] ?? '');
  const [jid, setJid] = useState(ev.jid ?? '');
  const [tieneJid, setTieneJid] = useState(Boolean(ev.jid));
  const [etiquetar, setEtiquetar] = useState(grupo === 'ATV 500K');
  const con = etiquetas?.con ?? [];
  const sin = etiquetas?.sin ?? [];
  const [estado, setEstado] = useState('');

  useEffect(() => {
    if (!item.mensajeId) return;
    getTheoMensaje(item.mensajeId).then((r) => { setM(r); setTexto(r.texto); }).catch(() => {});
  }, [item.mensajeId]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  async function hacer(fn, ok) {
    setEstado('');
    try {
      const r = await fn();
      setEstado(ok);
      onCambio();
      return r;
    } catch (e) {
      setEstado(e.message);
      return null;
    }
  }

  const editable = m && (m.estado === 'pendiente' || m.estado === 'fallido');
  return (
    <div className="th-velo" onClick={onCerrar} role="presentation">
      <aside className="th-drawer" role="dialog" aria-label={item.nombre} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="th-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="th-dh">
          <span style={{ alignSelf: 'flex-start' }}><Pill tone={TONO_CELDA[item.estado] ?? 'off'}>{ESTADO_CELDA[item.estado]}</Pill></span>
          <h2>{item.nombre}</h2>
          <div className="th-meta"><span>Grupo <b>{grupo}</b></span><span><b>{fechaCorta(fecha)}</b>{item.hora ? ` · ${item.hora}` : ''}</span></div>
        </div>

        {item.clave === 'llamadas' && (
          <div className="th-nota">
            {item.llamadas?.length ? item.llamadas.map((l) => <div key={`${l.hora}${l.quien}`}>{l.hora} · {l.quien} — {l.estado.replace('_', ' ')}</div>)
              : 'No hay llamadas de venta este día.'}
            <div style={{ marginTop: 8 }}>Cada resumen se edita o se frena en "Por salir" antes de que salga.</div>
          </div>
        )}

        {m && (
          <>
            {editable ? (
              <div style={{ padding: '12px 18px' }}>
                <textarea className="th-edit" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto del mensaje" />
              </div>
            ) : (
              <div className="th-chat"><div className="th-burbuja">{m.vista || m.texto}<time>{(m.enviado_at || '').slice(11, 16)}</time></div></div>
            )}
            {editable && (
              <div className="th-acciones">
                <button type="button" className="btn" onClick={() => hacer(() => editarTheoMensaje(m.id, texto), 'Guardado.')}>Guardar</button>
                <button type="button" className="btn primary" onClick={async () => {
                  await hacer(() => editarTheoMensaje(m.id, texto), '');
                  await hacer(() => accionTheoMensaje(m.id, 'ahora'), 'Sale en el próximo minuto.');
                }}>Mandar ahora</button>
                <button type="button" className="btn ghost" onClick={() => hacer(() => accionTheoMensaje(m.id, 'frenar'), 'Frenado: no sale.')}>No mandar</button>
              </div>
            )}
          </>
        )}

        {item.clave !== 'llamadas' && (
          <div className="th-campos">
            <b style={{ fontSize: 13 }}>Mandar un mensaje ahora a {grupo}</b>
            {!tieneJid && (
              <label>Falta el ID de WhatsApp del grupo (termina en @g.us)
                <span style={{ display: 'flex', gap: 8 }}>
                  <input value={jid} onChange={(e) => setJid(e.target.value)} placeholder="120363…@g.us" style={{ flex: 1 }} />
                  <button type="button" className="btn" disabled={!jid.trim()} onClick={async () => {
                    const r = await hacer(() => guardarJidGrupoTheo(grupo, jid.trim()), 'ID del grupo guardado.');
                    if (r) setTieneJid(true);
                  }}>Guardar ID</button>
                </span>
              </label>
            )}
            <textarea className="th-edit" style={{ minHeight: 120 }} value={nuevo} onChange={(e) => setNuevo(e.target.value)}
              aria-label="Mensaje a mandar" placeholder="Escribí el mensaje" />
            <div className="th-etiquetar">
              <button type="button" className="th-switch" role="switch" aria-checked={etiquetar}
                aria-label="Etiquetar a todos" onClick={() => setEtiquetar((v) => !v)} />
              <span>
                <b>Etiquetar a todos</b>
                <small>
                  {con.length ? `Menciona a ${con.map((p) => p.nombre).join(', ')}.` : 'Nadie tiene su WhatsApp cargado todavía.'}
                  {sin.length > 0 && ` Falta el WhatsApp de ${sin.join(', ')} en Backbone → Equipo y roles.`}
                </small>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className="btn primary" disabled={!nuevo.trim() || !tieneJid}
                onClick={() => hacer(() => enviarTheoAhora(item.clave, nuevo.trim(), etiquetar), 'Listo: sale en el próximo minuto. Lo ves en "Por salir" y después en "Enviados".')}>
                Enviar ahora
              </button>
            </div>
          </div>
        )}
        {estado && <div className="th-nota">{estado}</div>}
      </aside>
    </div>
  );
}

const TONO_CELDA = { enviado: 'ok', fallido: 'alert', no_salio: 'alert', pendiente: 'warn', frenado: 'off', programado: 'off', sin_registro: 'off', sin_llamadas: 'off' };
