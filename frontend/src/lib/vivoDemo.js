/**
 * Datos inventados para la maqueta del vivo (`/webinars/:id/vivo?demo=1`).
 *
 * Existe para poder mirar la pantalla llena antes de que haya un webinar de verdad: con
 * todo en cero no se puede decidir si el diseño sirve. Es determinista —misma semilla,
 * mismos números— así que dos personas mirando la maqueta discuten lo mismo.
 *
 * Se borra entera cuando la pantalla esté aprobada: este archivo y el `?demo=1` de
 * WebinarVivo.jsx, nada más.
 */

// Congruencial lineal: alcanza para datos de maqueta y no trae una dependencia.
function azar(semilla) {
  let s = semilla;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const NOMBRES = [
  'Ana Ruiz', 'Beto Paz', 'Cami Soto', 'Darío Luna', 'Eli Vera', 'Fran Gil', 'Gina Mota',
  'Hugo Díaz', 'Iván Cruz', 'Jime Roca', 'Kevin Ortiz', 'Lu Medina', 'Maxi Peña',
  'Nadia Sosa', 'Omar Vidal', 'Pía López', 'Rocío Mena', 'Seba Núñez', 'Tomi Arce',
  'Vale Ríos', 'Wal Ferrer', 'Xime Ávila', 'Yago Britos', 'Zoe Campos', 'Ale Duarte',
  'Bruno Serra', 'Ceci Aguirre', 'Diego Maffei', 'Emi Lozano', 'Flor Bustos',
];

export function vivoDemo() {
  const r = azar(20260928);
  const optins = 348;
  const inscriptos = 180;
  const duracion = 78;
  const minutoPitch = 52;
  const arranque = new Date(Date.now() - duracion * 60000);
  const iso = (min) => new Date(arranque.getTime() + min * 60000).toISOString();

  // Quién entró y cuándo se fue. Un tercio se va antes del pitch: es el caso que la
  // pantalla tiene que dejar ver mientras todavía se puede hacer algo.
  const gente = [];
  for (let i = 0; i < inscriptos; i += 1) {
    const nombre = `${NOMBRES[i % NOMBRES.length]}${i >= NOMBRES.length ? ` ${Math.floor(i / NOMBRES.length) + 1}` : ''}`;
    if (r() >= 0.69) { gente.push({ nombre, entra: null, sale: null }); continue; }
    // Un goteo entra tarde, como pasa siempre. Sin esto, todos los movimientos
    // recientes son salidas y el feed cuenta una historia peor que la real.
    const tarde = r() < 0.12;
    const entra = tarde
      ? 22 + Math.floor(r() * (duracion - 26))
      : Math.floor(r() * 14);
    const suerte = r();
    // La mayoría se queda hasta el final; los que se van, se van casi todos después
    // del pitch. Es un webinar que salió bien, que es lo que la maqueta tiene que mostrar.
    let sale = null;
    if (suerte < 0.1) sale = entra + 12 + Math.floor(r() * (minutoPitch - entra - 14));
    else if (suerte < 0.32) sale = minutoPitch + 4 + Math.floor(r() * 20);
    gente.push({ nombre, entra, sale });
  }

  const dentroEn = (min) =>
    gente.filter((g) => g.entra !== null && g.entra <= min && (g.sale === null || g.sale > min)).length;

  const serie = [];
  for (let m = 0; m <= duracion; m += 1) serie.push({ minuto: m, at: iso(m), conectados: dentroEn(m) });
  const pico = Math.max(...serie.map((p) => p.conectados));
  const picoMin = serie.find((p) => p.conectados === pico).minuto;
  const conectados = dentroEn(duracion);
  const distintos = gente.filter((g) => g.entra !== null).length;

  const butacas = gente.map((g) => ({
    nombre: g.nombre,
    email: `${g.nombre.split(' ')[0].toLowerCase()}@mail.com`,
    estado: g.entra === null ? 'vacia' : (g.sale === null ? 'adentro' : 'estuvo'),
    inscripto: true,
  }));

  const movimientos = gente
    .flatMap((g) => [
      ...(g.entra !== null ? [{ tipo: 'entra', quien: g.nombre, min: g.entra }] : []),
      ...(g.sale !== null ? [{ tipo: 'sale', quien: g.nombre, min: g.sale }] : []),
    ])
    .sort((a, b) => b.min - a.min)
    .slice(0, 25)
    .map((m) => ({ ...m, at: iso(m.min) }));

  // Retención por tramo: cuánta gente quedaba en cada cuarto del webinar, contra el pico.
  const tramos = [
    { label: 'Apertura', min: Math.round(duracion * 0.1) },
    { label: 'Contenido', min: Math.round(duracion * 0.35) },
    { label: 'Caso', min: Math.round(duracion * 0.6) },
    { label: 'Pitch', min: minutoPitch },
    { label: 'Cierre', min: duracion },
  ].map((t) => ({
    label: t.label,
    conectados: dentroEn(t.min),
    pct: Math.round((dentroEn(t.min) / pico) * 100),
    // Antes del pico todavía está entrando gente: que el número sea bajo no es una
    // fuga, y pintarlo de rojo haría sonar una alarma donde no pasa nada.
    antesDelPico: t.min < picoMin,
  }));

  const enElPitch = dentroEn(minutoPitch);
  const booked = 34;

  const embudo = [
    { label: 'Opt-ins', n: optins, nota: 'dejaron el mail en la landing' },
    { label: 'Inscriptos', n: inscriptos, nota: 'confirmaron lugar en Zoom' },
    { label: 'Entraron', n: distintos, nota: 'pisaron el vivo' },
    { label: 'Al pitch', n: enElPitch, nota: 'seguían al minuto 52' },
    { label: 'Agendaron', n: booked, nota: 'tomaron el CTA' },
  ];

  const noVinieron = gente.filter((g) => g.entra === null);
  const seFueronAntes = gente.filter((g) => g.sale !== null && g.sale < minutoPitch);
  const sinCta = gente.filter((g) => g.entra !== null && (g.sale === null || g.sale >= minutoPitch));

  const listas = [
    {
      clave: 'calificados', titulo: 'Calificados',
      nota: 'Facturación y respuestas que califican. Prioridad de contacto.',
      n: 212, personas: ['Marcos Ferrero', 'Jeferson Canate', 'Fer Canovas', 'Ayrton Alemán',
        'Lucía Prado', 'Tomás Rey', 'Nadia Coria', 'Iván Sosa'],
    },
    {
      clave: 'sin_cta', titulo: 'Vinieron y no siguieron el CTA',
      nota: 'Estuvieron en el pitch y no agendaron. Es la lista más caliente.',
      n: Math.max(0, sinCta.length - booked), personas: sinCta.slice(0, 8).map((g) => g.nombre),
    },
    {
      clave: 'no_vinieron', titulo: 'No se presentaron',
      nota: 'Confirmaron lugar y no entraron. Van al grupo de WhatsApp con la grabación.',
      n: inscriptos - distintos, personas: noVinieron.slice(0, 8).map((g) => g.nombre),
    },
    {
      clave: 'descalificados', titulo: 'Descalificados y semi',
      nota: 'Del formulario de la landing. No entran a llamada.',
      n: 136, personas: ['Ariel Gómez', 'Sol Ferrari', 'Nico Ledesma', 'Rita Molina'],
    },
  ];


  return {
    demo: true,
    enVivo: true,
    arranqueAt: arranque.toISOString(),
    conectados,
    picoConcurrentes: pico,
    picoAt: iso(picoMin),
    distintos,
    registros: optins,
    inscriptos,
    minutoPitch,
    enElPitch,
    booked,
    eventos: movimientos.length,
    serie,
    butacas,
    tramos,
    embudo,
    listas,
    ultimos: movimientos,
  };
}
