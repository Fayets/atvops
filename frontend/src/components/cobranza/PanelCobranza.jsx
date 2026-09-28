import { useMemo, useState } from 'react';
import Bars from '../charts/Bars.jsx';
import LineArea from '../charts/LineArea.jsx';
import Card from '../ui/Card.jsx';
import DeQueEsLaCaja from './DeQueEsLaCaja.jsx';
import DetalleCobranza from './DetalleCobranza.jsx';
import PanelArea, { n, pct } from '../ui/PanelArea.jsx';

/**
 * Cobranza vista desde dirección: cuánta plata había que cobrar y cuánta entró.
 *
 * La pregunta de acá no es cuántas cuotas hay, es cuánto falta y hace cuánto. Una cuota
 * de hace tres meses y una de ayer se cobran distinto, y por eso lo vencido se abre por
 * antigüedad en vez de mostrarse como un número solo.
 *
 * Los dos primeros números parecen el mismo y no lo son. "Entró en el mes" es la caja:
 * la plata con fecha de pago en el mes, venza la cuota cuando venza, y es la que tiene
 * que coincidir con ATV Clients. "De lo que vencía, entró" mide la cobranza: de las
 * cuotas con vencimiento este mes, cuántas están pagadas. Se llamaban las dos "cobrado
 * del mes" y por eso los tableros parecían pelearse.
 */

const TRAMOS = [
  { label: '1 a 7 días', min: 1, max: 7 },
  { label: '8 a 30', min: 8, max: 30 },
  { label: '31 a 60', min: 31, max: 60 },
  { label: 'más de 60', min: 61, max: Infinity },
];

const dia = (iso) => (iso ? iso.slice(8, 10) : null);

export default function PanelCobranza({ data }) {
  const [verCaja, setVerCaja] = useState(false);
  const [detalle, setDetalle] = useState(null);
  // `getCobranza` ya dejó los números del mes en la raíz y la lista de vencidas aparte.
  const cartera = data?.cartera ?? {};
  const cuotas = data?.cuotas ?? [];
  const vencidas = data?.listaVencidas ?? [];
  const cobrado = data?.cobrado ?? 0;
  const caja = data?.caja ?? { usd: 0, pagos: 0 };
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

  // Las tres partes en que se corta el mes. Las tres salen de la misma lista, así que
  // cobrado + vencido + por vencer siempre da el total del mes: se puede comprobar
  // abriendo las tarjetas una al lado de la otra.
  const delMes = useMemo(() => ({
    pagadas: cuotas.filter((c) => c.estado === 'pagada'),
    vencidas: cuotas.filter((c) => c.estado === 'vencida'),
    porVencer: cuotas.filter((c) => c.estado === 'pendiente'),
  }), [cuotas]);

  const vencidasPorTramo = useMemo(
    () => TRAMOS.map((t) => ({
      clave: t.label,
      label: t.label,
      nota: t.label === 'más de 60' ? 'lo que hay que decidir si se reclama o se da por perdido' : undefined,
      filas: vencidas.filter((c) => {
        const d = c.diasVencida ?? c.diasAtraso ?? 0;
        return d >= t.min && d <= t.max;
      }),
    })),
    [vencidas],
  );

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
        { label: 'Entró en el mes', valor: n(caja.usd, 'usd'), tono: caja.usd > 0 ? 'ok' : null,
          nota: `${n(caja.pagos)} pagos con fecha en el mes · es la caja, igual que ATV Clients`,
          // Son dos negocios sumados: cuotas de ventas nuevas y upsell/recompra. Si ATV
          // Clients no devolvió el desglose, la tarjeta no promete un detalle que no hay.
          onVer: caja.caja1 == null ? undefined : () => setVerCaja(true) },
        { label: 'De lo que vencía, entró', valor: n(cobrado, 'usd'),
          nota: `${pct(data?.pctSobreVencido)} de las ${n(cuotas.length)} cuotas que vencen este mes`,
          onVer: () => setDetalle({
            titulo: 'Las cuotas del mes que ya se cobraron',
            sub: 'Vencían en el mes y están pagadas. La fecha es la del pago, que puede caer en otro mes.',
            total: cobrado, columna: 'pagada',
            grupos: [{ clave: 'pagadas', label: 'Cobradas', filas: delMes.pagadas }],
          }) },
        { label: 'Falta cobrar', valor: n(pendiente, 'usd'), tono: pendiente > 0 ? 'warn' : null,
          nota: `${n(data?.faltaVencido, 'usd')} ya vencido · ${n(data?.faltaPorVencer, 'usd')} todavía por vencer`,
          onVer: () => setDetalle({
            titulo: 'Lo que falta cobrar del mes',
            sub: 'Dos cosas distintas: lo que ya se pasó de fecha se va a buscar hoy; lo otro todavía no se debe.',
            total: pendiente, columna: 'vence',
            grupos: [
              { clave: 'vencidas', label: 'Ya vencidas', nota: 'pasadas de fecha', filas: delMes.vencidas },
              { clave: 'porVencer', label: 'Todavía por vencer', filas: delMes.porVencer },
            ],
          }) },
        { label: 'Vencido', valor: n(vencidoUsd, 'usd'), tono: vencidoUsd > 0 ? 'alert' : null,
          nota: `${n(vencidas.length)} cuotas pasadas de fecha, de todos los meses`,
          onVer: () => setDetalle({
            titulo: 'Todo lo vencido, por antigüedad',
            sub: 'De todos los meses. Una cuota de hace tres meses y una de ayer no se cobran igual.',
            total: vencidoUsd, columna: 'atraso', grupos: vencidasPorTramo,
          }) },
        { label: 'Total del mes', valor: n(totalMes, 'usd'),
          nota: 'todo lo que vencía en el mes, cobrado o no',
          onVer: () => setDetalle({
            titulo: 'Todas las cuotas que vencen este mes',
            sub: 'Cobradas o no. Es el denominador de todo lo demás.',
            total: totalMes, columna: 'vence',
            grupos: [
              { clave: 'pagadas', label: 'Cobradas', filas: delMes.pagadas },
              { clave: 'vencidas', label: 'Vencidas sin cobrar', filas: delMes.vencidas },
              { clave: 'porVencer', label: 'Todavía por vencer', filas: delMes.porVencer },
            ],
          }) },
        { label: 'Deuda de la cartera', valor: n(cartera.deudaUsd, 'usd'),
          nota: `${n(cartera.vigentes)} clientes vigentes de ${n(cartera.clientes)}`,
          onVer: () => setDetalle({
            titulo: 'Quién debe la deuda de la cartera',
            sub: 'Todo lo que cada cliente todavía no pagó de su plan, venza cuando venza.',
            total: cartera.deudaUsd ?? 0, columna: 'ninguna',
            grupos: [
              { clave: 'vigentes', label: 'Clientes vigentes', nota: 'los que siguen activos',
                filas: (cartera.deudores ?? []).filter((d) => d.estado === 'vigente') },
              { clave: 'otros', label: 'Inactivos y dados de baja',
                nota: 'deuda de gente que ya no está: es la que se decide reclamar o perder',
                filas: (cartera.deudores ?? []).filter((d) => d.estado !== 'vigente') },
            ],
          }) },
      ]}
    >
      {verCaja && <DeQueEsLaCaja caja={caja} mes={data?.mes} onCerrar={() => setVerCaja(false)} />}
      {detalle && <DetalleCobranza {...detalle} onCerrar={() => setDetalle(null)} />}

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
