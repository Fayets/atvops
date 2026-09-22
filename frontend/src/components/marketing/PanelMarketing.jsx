import { useMemo } from 'react';
import Bars from '../charts/Bars.jsx';
import Card from '../ui/Card.jsx';
import PanelArea, { n, pct } from '../ui/PanelArea.jsx';

/**
 * Marketing visto desde dirección: qué se publicó y cuántos chats trajo.
 *
 * Las reproducciones solas no dicen nada —un reel puede tener cien mil y no abrir una
 * charla—, así que al lado de cada pieza va lo que de verdad importa: cuánta gente
 * escribió después.
 */

const corto = (t, max = 13) => {
  const limpio = (t || 'sin título').replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
};

export default function PanelMarketing({ data, chats }) {
  const contenido = data?.contenido ?? {};
  const conversaciones = data?.conversaciones ?? {};
  const historias = data?.historias ?? {};

  const reels = useMemo(
    () => (contenido.publicaciones ?? []).map((p) => ({
      label: corto(p.titulo ?? p.caption ?? p.keyword),
      vistas: p.reproducciones ?? p.vistas ?? 0,
      interacciones: p.interacciones ?? 0,
    })),
    [contenido.publicaciones],
  );

  const porPalabra = useMemo(() => {
    const mapa = conversaciones.porPalabra ?? {};
    return Object.entries(mapa)
      .map(([palabra, cuantas]) => ({ label: palabra || 'sin palabra', cuantas: Number(cuantas) || 0 }))
      .sort((a, b) => b.cuantas - a.cuantas)
      .slice(0, 8);
  }, [conversaciones.porPalabra]);

  const vistas = contenido.reproducciones ?? 0;
  const alcance = contenido.alcance ?? 0;
  const interacciones = contenido.interacciones ?? 0;

  return (
    <PanelArea
      kpis={[
        { label: 'Chats', valor: n(chats?.total ?? conversaciones.total),
          tono: (chats?.total ?? conversaciones.total) ? 'ok' : null,
          nota: chats?.fuente || 'los abre el bot con la palabra de un reel o de la bio' },
        { label: 'Reels publicados', valor: n(contenido.reels),
          nota: 'lo que salió en el mes, sin contar historias' },
        { label: 'Reproducciones', valor: n(vistas),
          nota: 'veces que se reprodujo un reel, no personas' },
        { label: 'Alcance', valor: n(alcance),
          nota: 'cuentas distintas que lo vieron' },
        { label: 'Interacciones', valor: n(interacciones),
          nota: `${pct(vistas ? (interacciones / vistas) * 100 : null)} de las reproducciones terminó en algo` },
        { label: 'Chats por historias', valor: n(historias.chats),
          nota: `de ${n(historias.secuencias)} secuencias publicadas` },
      ]}
    >
      <Card
        title="Qué trajo cada reel"
        sub="Reproducciones y cuánta gente interactuó"
        foot="Cien mil reproducciones sin interacción no abren una conversación. La línea es lo que hay que mirar, no la barra."
      >
        <Bars
          data={reels} x={(d) => d.label} y={(d) => d.vistas} format="count" label="Reproducciones"
          color={() => 'var(--s3)'} height={190}
          linea={{ key: (d) => d.interacciones, label: 'Interacciones', format: 'count', escala: 'propia' }}
        />
      </Card>

      <Card
        title="Por dónde entró cada chat"
        sub="La palabra con la que escribieron"
        foot="Es la palabra que mandó la persona para pedir el recurso. Dice qué contenido está trayendo gente, no cuál tuvo más vistas."
      >
        <Bars
          data={porPalabra} x={(d) => d.label} y={(d) => d.cuantas} format="count" label="Chats"
          color={() => 'var(--s4)'} height={190}
        />
      </Card>
    </PanelArea>
  );
}
