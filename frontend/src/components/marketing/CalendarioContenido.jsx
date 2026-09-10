import Card from '../ui/Card.jsx';
import { formatValue } from '../../lib/format.js';

/**
 * El mes de contenido de un vistazo: una miniatura por día con lo que salió.
 *
 * Sirve para ver el ritmo sin leer una tabla: dónde hubo días vacíos, qué semana se
 * publicó poco, si las historias acompañaron al reel.
 */

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const TIPOS = { reel: 'Reel', secuencia: 'Historias', youtube: 'YouTube' };

const clave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function grillaDelMes(mesId) {
  const [anio, mes] = String(mesId || '').split('-').map(Number);
  if (!anio || !mes) return [];
  const primero = new Date(anio, mes - 1, 1);
  const inicio = new Date(primero);
  inicio.setDate(primero.getDate() - ((primero.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    return d;
  });
}

/**
 * @param {{ mes: string, nombreMes: string, instagram: object, youtube: object }} props
 */
export default function CalendarioContenido({ mes, nombreMes, instagram, youtube }) {
  const porDia = {};
  const sumar = (fecha, pieza) => {
    if (!fecha) return;
    const k = fecha.slice(0, 10);
    (porDia[k] ??= []).push(pieza);
  };

  for (const r of instagram?.reels ?? []) {
    sumar(r.fecha, { tipo: 'reel', thumbnail: r.thumbnail, titulo: r.titulo, url: r.url, dato: r.views, datoLabel: 'vistas' });
  }
  for (const s of instagram?.secuencias ?? []) {
    sumar(s.fecha, {
      tipo: 'secuencia',
      thumbnail: s.historias?.[0]?.thumbnail,
      titulo: `${s.piezas} ${s.piezas === 1 ? 'historia' : 'historias'}`,
      url: s.historias?.[0]?.url,
      dato: s.vistas,
      datoLabel: 'vistas',
    });
  }
  for (const v of youtube?.videos ?? []) {
    sumar(v.fecha, { tipo: 'youtube', thumbnail: v.thumbnail, titulo: v.titulo, url: v.url, dato: v.vistas, datoLabel: 'vistas' });
  }

  const dias = grillaDelMes(mes);
  const mesNumero = Number(String(mes || '').split('-')[1]);
  const conContenido = Object.keys(porDia).length;
  const delMes = dias.filter((d) => d.getMonth() + 1 === mesNumero).length;

  return (
    <Card
      title="Mes de contenido"
      sub={`${nombreMes} · se publicó en ${conContenido} de ${delMes} días`}
      flush
      foot={
        <div className="cont-cal-leyenda dim">
          <span><i className="reel" />Reel</span>
          <span><i className="secuencia" />Historias</span>
          <span><i className="youtube" />YouTube</span>
          <span>Una miniatura por pieza. Los días vacíos son días sin publicar.</span>
        </div>
      }
    >
      <div className="cont-cal">
        {DIAS.map((d) => <div key={d} className="cont-cal-label">{d}</div>)}
        {dias.map((d) => {
          const k = clave(d);
          const piezas = porDia[k] ?? [];
          const fuera = d.getMonth() + 1 !== mesNumero;
          return (
            <div key={k} className={`cont-cal-dia${fuera ? ' fuera' : ''}${piezas.length ? ' con-contenido' : ''}`}>
              <span className="cont-cal-num num">{d.getDate()}</span>
              <div className="cont-cal-piezas">
                {piezas.map((p, i) => (
                  <a
                    key={`${k}-${i}`}
                    href={p.url || undefined}
                    target={p.url ? '_blank' : undefined}
                    rel="noreferrer"
                    className={`cont-cal-pieza ${p.tipo}`}
                    title={`${TIPOS[p.tipo]} · ${p.titulo}${p.dato ? ` · ${formatValue(p.dato, 'count')} ${p.datoLabel}` : ''}`}
                  >
                    {p.thumbnail
                      ? <img src={p.thumbnail} alt="" loading="lazy" />
                      : <span className="cont-cal-sinfoto">{TIPOS[p.tipo][0]}</span>}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
