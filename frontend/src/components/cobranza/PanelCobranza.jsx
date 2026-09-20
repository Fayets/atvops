import { useMemo } from 'react';
import Bars from '../charts/Bars.jsx';
import LineArea from '../charts/LineArea.jsx';
import Card from '../ui/Card.jsx';
import PanelArea, { n, pct } from '../ui/PanelArea.jsx';

/**
 * Cobranza vista desde dirección: cuánta plata había que cobrar y cuánta entró.
 *
 * La pregunta de acá no es cuántas cuotas hay, es cuánto falta y hace cuánto. Una cuota
 * de hace tres meses y una de ayer se cobran distinto, y por eso lo vencido se abre por
 * antigüedad en vez de mostrarse como un número solo.
 */

const TRAMOS = [
  { label: '1 a 7 días', min: 1, max: 7 },
  { label: '8 a 30', min: 8, max: 30 },
  { label: '31 a 60', min: 31, max: 60 },
  { label: 'más de 60', min: 61, max: Infinity },
];

const dia = (iso) => (iso ? iso.slice(8, 10) : null);

export default function PanelCobranza({ data }) {
  // `getCobranza` ya dejó los números del mes en la raíz y la lista de vencidas aparte.
  const cartera = data?.cartera ?? {};
  const cuotas = data?.cuotas ?? [];
  const vencidas = data?.listaVencidas ?? [];
  const cobrado = data?.cobrado ?? 0;
  const totalMes = data?.totalMes ?? 0;
  const pendiente = Math.max(totalMes - cobrado, 0);
  const vencidoUsd = data?.vencidas?.usd ?? 0;

  // Día por día: lo que iba venciendo contra lo que se fue cobrando. La distancia entre
  // las dos líneas es la deuda del mes, y se ve crecer.
  const serie = useMemo(() => {
    const dias = new Map();
    const tocar = (d) => {
      if (!dias.has(d)) dias.set(d, { label: d, vencia: 0, cobrado: 0 });
      return dias.get(d);
    };
    cuotas.forEach((c) => {
      const v = dia(c.venceAt);
      if (v) tocar(v).vencia += c.montoUsd ?? 0;
      const p = c.pagadaAt ? dia(c.pagadaAt) : null;
      if (p) tocar(p).cobrado += c.montoUsd ?? 0;
    });
    let accV = 0;
    let accC = 0;
    return [...dias.values()]
      .sort((a, b) => Number(a.label) - Number(b.label))
      .map((d) => {
        accV += d.vencia;
        accC += d.cobrado;
        return { ...d, venciaAcum: Math.round(accV), cobradoAcum: Math.round(accC) };
      });
  }, [cuotas]);

  const porTramo = useMemo(
    () => TRAMOS.map((t) => {
      const suyas = vencidas.filter((c) => (c.diasVencida ?? c.diasAtraso ?? 0) >= t.min
        && (c.diasVencida ?? c.diasAtraso ?? 0) <= t.max);
      return { label: t.label, usd: suyas.reduce((s, c) => s + (c.montoUsd ?? 0), 0), cuotas: suyas.length };
    }),
    [vencidas],
  );

  return (
    <PanelArea
      kpis={[
        { label: 'Cobrado del mes', valor: n(cobrado, 'usd'), tono: cobrado > 0 ? 'ok' : null,
          nota: `${pct(data?.pctSobreVencido)} de las ${n(cuotas.length)} cuotas que vencían este mes` },
        { label: 'Falta cobrar', valor: n(pendiente, 'usd'), tono: pendiente > 0 ? 'warn' : null,
          nota: 'de lo que vencía este mes y todavía no entró' },
        { label: 'Vencido', valor: n(vencidoUsd, 'usd'), tono: vencidoUsd > 0 ? 'alert' : null,
          nota: `${n(vencidas.length)} cuotas pasadas de fecha, de todos los meses` },
        { label: 'Total del mes', valor: n(totalMes, 'usd'),
          nota: 'todo lo que vencía en el mes, cobrado o no' },
        { label: 'Deuda de la cartera', valor: n(cartera.deudaUsd, 'usd'),
          nota: `${n(cartera.vigentes)} clientes vigentes de ${n(cartera.clientes)}` },
        { label: 'Cobrado histórico', valor: n(cartera.cobradoHistoricoUsd, 'usd'),
          nota: 'todo lo que entró desde que se lleva registro' },
      ]}
    >
      <Card
        title="Lo que vencía y lo que entró"
        sub="Acumulado del mes, día por día"
        foot="La distancia entre las dos líneas es la deuda del mes. Si se abre y no se vuelve a juntar, lo que falta no se está cobrando tarde: no se está cobrando."
      >
        <LineArea
          data={serie} x={(d) => d.label} height={190} format="usd"
          series={[
            { key: (d) => d.venciaAcum, label: 'Vencía', color: 'var(--s3)' },
            { key: (d) => d.cobradoAcum, label: 'Cobrado', color: 'var(--s5)' },
          ]}
        />
      </Card>

      <Card
        title="Lo vencido, por antigüedad"
        sub="Cuánta plata hay en cada tramo"
        foot="Una cuota de hace tres meses y una de ayer no se cobran igual. Lo de más de 60 días es lo que hay que decidir si se reclama o se da por perdido."
      >
        <Bars
          data={porTramo} x={(d) => d.label} y={(d) => d.usd} format="usd" label="Vencido"
          color={(d) => (d.label === 'más de 60' ? 'var(--alert)' : d.label === '31 a 60' ? 'var(--warn)' : 'var(--s4)')}
          height={190}
          linea={{ key: (d) => d.cuotas, label: 'Cuotas', format: 'count', escala: 'propia' }}
        />
      </Card>
    </PanelArea>
  );
}
