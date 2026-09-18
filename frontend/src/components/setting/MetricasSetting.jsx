import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../ui/Card.jsx';
import { SkeletonBlock } from '../ui/Loading.jsx';
import MarketingSetting from './MarketingSetting.jsx';
import TasasEmbudo from './TasasEmbudo.jsx';
import {
  borrarTodosLosPitches, getMetricasSetting, getRespaldoSetting, restaurarRespaldoSetting,
} from '../../data/api.js';
import {
  CANAL_LARGO, descargarJson, dias, etiquetaPeriodo, fechaCorta, limites, money, pct, zona,
} from '../../lib/setting.js';

const PERIODOS = [['hoy', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['rango', 'Rango'], ['todo', 'All-time']];
const RANGOS = { booking: [30, 20], show: [80, 65], close: [25, 15] };
const ESTADO = { closed: 'closed', deposit: 'deposit' };

/** Un número grande con su etiqueta. */
function Dato({ valor, label }) {
  return <div className="set-dato"><span className="set-dato-valor num">{valor}</span><span className="set-dato-label dim">{label}</span></div>;
}

/**
 * La pestaña Métricas: el mismo período mirado desde ventas o desde marketing.
 *
 * Sales responde "cómo vengo": plata, velocidad, dónde conviene trabajar. Marketing
 * responde "de dónde conviene traer": qué hace cada fuente y si ya se puede afirmar.
 */
export default function MetricasSetting({ pitches, sesiones = 0, hoy, tick, onRecargar }) {
  const [periodo, setPeriodo] = useState('mes');
  const [ref, setRef] = useState(hoy);
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [vista, setVista] = useState('sales');
  const [canal, setCanal] = useState('');
  const [m, setM] = useState(null);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const archivo = useRef(null);

  const lim = useMemo(() => limites(periodo, ref, rango), [periodo, ref, rango]);
  useEffect(() => {
    let vivo = true;
    setM(null);
    getMetricasSetting({ ...lim, canal }).then((d) => vivo && setM(d)).catch(() => vivo && setM(null));
    return () => { vivo = false; };
  }, [lim, canal, tick]);

  const mover = (n) => {
    const paso = { hoy: 1, semana: 7 }[periodo];
    if (paso) {
      const d = new Date(`${ref}T12:00:00`);
      d.setDate(d.getDate() + paso * n);
      setRef(d.toISOString().slice(0, 10));
      return;
    }
    const d = new Date(`${ref}T12:00:00`);
    d.setMonth(d.getMonth() + n);
    setRef(d.toISOString().slice(0, 10));
  };

  const descargar = async () => {
    setOcupado(true);
    try {
      const r = await getRespaldoSetting();
      descargarJson(`atv-ops-setting-${hoy}.json`, r);
      setAviso(`Respaldo bajado: ${r.pitches.length} pitches y ${r.sesiones.length} sesiones.`);
    } catch (e) {
      setAviso(e.message);
    } finally {
      setOcupado(false);
    }
  };
  const restaurar = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setOcupado(true);
    try {
      const r = await restaurarRespaldoSetting(JSON.parse(await f.text()));
      setAviso(`Restaurado: ${r.pitches.creados} pitches nuevos, ${r.pitches.actualizados} actualizados; ${r.sesiones.creadas} sesiones nuevas.`);
      onRecargar();
    } catch (err) {
      setAviso(err.message || 'No se pudo leer el archivo.');
    } finally {
      setOcupado(false);
    }
  };
  const borrarTodo = async () => {
    if (!window.confirm('¿Borrar TODOS los leads? Descargá un respaldo antes: esto no se puede deshacer.')) return;
    setOcupado(true);
    try {
      const r = await borrarTodosLosPitches();
      setAviso(`Se borraron ${r.borrados} leads.`);
      onRecargar();
    } catch (err) {
      setAviso(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const cash = m?.cash;
  const conviene = m?.dondeConviene;
  const mejor = conviene?.etapas.find((e) => e.id === conviene.mejor);

  return (
    <>
      <div className="metricas-barra">
        <div className="tabs sm">
          {PERIODOS.map(([v, l]) => (
            <button key={v} type="button" className={`tab${periodo === v ? ' active' : ''}`}
              onClick={() => setPeriodo(v)}>{l}</button>
          ))}
        </div>
        {periodo !== 'todo' && periodo !== 'rango' && (
          <div className="sets-periodo">
            <button type="button" className="btn ghost icon" onClick={() => mover(-1)} aria-label="Anterior">◀</button>
            <span className="strong">{etiquetaPeriodo(periodo, lim)}</span>
            <button type="button" className="btn ghost icon" onClick={() => mover(1)} aria-label="Siguiente">▶</button>
            {ref !== hoy && <button type="button" className="btn sm" onClick={() => setRef(hoy)}>Hoy</button>}
          </div>
        )}
        {periodo === 'rango' && (
          <span className="sets-rango">
            <input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} />
            <span className="dim">a</span>
            <input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} />
          </span>
        )}
        <div className="tabs sm vista">
          <button type="button" className={`tab${vista === 'sales' ? ' active' : ''}`} onClick={() => setVista('sales')}>Sales</button>
          <button type="button" className={`tab${vista === 'marketing' ? ' active' : ''}`} onClick={() => setVista('marketing')}>Marketing</button>
        </div>
      </div>

      {vista === 'sales' && (
        <>
          <div className="diag-filtros sets-filtros">
            {[['', 'Todos'], ...Object.entries(CANAL_LARGO)].map(([v, l]) => (
              <button key={v} type="button" className={`chip${canal === v ? ' activo' : ''}`} onClick={() => setCanal(v)}>
                {l} <span className="num">{v ? pitches.filter((p) => p.canal === v).length : pitches.length}</span>
              </button>
            ))}
          </div>

          <Card>{!m ? <SkeletonBlock height={220} /> : <TasasEmbudo m={m} />}</Card>

          <Card
            title="Cash flow"
            foot={cash?.sinMonto ? `${cash.sinMonto} ${cash.sinMonto === 1 ? 'cierre' : 'cierres'} sin monto cargado — no entran en estos números.` : ''}
          >
            {!cash ? <SkeletonBlock height={90} /> : (
              <div className="set-datos">
                <Dato valor={money(cash.revenue)} label="revenue (vendido)" />
                <Dato valor={money(cash.cobrado)} label="cash collected (entró)" />
                <Dato valor={money(cash.porCobrar)} label="por cobrar" />
                <Dato valor={money(cash.ticket)} label="ticket promedio" />
                <Dato valor={money(cash.revenuePorPitch)} label="revenue por pitch" />
              </div>
            )}
          </Card>

          {cash?.cobros?.length > 0 && (
            <Card title="Cobros" flush foot={cash.porCobrar > 0 ? `Falta cobrar ${money(cash.porCobrar)} en total.` : 'No queda nada por cobrar.'}>
              <div className="proy-tabla cobros">
                <div className="proy-fila cabecera">
                  <span>Lead</span><span>Estado</span><span>Revenue</span><span>Cobrado</span><span>Falta</span>
                </div>
                {cash.cobros.map((c) => (
                  <div key={c.id} className="proy-fila">
                    <span className="strong">{c.prospecto} <span className="dim">{fechaCorta(c.cuando)}</span></span>
                    <span><span className={`pill-estado tono-${c.estado === 'closed' ? 'ok' : 'warn'}`}>{ESTADO[c.estado] ?? c.estado}</span></span>
                    <span className="num">{money(c.revenue)}</span>
                    <span className="num">{money(c.cobrado)}</span>
                    <span className={`num${c.falta > 0 ? ' zona-warn' : ' dim'}`}>{c.falta > 0 ? money(c.falta) : 'saldado'}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="dos-cards">
            <Card title="Velocidad">
              {!m ? <SkeletonBlock height={80} /> : (
                <div className="set-datos">
                  <Dato valor={pct(m.velocidad.mismoDia)} label="agenda el mismo día" />
                  <Dato valor={dias(m.velocidad.pitchAAgenda)} label="pitch → agenda" />
                  <Dato valor={dias(m.velocidad.agendaACall)} label="agenda → call" />
                </div>
              )}
            </Card>
            <Card title="Follow ups">
              {!m ? <SkeletonBlock height={80} /> : (
                <div className="set-datos">
                  <Dato valor={pct(m.followUps.desdeFollowUp)} label="de tus agendas salieron de un follow up" />
                  <Dato valor={m.followUps.promedioHastaAgendar ?? '—'} label="follow ups promedio hasta agendar" />
                  <Dato valor={m.followUps.intentosGhosteados ?? '—'} label={`intentos sin respuesta en ${m.followUps.ghosteados} que ghostearon`} />
                </div>
              )}
            </Card>
          </div>

          <Card
            title="Dónde conviene trabajar"
            sub={mejor ? mejor.etapa : ''}
            flush
            foot={`+10 pts: cuántos cierres más saldrían del mismo volumen si esa tasa subiera diez puntos, dejando las otras como están.`}
          >
            {!conviene ? <div className="empty">Todavía no hay recorrido para comparar etapas.</div> : (
              <>
                <p className="conviene-consejo">{mejor?.consejo}</p>
                <div className="proy-tabla conviene">
                  <div className="proy-fila cabecera"><span>Etapa</span><span>Tasa</span><span>Perdidos</span><span>+10 pts</span></div>
                  {conviene.etapas.map((e) => (
                    <div key={e.id} className={`proy-fila${e.id === conviene.mejor ? ' peor' : ''}`}>
                      <span className="strong">{e.etapa}</span>
                      <span className={`num${zona(e.tasa, ...RANGOS[e.id])}`}>{pct(e.tasa)}</span>
                      <span className="num dim">−{e.perdidos}</span>
                      <span className="num">+{e.ganancia}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card title="Últimas seis semanas" flush>
            {!m ? <SkeletonBlock height={200} /> : (
              <div className="proy-tabla semanas-setting">
                <div className="proy-fila cabecera">
                  <span>Semana</span><span>Pitch</span><span>Book</span><span>Show</span><span>Close</span><span>Setting</span>
                </div>
                {m.semanas.map((s) => (
                  <div key={s.semana} className="proy-fila">
                    <span className="strong">{s.etiqueta}</span>
                    <span className="num">{s.pitches}</span>
                    <span className={`num${zona(s.booking, ...RANGOS.booking)}`}>{pct(s.booking)}</span>
                    <span className={`num${zona(s.show, ...RANGOS.show)}`}>{pct(s.show)}</span>
                    <span className={`num${zona(s.close, ...RANGOS.close)}`}>{pct(s.close)}</span>
                    <span className="num dim">{pct(s.setting)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {vista === 'marketing' && (!m ? <Card><SkeletonBlock height={300} /></Card> : <MarketingSetting m={m} />)}

      <Card
        title="Data"
        sub={`${pitches.length} ${pitches.length === 1 ? 'lead' : 'leads'} · ${sesiones} ${sesiones === 1 ? 'sesión' : 'sesiones'} de notas`}
        foot="El respaldo trae los leads, las transcripciones y las notas en JSON. Se abre también en SetSystem. Los audios se bajan desde cada sesión."
      >
        <div className="data-controles">
          <button type="button" className="btn primary sm" onClick={descargar} disabled={ocupado}>Descargar respaldo</button>
          <button type="button" className="btn sm" onClick={() => archivo.current?.click()} disabled={ocupado}>Restaurar desde archivo</button>
          <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={restaurar} />
          <button type="button" className="btn sm alerta" onClick={borrarTodo} disabled={ocupado || !pitches.length}>Borrar todo</button>
        </div>
        {aviso && <p className="dim data-aviso">{aviso}</p>}
      </Card>
    </>
  );
}
