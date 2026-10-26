import AccionesSemana from '../components/home/AccionesSemana.jsx';
import ResumenArea from '../components/home/ResumenArea.jsx';
import Bar from '../components/ui/Bar.jsx';
import { ErrorState, SkeletonBlock } from '../components/ui/Loading.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pill from '../components/ui/Pill.jsx';
import { getHome } from '../data/api.js';
import { formatFecha, formatValue } from '../lib/format.js';
import { useMes } from '../lib/MesContext.jsx';
import { useResource } from '../lib/hooks.js';
import { ESTADO_RITMO } from '../lib/pacing.js';

/**
 * Adónde lleva cada meta: a la pantalla donde están las filas que la formaron, no a la
 * portada del área. Las agendas y los cierres son el registro de llamadas; el cash es
 * Caja 1; los chats se desarman en la propia home de Marketing.
 */
const PANTALLA_DE_LA_META = {
  mkt_agendas: '/ventas/llamadas',
  ven_cierres: '/ventas/llamadas',
  ven_cash: '/ventas/caja',
};

/** Las metas decretadas de un área, con la forma que espera la tarjeta. */
function metricasDe(metas = [], href) {
  return metas.slice(0, 3).map(({ meta, ritmo }) => ({
    label: meta.nombre,
    valor: meta.acumulado.at(-1) ?? 0,
    format: meta.format,
    meta: Number(meta.meta) > 0 ? meta.meta : null,
    tono: ritmo.estado === 'critico' ? 'alert' : ritmo.estado === 'atrasado' ? 'warn' : 'ok',
    nota: Number(meta.meta) > 0
      ? `esperado a hoy ${formatValue(Math.round(ritmo.esperado), meta.format)}`
      : 'sin meta decretada',
    // Una meta no trae las filas que la formaron: el acumulado diario que viaja con
    // ella está repartido en línea recta, no es lo que pasó cada día. El clic lleva a
    // la pantalla que sí las tiene.
    href: PANTALLA_DE_LA_META[meta.id] ?? href,
  }));
}

/** Las cuotas de cobranza como tabla: siempre las mismas columnas. */
const COL_CUOTAS = [
  { clave: 'cliente', label: 'Cliente' },
  { clave: 'plan', label: 'Plan', ancho: 110 },
  { clave: 'venceAt', label: 'Vencía', ancho: 110, render: (f) => formatFecha(f.venceAt) },
  { clave: 'estado', label: 'Cómo está', ancho: 210, render: (f) => (
    f.estado === 'pagada' ? `pagada el ${formatFecha(f.pagadaAt ?? f.pagoAt)}`
      : f.estado === 'vencida' ? `${f.diasAtraso ?? f.diasVencida ?? 0} días de atraso`
        : 'todavía no vence') },
  { clave: 'montoUsd', label: 'Monto', align: 'right', ancho: 130, format: 'usd' },
];

const suma = (filas) => formatValue(filas.reduce((s, f) => s + (f.montoUsd ?? 0), 0), 'usd');

/**
 * Las cuotas partidas en las dos cajas, igual que la plata que entra.
 *
 * Una cuota de venta y un upsell no se reclaman igual ni le tocan a la misma persona, y
 * en una lista sola el total no dice cuál de los dos negocios está atrasado.
 */
function detalleCuotas(titulo, sub, filas) {
  const uno = filas.filter((f) => f.caja !== 2);
  const dos = filas.filter((f) => f.caja === 2);
  return {
    titulo,
    sub,
    enColumnas: true,
    columnas: COL_CUOTAS,
    grupos: [
      { titulo: 'Caja 1 · ventas nuevas', filas: uno, total: suma(uno) },
      { titulo: 'Caja 2 · upsells y recompras', filas: dos, total: suma(dos) },
    ],
  };
}

const COL_PAGOS = [
  { clave: 'cliente', label: 'Cliente' },
  { clave: 'tipo', label: 'Qué fue', ancho: 150 },
  { clave: 'pagoAt', label: 'Entró', ancho: 130, render: (f) => formatFecha(f.pagoAt) },
  { clave: 'montoUsd', label: 'Monto', align: 'right', ancho: 130, format: 'usd' },
];

/**
 * La plata que entró en el mes, pago por pago y partida en las dos cajas.
 *
 * Caja 1 es la cuota de una venta nueva y sus señas; caja 2 es upsell y recompra. Un mes
 * puede cerrar igual con las dos mitades dadas vuelta y querer decir cosas opuestas.
 */
function detalleCaja(filas) {
  const uno = filas.filter((f) => f.caja === 1);
  const dos = filas.filter((f) => f.caja === 2);
  return {
    titulo: 'La plata que entró este mes',
    sub: 'Por fecha de pago. Es el mismo número que muestra ATV Clients.',
    enColumnas: true,
    columnas: COL_PAGOS,
    grupos: [
      { titulo: 'Caja 1 · ventas nuevas y señas', filas: uno, total: suma(uno), unidad: 'pago' },
      { titulo: 'Caja 2 · upsells y recompras', filas: dos, total: suma(dos), unidad: 'pago' },
    ],
  };
}

/** Solo la caja 2, que es la que se mira aparte: la que hay que generar. */
function detalleCaja2(filas) {
  const dos = filas.filter((f) => f.caja === 2);
  return {
    titulo: 'Caja 2 del mes',
    sub: 'Upsells y recompras de clientes que ya estaban',
    columnas: COL_PAGOS,
    grupos: [{ titulo: 'En total', filas: dos, total: suma(dos), unidad: 'pago' }],
  };
}

/** Los clientes de un color del semáforo, del peor score al mejor. */
function detalleSemaforo(color, clientes, activos) {
  return {
    titulo: `Clientes en ${color}`,
    sub: `${clientes.length} de ${activos} clientes activos`,
    columnas: [
      { clave: 'nombre', label: 'Cliente' },
      { clave: 'plan', label: 'Plan', ancho: 140 },
      { clave: 'score', label: 'Score', align: 'right', ancho: 90, render: (f) => Math.round(f.score) },
      { clave: 'ultimo', label: 'Último mensaje del cliente', ancho: 220 },
    ],
    grupos: [{ filas: clientes }],
  };
}

/** La meta que manda para juzgar el área: la principal si está decretada, si no la
 *  primera que lo esté. Sin ninguna, el área no se juzga. */
function metaQueManda(area) {
  const conMeta = (area.metas ?? []).filter((m) => Number(m.meta?.meta) > 0);
  if (Number(area.principal?.meta?.meta) > 0) return area.principal;
  return conMeta[0] ?? null;
}

export default function Home() {
  const { mes: mesId } = useMes();
  const { data, loading, error } = useResource(() => getHome(mesId), [mesId]);

  if (error) return <div className="page"><ErrorState error={error} /></div>;
  if (loading || !data) {
    return (
      <div className="page">
        <SkeletonBlock height={90} />
        <SkeletonBlock height={260} />
        <SkeletonBlock height={520} />
      </div>
    );
  }

  const { mes, semana, acciones, marketing, ventas, fulfillment, cobranza } = data;
  const pctMes = Math.round(mes.fraccion * 100);
  const mandaVentas = metaQueManda(ventas);
  const mandaMkt = metaQueManda(marketing);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Cuadro de mando"
        title={`${mes.nombre} · día ${mes.dia} de ${mes.dias}`}
      />

      <div className="mes-head">
        <div className="mes-progreso">
          <div className="row">
            <span>
              <b>{pctMes}%</b> del mes transcurrido
            </span>
            <span>
              {mes.dias - mes.dia} días para cerrar · semana {semana}
            </span>
          </div>
          <Bar pct={pctMes} tone="brand" />
        </div>
      </div>

      <AccionesSemana acciones={acciones} semana={semana} />

      <div className="areas-titulo">El mes, área por área</div>

      <div className="areas-resumen">
        <ResumenArea
          titulo="Ventas" dueno={ventas.dueno} href="/ventas"
          estado={mandaVentas ? ESTADO_RITMO[mandaVentas.ritmo.estado] : undefined}
          metricas={metricasDe(ventas.metas, '/ventas')}
          pie={mandaVentas
            ? `${mandaVentas.meta.nombre}: proyecta ${formatValue(Math.round(mandaVentas.ritmo.proyeccion), mandaVentas.meta.format)} sobre ${formatValue(mandaVentas.meta.meta, mandaVentas.meta.format)}.`
            : 'Todavía no hay metas decretadas para el mes.'}
        />

        <ResumenArea
          titulo="Marketing" dueno={marketing.dueno} href="/marketing"
          estado={mandaMkt ? ESTADO_RITMO[mandaMkt.ritmo.estado] : undefined}
          metricas={metricasDe(marketing.metas, '/marketing')}
          pie={mandaMkt
            ? `${mandaMkt.meta.nombre}: hacen falta ${formatValue(Math.round(mandaMkt.ritmo.necesarioSemana), mandaMkt.meta.format)} por semana para llegar.`
            : 'Todavía no hay metas decretadas para el mes.'}
        />

        <ResumenArea
          titulo="Fulfillment" dueno="Franco" href="/fulfillment"
          estado={fulfillment.semaforoTotales.rojo > fulfillment.semaforoTotales.verde
            ? { tone: 'alert', label: 'en rojo' }
            : { tone: 'ok', label: 'sana' }}
          metricas={[
            { label: 'En rojo', valor: fulfillment.semaforoTotales.rojo, tono: 'alert',
              nota: `de ${fulfillment.activos ?? '—'} clientes activos`,
              detalle: detalleSemaforo('rojo', fulfillment.porSemaforo?.rojo ?? [], fulfillment.activos) },
            { label: 'Amarillo', valor: fulfillment.semaforoTotales.amarillo, tono: 'warn',
              nota: 'para mirar esta semana',
              detalle: detalleSemaforo('amarillo', fulfillment.porSemaforo?.amarillo ?? [], fulfillment.activos) },
            { label: 'Verde', valor: fulfillment.semaforoTotales.verde, tono: 'ok',
              nota: 'avanzando solos',
              detalle: detalleSemaforo('verde', fulfillment.porSemaforo?.verde ?? [], fulfillment.activos) },
          ]}
          pie={fulfillment.revision?.[0]}
        />

        <ResumenArea
          titulo="Cobranza" dueno="Franco" href="/cobranza"
          estado={cobranza.unavailable ? { tone: 'off', label: 'sin datos' }
            : cobranza.vencidas.n ? { tone: 'alert', label: 'con vencidas' } : { tone: 'ok', label: 'al día' }}
          metricas={cobranza.unavailable ? [] : [
            // La plata de verdad, por fecha de pago. Antes acá iba "de lo que vencía en
            // el mes": contaba por fecha de vencimiento, así que una cuota de octubre
            // cobrada en septiembre entraba igual y el número no cerraba con nada.
            { label: 'Entró este mes', valor: cobranza.caja?.usd ?? 0, format: 'usd', tono: 'ok',
              nota: `${cobranza.caja?.pagos ?? 0} pagos · caja 1 ${formatValue(cobranza.caja?.caja1 ?? 0, 'usd')} + caja 2 ${formatValue(cobranza.caja?.caja2 ?? 0, 'usd')}`,
              detalle: detalleCaja(cobranza.cajaFilas ?? []) },
            // No es del mes: son todas las cuotas con la fecha pasada, de cuando sea. Al
            // lado de la de arriba se leía como si fueran el mismo período.
            { label: 'Vencido · toda la cartera', valor: cobranza.vencidas.usd, format: 'usd', tono: 'alert',
              nota: `${cobranza.vencidas.n} cuotas pasadas de fecha`,
              detalle: detalleCuotas('Cuotas con la fecha pasada, de toda la cartera',
                `${cobranza.vencidas.n} cuotas de ${new Set(cobranza.listaVencidas.map((c) => c.cliente)).size} clientes`,
                cobranza.listaVencidas) },
            { label: 'Vence en 7 días', valor: cobranza.porVencerSemana.usd, format: 'usd', tono: 'warn',
              nota: `${cobranza.porVencerSemana.n} cuotas por avisar`,
              detalle: detalleCuotas('Vencen en los próximos 7 días', 'Para avisar esta semana',
                cobranza.proximasSemana ?? []) },
            { label: 'Caja 2 del mes', valor: cobranza.caja?.caja2 ?? 0, format: 'usd',
              nota: 'parte de lo que entró · upsells y recompras',
              detalle: detalleCaja2(cobranza.cajaFilas ?? []) },
          ]}
          pie={cobranza.unavailable
            ? 'Sin datos de cobranza · levantá ATV Clients o revisá ATV_CLIENTS_API_URL'
            : undefined}
        />
      </div>
    </div>
  );
}
