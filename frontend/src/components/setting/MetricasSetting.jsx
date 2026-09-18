import { useEffect, useRef, useState } from 'react';
import Card from '../ui/Card.jsx';
import { SkeletonBlock } from '../ui/Loading.jsx';
import Pill from '../ui/Pill.jsx';
import TasasEmbudo from './TasasEmbudo.jsx';
import { borrarTodosLosPitches, getMetricasSetting, getRespaldoSetting, restaurarRespaldoSetting } from '../../data/api.js';
import { descargarJson, limites, pct, zona } from '../../lib/setting.js';

const PERIODOS = [['hoy', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['todo', 'All-time']];
const RANGOS = { booking: [30, 20], show: [80, 65], close: [25, 15] };

/**
 * La pestaña Métricas: las tasas por período, dónde conviene trabajar, las últimas seis
 * semanas y la data (respaldo, restaurar, borrar).
 *
 * @param {{ pitches: object[], sesiones: number, hoy: string, tick: number, onRecargar: () => void }} props
 */
export default function MetricasSetting({ pitches, sesiones = 0, hoy, tick, onRecargar }) {
  const [periodo, setPeriodo] = useState('mes');
  const [m, setM] = useState(null);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const archivo = useRef(null);

  useEffect(() => {
    let vivo = true;
    getMetricasSetting(limites(periodo, hoy)).then((d) => vivo && setM(d)).catch(() => vivo && setM(null));
    return () => { vivo = false; };
  }, [periodo, hoy, tick]);

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
      const datos = JSON.parse(await f.text());
      const r = await restaurarRespaldoSetting(datos);
      setAviso(`Restaurado: ${r.pitches.creados} pitches nuevos, ${r.pitches.actualizados} actualizados; ${r.sesiones.creadas} sesiones nuevas.`);
      onRecargar();
    } catch (err) {
      setAviso(err.message || 'No se pudo leer el archivo.');
    } finally {
      setOcupado(false);
    }
  };
  const borrarTodo = async () => {
    if (!window.confirm('¿Borrar TODOS los pitches? Bajá un respaldo antes: se recuperan solo restaurándolo.')) return;
    setOcupado(true);
    try {
      const r = await borrarTodosLosPitches();
      setAviso(`Se borraron ${r.borrados} pitches.`);
      onRecargar();
    } catch (err) {
      setAviso(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const peor = m?.dondeConviene?.find((e) => e.id === m.peorEtapa);

  return (
    <>
      <div className="sets-barra">
        <div className="tabs sm">
          {PERIODOS.map(([v, l]) => (
            <button key={v} type="button" className={`tab${periodo === v ? ' active' : ''}`} onClick={() => setPeriodo(v)}>{l}</button>
          ))}
        </div>
        {m && (
          <span className="dim">
            {m.porOrigen.organico} orgánico · {m.porOrigen.ads} ads · cash {new Intl.NumberFormat('es-AR').format(m.cashUsd)} USD
          </span>
        )}
      </div>

      <Card title="Tasas y embudo">
        {!m ? <SkeletonBlock height={180} /> : <TasasEmbudo m={m} />}
      </Card>

      <Card
        title="Dónde conviene trabajar"
        sub={peor ? `La etapa más lejos de su rango sano: ${peor.etapa}` : 'Las tres etapas están en rango'}
        flush
        foot="+10 pts: cuántos cierres más saldrían del mismo volumen si esa tasa subiera diez puntos, dejando las otras como están."
      >
        {!m ? <SkeletonBlock height={120} /> : (
          <div className="proy-tabla conviene">
            <div className="proy-fila cabecera"><span>Etapa</span><span>Tasa</span><span>Perdidos</span><span>+10 pts</span></div>
            {m.dondeConviene.map((e) => (
              <div key={e.id} className={`proy-fila${e.id === m.peorEtapa ? ' peor' : ''}`}>
                <span className="strong">{e.etapa}{e.id === m.peorEtapa && <Pill tone={e.zona === 'warn' ? 'warn' : 'alert'} dot>acá</Pill>}</span>
                <span className={`num${zona(e.tasa, ...RANGOS[e.id])}`}>{pct(e.tasa)}</span>
                <span className="num">{e.perdidos}</span>
                <span className="num">+{e.masDiez} {e.masDiez === 1 ? 'cierre' : 'cierres'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Últimas seis semanas" sub="Lo que hizo cada semana y lo que convirtió" flush>
        {!m ? <SkeletonBlock height={200} /> : (
          <div className="proy-tabla semanas">
            <div className="proy-fila cabecera">
              <span>Semana</span><span>Pitch</span><span>Agendas</span><span>Shows</span><span>Cierres</span>
              <span>Book</span><span>Show</span><span>Close</span><span>Setting</span>
            </div>
            {m.semanas.map((s) => (
              <div key={s.semana} className="proy-fila">
                <span className="strong">{s.etiqueta}</span>
                <span className="num">{s.pitches}</span><span className="num">{s.agendas}</span>
                <span className="num">{s.shows}</span><span className="num">{s.cierres}</span>
                <span className={`num${zona(s.booking, ...RANGOS.booking)}`}>{pct(s.booking)}</span>
                <span className={`num${zona(s.show, ...RANGOS.show)}`}>{pct(s.show)}</span>
                <span className={`num${zona(s.close, ...RANGOS.close)}`}>{pct(s.close)}</span>
                <span className="num dim">{pct(s.setting)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Data"
        sub={`${pitches.length} ${pitches.length === 1 ? 'lead' : 'leads'} · ${sesiones} ${sesiones === 1 ? 'sesión' : 'sesiones'} de notas`}
        foot="El respaldo trae pitches, transcripciones y notas en JSON. Se abre también en SetSystem. Los audios se bajan desde cada sesión."
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
