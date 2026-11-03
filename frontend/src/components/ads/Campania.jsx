import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatValue } from '../../lib/format.js';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import PanelCreativo from './PanelCreativo.jsx';
import Direccional from './Direccional.jsx';
import SeguidoresDia from './SeguidoresDia.jsx';

const usd = (n) => (n == null ? '—' : formatValue(n, 'usd'));
const num = (n) => (n == null ? '—' : formatValue(n, 'count'));
const pct = (n) => (n == null ? '—' : formatValue(n * 100, 'pct'));
const dec = (n, d = 1) => (n == null ? '—' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }));

const TONO_ESTADO = { corriendo: 'ok', 'con problemas': 'warn', 'en revisión': 'warn', pausada: 'off' };
const TONO_VEREDICTO = { escalar: 'ok', mantener: 'plain', pausar: 'alert', 'juntando datos': 'off' };

function diaMes(iso) {
  if (!iso) return '';
  const [, m, d] = String(iso).split('-');
  return `${Number(d)}/${Number(m)}`;
}

function cuando(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  const dia = t.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' });
  const hora = t.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
  return `${dia} ${hora}`;
}

/** Quién gana cada fila: el más barato, o el que más tiene. Con un solo creativo no gana nadie. */
function ganador(creativos, clave, menor = false) {
  const vals = creativos.map((c) => c[clave]).filter((v) => v != null);
  if (creativos.length < 2 || vals.length < 2 || new Set(vals).size < 2) return null;
  const mejor = menor ? Math.min(...vals) : Math.max(...vals);
  return creativos.find((c) => c[clave] === mejor)?.id ?? null;
}

/**
 * Una campaña de punta a punta: cuánto gastó y qué consiguió, sus creativos cara a cara con
 * el veredicto, los seguidores de la cuenta día por día y quiénes de los que comentaron califican.
 */
export default function Campania({ c, mes, mesLabel }) {
  const [abierto, setAbierto] = useState(null);
  const cerrar = useCallback(() => setAbierto(null), []);
  const { total, mide, creativos, seguidores: seg, interesados, calificacion: cal } = c;
  const deSeguidores = mide.clave === 'visitas';

  const pasos = [
    { k: 'Gasto', v: usd(total.gastoUsd), sub: c.presupuestoDiarioUsd ? `de ${usd(c.presupuestoDiarioUsd)} por día` : null },
    { k: 'Impresiones', v: num(total.impresiones), sub: `frecuencia ${dec(total.frecuencia, 2)}` },
    { k: mide.nombre, v: num(total.resultados), sub: total.costoResultadoUsd != null ? `${usd(total.costoResultadoUsd)} cada ${mide.singular}` : null,
      direccional: c.tipo === 'fm' && total.costoResultadoUsd != null },
  ];
  if (deSeguidores) {
    const extra = seg?.extra;
    pasos.push({
      k: 'Seguidores extra',
      v: extra == null ? '—' : `${extra > 0 ? '+' : ''}${extra}`,
      tenue: extra == null,
      sub: extra == null
        ? (seg?.error ? 'Instagram no contestó' : 'todavía sin un día entero')
        : `${seg.medidos} ${seg.medidos === 1 ? 'día medido' : 'días medidos'}${seg.costoExtraUsd != null ? ` · ${usd(seg.costoExtraUsd)} c/u` : ''}`,
    });
  }
  pasos.push({
    k: 'Calificados',
    v: interesados.leidos ? num(interesados.calificados) : '—',
    tenue: !interesados.leidos,
    sub: interesados.personas ? `de ${interesados.personas} que comentaron` : 'nadie comentó todavía',
  });

  const filas = [
    { k: 'Gasto', clave: 'gastoUsd', f: usd },
    { k: mide.nombre, clave: 'resultados', f: num },
    { k: `Costo por ${mide.singular}`, clave: 'costoResultadoUsd', f: usd, gana: ganador(creativos, 'costoResultadoUsd', true) },
    { k: 'Frenan el scroll (3 s)', clave: 'hook', f: pct, gana: ganador(creativos, 'hook') },
    { k: 'Llegan al 25 %', clave: 'retencion25', f: pct, gana: ganador(creativos, 'retencion25') },
    { k: 'Guardados', clave: 'guardados', f: num, gana: ganador(creativos, 'guardados') },
    { k: 'Frecuencia', clave: 'frecuencia', f: (v) => dec(v, 2) },
  ];
  const columnas = `minmax(150px, 1.1fr) repeat(${Math.max(creativos.length, 1)}, minmax(170px, 1fr))`;

  return (
    <>
      <section className="card camp">
        <div className="camp-cab">
          <div className="camp-nombre">
            <div className="camp-titulo">
              <h2>{c.nombre}</h2>
              <Pill tone={TONO_ESTADO[c.estado] ?? 'off'} dot>{c.estado}</Pill>
            </div>
            <div className="dim camp-meta">
              {[mide.nombre, c.inicio && `desde ${cuando(c.inicio)}`, c.presupuestoDiarioUsd && `${usd(c.presupuestoDiarioUsd)} por día`,
                `${c.conjuntos} ${c.conjuntos === 1 ? 'conjunto' : 'conjuntos'}`, `${creativos.length} ${creativos.length === 1 ? 'creativo' : 'creativos'}`]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
          <a href={c.link} target="_blank" rel="noreferrer" className="camp-link">Abrir en Ads Manager →</a>
        </div>
        <div className="camp-embudo">
          {pasos.map((p) => (
            <div key={p.k} className="camp-paso">
              <span className="camp-k">{p.k}</span>
              <b className={`num${p.tenue ? ' tenue' : ''}`}>{p.v}</b>
              {p.sub && <span className="dim">{p.sub}</span>}
              {p.direccional && <Direccional />}
            </div>
          ))}
        </div>
      </section>

      <div className="camp-fila">
        <Card title="Creativo contra creativo" sub="toda su vida" flush className="camp-cxc">
          {creativos.length === 0 ? (
            <p className="dim" style={{ margin: 0, padding: 18 }}>Esta campaña no tiene creativos que hayan salido.</p>
          ) : (
            <div className="cxc-scroll">
              <div className="cxc" style={{ gridTemplateColumns: columnas }}>
                <span />
                {creativos.map((cr) => (
                  <button key={cr.id} type="button" className="cxc-cab" onClick={() => setAbierto(cr)}>
                    {cr.imagen ? <img src={cr.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="cxc-sin" />}
                    <span className="cxc-txt">
                      <b>{cr.nombre}</b>
                      <Pill tone={TONO_VEREDICTO[cr.veredicto] ?? 'plain'}>{cr.veredicto}</Pill>
                    </span>
                  </button>
                ))}
                {filas.map((f) => (
                  <div key={f.k} className="cxc-fila" style={{ gridColumn: '1 / -1', gridTemplateColumns: columnas }}>
                    <span className="dim">{f.k}</span>
                    {creativos.map((cr) => (
                      <span key={cr.id} className={`num${f.gana === cr.id ? ' gana' : ''}`}>{f.f(cr[f.clave])}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Seguidores de la cuenta"
          sub="por día, hasta ayer"
          className="camp-seg"
          actions={seg?.alertaDejan?.activa && (
            <Pill tone="alert" dot>{`unfollows +50 % · ${seg.alertaDejan.racha} días seguidos`}</Pill>
          )}
        >
          {seg?.error ? (
            <p className="dim" style={{ margin: 0 }}>Instagram no contestó: {seg.error}</p>
          ) : (seg?.dias?.length ?? 0) === 0 ? (
            <p className="dim" style={{ margin: 0 }}>Instagram todavía no cerró ningún día de esta campaña.</p>
          ) : (
            <>
              <div className="legend">
                <span className="k"><i style={{ background: 'var(--s2)' }} />siguen</span>
                <span className="k"><i style={{ background: 'var(--s1)' }} />dejan de seguir</span>
                {seg.base && <span className="k dim"><i className="ideal" />dejan, lo normal</span>}
              </div>
              <SeguidoresDia dias={seg.dias} inicio={c.inicio} normalDejan={seg.base?.dejan} />
              {seg.base && (
                <div className="camp-ritmo">
                  <div>
                    <span className="dim">Antes de la campaña</span>
                    <b className="num">{`+${dec(seg.base.siguen)} / −${dec(seg.base.dejan)}`}</b>
                  </div>
                  <div>
                    <span className="dim">Neto por día</span>
                    <b className={`num${seg.base.siguen - seg.base.dejan < 0 ? ' baja' : ''}`}>
                      {`${seg.base.siguen - seg.base.dejan > 0 ? '+' : ''}${dec(seg.base.siguen - seg.base.dejan)}`}
                    </b>
                  </div>
                  {seg.medidos > 0 && (
                    <div>
                      <span className="dim">{`Con la campaña · ${seg.medidos} ${seg.medidos === 1 ? 'día' : 'días'}`}</span>
                      <b className="num">{`+${seg.siguen} / −${seg.dejan}`}</b>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Card
        title="¿Sirven los que llegan?"
        sub={`Audiencia · califica desde ${dec(cal?.corte ?? interesados.corte, 0)} puntos`}
        actions={<Link to="/marketing/audiencia" className="camp-link">Ver en Audiencia →</Link>}
        flush
      >
        <div className="camp-sirven">
          <div>
            <span className="dim">Guardados</span>
            <b className="num">{num(total.guardados)}</b>
            <span className="dim camp-sirven-sub">
              {creativos.filter((cr) => cr.guardados).map((cr) => `${cr.nombre}: ${num(cr.guardados)}`).join(' · ') || 'nadie guardó todavía'}
            </span>
          </div>
          <div>
            <span className="dim">Calificados en la campaña</span>
            <b className={`num${cal?.campania?.pct == null ? ' tenue' : ''}`}>
              {cal?.campania?.pct == null ? '—' : formatValue(cal.campania.pct, 'pct')}
            </b>
            <span className="dim camp-sirven-sub">
              {cal?.campania?.analizados
                ? `${cal.campania.calificados} de ${cal.campania.analizados} analizados${cal.campania.suficiente ? '' : ` · muestra chica (mínimo ${cal.muestraMinima ?? 30})`}`
                : 'nadie analizado desde el arranque'}
            </span>
          </div>
          <div>
            <span className="dim">Orgánico, 4 semanas antes</span>
            <b className={`num${cal?.base?.pct == null ? ' tenue' : ''}`}>
              {cal?.base?.pct == null ? '—' : formatValue(cal.base.pct, 'pct')}
            </b>
            <span className="dim camp-sirven-sub">
              {cal?.base?.analizados ? `${cal.base.calificados} de ${cal.base.analizados} analizados` : 'sin analizados en esas semanas'}
            </span>
          </div>
          <div>
            <span className="dim">Comentaron los anuncios</span>
            <b className="num">{num(interesados.personas)}</b>
            <span className="dim camp-sirven-sub">{`${num(interesados.calificados)} calificados`}</span>
          </div>
        </div>
      </Card>

      {(c.cohortes?.length ?? 0) > 0 && (
        <Card title="Cohortes de seguidores" sub="una por semana desde el arranque" flush>
          <div className="cohortes-scroll">
            <table className="cohortes">
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>Seguidores nuevos</th>
                  <th>Chats (+2 sem)</th>
                  <th>Pitches (+3 sem)</th>
                  <th>Agendas (+3 sem)</th>
                  <th>Cash (+4 sem)</th>
                </tr>
              </thead>
              <tbody>
                {c.cohortes.map((f) => (
                  <tr key={f.desde}>
                    <td>
                      {`${diaMes(f.desde)} – ${diaMes(f.hasta)}`}
                      {!f.completa && <span className="dim"> · en curso</span>}
                    </td>
                    <td className="num">{num(f.seguidores)}</td>
                    {['chats', 'pitches', 'agendas', 'cashUsd'].map((k) => (
                      <td key={k} className="num">
                        {f[k] == null
                          ? <span className="cohorte-espera" title={`Se completa el ${diaMes(f[`${k}ListaEl`])}`}>{diaMes(f[`${k}ListaEl`])}</span>
                          : (k === 'cashUsd' ? usd(f[k]) : num(f[k]))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {abierto && <PanelCreativo cr={abierto} mes={mes} mesLabel={mesLabel} onCerrar={cerrar} />}
    </>
  );
}
