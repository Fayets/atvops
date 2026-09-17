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
  const cierres = b.cierres ?? 0;
  const ventas = b.ventas ?? 0;
  const cash = b.cashUsd ?? 0;
  const pasadas = shows + noShows + sinReportar;
  const proximas = Math.max(0, agendas - pasadas);
  const cierreTotal = agendas ? (cierres / agendas) * 100 : null;
  const porCall = agendas ? cash / agendas : null;

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
      },
      {
        id: 'show_up',
        label: '% Show up',
        value: b.showRate,
        format: 'pct',
        detalle: pasadas
          ? `${shows} de ${pasadas} pasadas`
          : 'Sin llamadas evaluables',
      },
      {
        id: 'cierre_total',
        label: '% Cierre s/ total',
        value: cierreTotal,
        format: 'pct',
        detalle: `${cierres} de ${agendas} agendas`,
      },
      {
        id: 'cierre_present',
        label: '% Cierre s/ present.',
        value: b.closeRate,
        format: 'pct',
        detalle: shows
          ? `${cierres} de ${shows} presentadas`
          : 'Sin presentaciones',
      },
      {
        id: 'por_call',
        label: '$ por call',
        value: porCall,
        format: 'usd',
        detalle: agendas
          ? `$${Math.round(cash).toLocaleString('es-AR')} ÷ ${agendas}`
          : 'Sin agendas',
      },
      {
        id: 'aov',
        label: 'AOV',
        value: b.averageSaleUsd ?? null,
        format: 'usd',
        detalle: ventas
          ? `$${Math.round(cash).toLocaleString('es-AR')} cobrado · ${ventas} ventas`
          : 'Sin ventas',
      },
    ],
  };
}
