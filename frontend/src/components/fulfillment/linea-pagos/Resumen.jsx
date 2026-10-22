import { useMemo } from 'react';
import Card from '../../ui/Card.jsx';
import {
  ESTADO, GRUPOS, PLANES, PNAME, armarResumen, fmtCorta, fmtD, pct, usd,
} from '../../../lib/lineaPagos.js';
import { Nombres } from './BotonCliente.jsx';

const n1 = (x) => x.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const porPrograma = (arr) => PLANES
  .filter((p) => arr.some((c) => c.p === p))
  .map((p) => `${PNAME[p]} ${arr.filter((c) => c.p === p).length}`)
  .join(' · ');

function Kpi({ valor, label, sub, color }) {
  return (
    <div className="lp-kpi" style={{ '--c': color }}>
      <b className="num">{valor}</b>
      <span>{label}</span>
      {sub && <small className="num">{sub}</small>}
    </div>
  );
}

function Lista({ titulo, n, abierta, children }) {
  return (
    <details className="card lp-lista" open={abierta}>
      <summary>{titulo} <span className="dim num">{n}</span></summary>
      {children}
    </details>
  );
}

/** Pestaña Resumen: grupos, vencimientos de mentorías, mes a mes, proyección y permanencia. */
export default function Resumen({ linea, clientes, planes, onElegir }) {
  const r = useMemo(() => armarResumen(clientes, planes, linea), [clientes, planes, linea]);
  const { grupos, mentorias: m } = r;
  const estado = (c) => ESTADO[c.e] || c.e;
  return (
    <div className="lp-resumen">
      <div className="lp-kpis full">
        <Kpi valor={grupos.A.length} label="A · activos en Discord" color="var(--lp-a)" />
        <Kpi valor={r.B.length} label="B · vencidos con estado activo" sub={`${r.AB.length} también en A`} color="var(--lp-b)" />
        <Kpi valor={grupos.C.length} label="C · salieron por vencimiento" color="var(--lp-c)" />
        <Kpi valor={grupos.S.length} label="Señas o adelantos" color="var(--lp-gris)" />
        <Kpi valor={grupos.O.length} label="Sin grupo" color="var(--lp-gris)" />
        <Kpi valor={r.D.length} label="D · ingresantes con inconsistencia" color="var(--lp-marca)" />
        <Kpi valor={r.E1.length + r.E2.length} label="E · cuota sin pagar" sub={`${r.E1.length} en Discord · ${r.E2.length} fuera`} color="var(--lp-marca)" />
      </div>

      <Card title="Grupos por programa" flush>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Grupo</th>{PLANES.map((p) => <th key={p} className="right">{PNAME[p]}</th>)}<th className="right">Total</th></tr>
            </thead>
            <tbody>
              {r.porPrograma.map((g) => {
                const gr = GRUPOS.find((x) => x.k === g.k);
                return (
                  <tr key={g.k}>
                    <td><span className="lp-grupo" style={{ '--c': gr.color }}>{gr.corto}</span></td>
                    {PLANES.map((p) => <td key={p} className="right num">{g[p]}</td>)}
                    <td className="right num strong">{g.n}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Mentorías: próximos vencimientos">
        <div className="lp-filas">
          <div className="lp-fila"><span>Hasta 30 días</span><span className="num">{m.m30.length}</span></div>
          <div className="lp-fila"><span>31 a 60 días</span><span className="num">{m.m60.length}</span></div>
          <div className="lp-fila"><span>61 a 90 días</span><span className="num">{m.m90.length}</span></div>
          <div className="lp-fila"><span>Ya vencidas con estado activo</span><span className="num">{m.vencidas.length}</span></div>
        </div>
        <details className="lp-detalle">
          <summary>Quiénes vencen en 90 días</summary>
          <span className="lab-k">Hasta 30 días · {m.m30.length}</span>
          <Nombres lista={m.m30} extra={(c) => fmtCorta(c.vD)} onElegir={onElegir} />
          <span className="lab-k">31 a 60 días · {m.m60.length}</span>
          <Nombres lista={m.m60} extra={(c) => fmtCorta(c.vD)} onElegir={onElegir} />
          <span className="lab-k">61 a 90 días · {m.m90.length}</span>
          <Nombres lista={m.m90} extra={(c) => fmtCorta(c.vD)} onElegir={onElegir} />
        </details>
      </Card>

      <Card className="full" title="Mes a mes" flush>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="right" title="Activos el día 1 del mes">Ya estaban</th>
                <th className="right">Altas</th>
                <th className="right" title="Vencimiento o baja anticipada con fecha">Salidas</th>
                <th className="right" title="Ya estaban + altas − salidas">Cierre</th>
                <th className="right" title="Altas sobre los que ya estaban">Tasa ing.</th>
                <th className="right" title="Salidas sobre los que ya estaban">Tasa egr.</th>
                <th className="right">1.er pago</th>
                <th className="right">Pagaron</th>
                <th className="right">USD</th>
              </tr>
            </thead>
            <tbody>
              {r.meses.map((x) => (
                <tr key={x.mes}>
                  <td>{x.mes}{x.parcial ? ' *' : ''}</td>
                  <td className="right num">{x.ya}</td>
                  <td className="right num">{x.altas}</td>
                  <td className="right num">{x.sal}</td>
                  <td className="right num strong">{x.cierre}</td>
                  <td className="right num">{pct(x.tIng)}</td>
                  <td className="right num">{pct(x.tEgr)}</td>
                  <td className="right num">{x.fpay}</td>
                  <td className="right num">{x.pagadores}</td>
                  <td className="right num">{Math.round(x.u).toLocaleString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="full" title="Proyección por duración de programa" flush>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Período</th>
                <th className="right">Activos al inicio</th>
                <th className="right" title="En curso con vencimiento en el período; sin renovaciones ni prórrogas">Vencen</th>
                <th className="right">Mentoría</th>
                <th className="right">Boost</th>
                <th className="right">Otros</th>
                <th className="right">Tasa egr.</th>
                <th className="right">Ingresos (prom.)</th>
                <th className="right">Tasa ing.</th>
                <th className="right">Cierre proy.</th>
              </tr>
            </thead>
            <tbody>
              {r.proyeccion.rows.map((x) => (
                <tr key={x.mes}>
                  <td>{x.mes}</td>
                  <td className="right num">{Math.round(x.ini)}</td>
                  <td className="right num">{x.sal}</td>
                  <td className="right num">{x.men}</td>
                  <td className="right num">{x.bo}</td>
                  <td className="right num">{x.otros}</td>
                  <td className="right num">{pct(x.tEgr)}</td>
                  <td className="right num">{n1(x.ing)}</td>
                  <td className="right num">{pct(x.tIng)}</td>
                  <td className="right num strong">{Math.round(x.cierre)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="full" title="Permanencia por programa" sub="USD en miles" flush>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Programa</th>
                <th className="right">Clientes</th>
                <th className="right">En curso</th>
                <th className="right">Terminaron</th>
                <th className="right" title={`Incluye ${r.programas.reduce((a, x) => a + x.bajaS, 0)} inactivos sin fecha de baja`}>Bajas</th>
                <th className="right" title="Mediana contractual">Duración</th>
                <th className="right" title="Mediana de días de los que terminaron">Perm. final</th>
                <th className="right" title="Promedio del programa recorrido por los que siguen">Avance</th>
                <th className="right">Cobrado</th>
                <th className="right">Deuda</th>
              </tr>
            </thead>
            <tbody>
              {r.programas.map((x) => (
                <tr key={x.p} className={planes.has(x.p) ? '' : 'lp-apagada'}>
                  <td><span className="lp-grupo" style={{ '--c': `var(--lp-${x.p})` }}>{PNAME[x.p]}</span></td>
                  <td className="right num">{x.n}</td>
                  <td className="right num">{x.cur}</td>
                  <td className="right num">{x.comp}</td>
                  <td className="right num">{x.bajaF + x.bajaS}</td>
                  <td className="right num">{x.dur ? `${Math.round(x.dur)} d` : '–'}</td>
                  <td className="right num">{x.permC != null ? `${Math.round(x.permC)} d` : '–'}</td>
                  <td className="right num">{x.avance != null ? `${Math.round(x.avance * 100)}%` : '–'}</td>
                  <td className="right num">{Math.round(x.cobrado / 1000)} k</td>
                  <td className="right num">{Math.round(x.deuda / 1000)} k</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Lista titulo="A · Discord activo" n={grupos.A.length} abierta>
        <span className="dim lp-por-programa">{porPrograma(grupos.A)}</span>
        <Nombres lista={grupos.A} extra={(c) => (c.ab ? 'A+B' : c.qm ? '?' : estado(c))} onElegir={onElegir} />
      </Lista>
      <Lista titulo="B · Vencidos" n={r.B.length}>
        <Nombres lista={r.B} extra={(c) => `${c.ab ? 'A+B · ' : ''}${fmtCorta(c.vD)}`} onElegir={onElegir} />
      </Lista>
      <Lista titulo="C · Salieron por vencimiento" n={grupos.C.length}>
        <span className="dim lp-por-programa">{porPrograma(grupos.C)}</span>
        <Nombres lista={grupos.C} extra={(c) => fmtCorta(c.vD)} onElegir={onElegir} />
      </Lista>
      <Lista titulo="D · Inconsistencias" n={r.D.length}>
        <Nombres lista={r.D} extra={(c) => c.mD[0].slice(0, 26)} onElegir={onElegir} />
      </Lista>
      <Lista titulo="E · Cuota sin pagar" n={r.E1.length + r.E2.length}>
        <span className="lab-k">E1 · sigue en Discord · {r.E1.length}</span>
        <Nombres lista={r.E1} extra={(c) => usd(c.ad)} onElegir={onElegir} />
        <span className="lab-k">E2 · fuera de Discord · {r.E2.length}</span>
        <Nombres lista={r.E2} extra={(c) => usd(c.ad)} onElegir={onElegir} />
      </Lista>
      <Lista titulo="Señas" n={grupos.S.length}>
        <Nombres lista={grupos.S} extra={(c) => usd(c.tp)} onElegir={onElegir} />
      </Lista>
      <Lista titulo="Sin grupo" n={grupos.O.length}>
        <Nombres lista={grupos.O} extra={estado} onElegir={onElegir} />
      </Lista>

      {r.anomalos.length > 0 && (
        <p className="lp-warn full">
          Revisar: {r.anomalos.map((c) => c.n).join(', ')} · inicio {fmtD(r.anomalos[0].aD)} (futuro)
        </p>
      )}
    </div>
  );
}
