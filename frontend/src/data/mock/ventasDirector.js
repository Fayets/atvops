/**
 * Estructura del home del Director de Ventas.
 * Los valores reales se arman en getVentasDirectorHome; acá solo la plantilla
 * de segmentos que todavía no tienen fuente (calificación de formulario, etc.).
 */

export const VENTAS_DIRECTOR_PERIODOS = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
  { value: 'rango', label: 'Rango' },
];

/** Métricas de un segmento sin fuente todavía. */
function metricasVacias(labels) {
  return labels.map(({ id, label, format }) => ({
    id,
    label,
    value: null,
    format,
    detalle: 'Sin fuente todavía',
  }));
}

/** Filas que dependen de calidad de lead / formulario (aún no conectadas). */
export function segmentosPendientes() {
  return [
    {
      id: 'calificadas',
      titulo: 'Calificadas',
      subtitulo: 'X / A / B / C / E',
      badge: '--',
      metricas: metricasVacias([
        { id: 'agendas', label: 'Agendas calif.', format: 'count' },
        { id: 'show_up', label: '% Show up calif.', format: 'pct' },
        { id: 'cierre_total', label: '% Cierre s/ total calif.', format: 'pct' },
        { id: 'cierre_present', label: '% Cierre s/ calif.', format: 'pct' },
        { id: 'por_call', label: '$ por call calif.', format: 'usd' },
        { id: 'aov', label: 'AOV calif.', format: 'usd' },
      ]),
    },
    {
      id: 'descalificadas',
      titulo: 'Descalificadas',
      subtitulo: 'D / F / Z',
      badge: '--',
      metricas: metricasVacias([
        { id: 'agendas', label: 'Agendas D/F/Z', format: 'count' },
        { id: 'show_up', label: '% Show up', format: 'pct' },
        { id: 'cierre_total', label: '% Cierre s/ total', format: 'pct' },
        { id: 'cierre_present', label: '% Cierre s/ live calls', format: 'pct' },
        { id: 'por_call', label: '$ por call', format: 'usd' },
        { id: 'aov', label: 'AOV', format: 'usd' },
      ]),
    },
  ];
}

/**
 * Fila General a partir del bloque CRM (`_bloque` / porCloser).
 * @param {object | null} b
 */
export function segmentoGeneralDesdeBloque(b) {
  if (!b) {
    return {
      id: 'general',
      titulo: 'General',
      badge: '--',
      metricas: metricasVacias([
        { id: 'agendas', label: 'Agendas', format: 'count' },
        { id: 'show_up', label: '% Show up', format: 'pct' },
        { id: 'cierre_total', label: '% Cierre s/ total', format: 'pct' },
        { id: 'cierre_present', label: '% Cierre s/ present.', format: 'pct' },
        { id: 'por_call', label: '$ por call', format: 'usd' },
        { id: 'aov', label: 'AOV', format: 'usd' },
      ]),
    };
  }

  const agendas = b.agendados ?? 0;
  const shows = b.shows ?? 0;
  const noShows = b.noShows ?? 0;
  const sinReportar = b.sinReportar ?? 0;
  // Incluye las señas de antes que se cerraron en el período: son cierres de este período.
  const cierres = b.cierres ?? 0;
  const ventas = b.ventas ?? 0;
  const cash = b.cashUsd ?? 0;
  const pasadas = shows + noShows + sinReportar;
  const proximas = Math.max(0, agendas - pasadas);
  const cierreTotal = agendas ? (cierres / agendas) * 100 : null;
  const porCall = agendas ? cash / agendas : null;

  // De dónde sale cada número: las llamadas detrás, para abrirlas al tocar la métrica.
  // Solo los resultados que tienen llamadas: cinco "nadie en este número" seguidos tapaban
  // lo que sí hay. Las que todavía no pasaron o no se cargaron no tienen resultado.
  const conLlamadas = (b.disposiciones?.tajadas ?? []).filter((t) => t.n > 0);
  const porResultado = conLlamadas.length
    ? conLlamadas.map((t) => ({ titulo: t.disposicion, nota: `${t.n}`, leads: t.leads ?? [], columnas: ['cash'] }))
    : [{ titulo: 'Con resultado cargado', leads: [], columnas: [] }];
  const shows_ = { titulo: 'Shows', leads: b.showsDetalle ?? [], columnas: ['estado'] };
  const noShows_ = { titulo: 'No shows', leads: b.noShowsDetalle ?? [], columnas: [] };
  const cierres_ = { titulo: 'Cierres', leads: b.cierresDetalle ?? [], columnas: ['cash'] };
  const ventas_ = { titulo: 'Ventas (cierres y señas)', leads: b.ventasDetalle ?? [], columnas: ['estado', 'cash'] };

  return {
    id: 'general',
    titulo: 'General',
    badge: `${agendas} agendas`,
    metricas: [
      {
        id: 'agendas',
        label: 'Agendas',
        value: agendas,
        format: 'count',
        detalle: `${proximas} próximas · ${pasadas} ya ocurrieron`,
        fuente: { explicacion: 'Cada reunión del mes, por cómo terminó.', secciones: porResultado },
      },
      {
        id: 'show_up',
        label: '% Show up',
        value: b.showRate,
        format: 'pct',
        detalle: pasadas
          ? `${shows} de ${pasadas} pasadas`
          : 'Sin llamadas evaluables',
        fuente: { explicacion: 'Shows sobre las llamadas que ya pasaron.', secciones: [shows_, noShows_] },
      },
      {
        id: 'cierre_total',
        label: '% Cierre s/ total',
        value: cierreTotal,
        format: 'pct',
        detalle: `${cierres} de ${agendas} agendas`,
        fuente: { explicacion: `Cierres sobre las ${agendas} agendas del mes. Las señas no cuentan.`, secciones: [cierres_] },
      },
      {
        id: 'cierre_present',
        label: '% Cierre s/ present.',
        value: b.closeRate,
        format: 'pct',
        detalle: shows
          ? `${cierres} de ${shows} presentadas`
          : 'Sin presentaciones',
        fuente: { explicacion: 'Cierres sobre los que se presentaron.', secciones: [cierres_, shows_] },
      },
      {
        id: 'por_call',
        label: '$ por call',
        value: porCall,
        format: 'usd',
        detalle: agendas
          ? `$${Math.round(cash).toLocaleString('es-AR')} ÷ ${agendas}`
          : 'Sin agendas',
        fuente: { explicacion: `El cash del mes dividido por las ${agendas} agendas.`, secciones: [ventas_] },
      },
      {
        id: 'aov',
        label: 'AOV',
        value: b.averageSaleUsd ?? null,
        format: 'usd',
        detalle: ventas
          ? `$${Math.round(cash).toLocaleString('es-AR')} cobrado · ${ventas} ventas`
          : 'Sin ventas',
        fuente: { explicacion: 'El cash cobrado dividido por los cierres.', secciones: [ventas_] },
      },
    ],
  };
}
