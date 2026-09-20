import { useMemo } from 'react';
import Bars from '../charts/Bars.jsx';
import LineArea from '../charts/LineArea.jsx';
import Card from '../ui/Card.jsx';
import PanelArea, { n, pct } from '../ui/PanelArea.jsx';

/**
 * Fulfillment visto desde dirección: en qué estado está la cartera y si la conversación
 * con los clientes sigue viva.
 *
 * El número que importa acá no es cuántos clientes hay, es cuántos están en rojo y hace
 * cuánto que no hablan. Un cliente en silencio no se queja: se va.
 */

const FRANJAS = [
  { label: 'Rojo', min: 0, max: 49, color: 'var(--alert)' },
  { label: 'Amarillo', min: 50, max: 69, color: 'var(--warn)' },
  { label: 'Verde', min: 70, max: 100, color: 'var(--ok)' },
];

export default function PanelFulfillment({ data }) {
  const clientes = useMemo(
    () => (Array.isArray(data) ? data : (data?.clientes ?? [])).filter((c) => c.estado === 'activo'),
    [data],
  );
  const actividad = data?.actividad ?? [];

  const enRojo = clientes.filter((c) => (c.salud?.score ?? 0) < 50);
  const silencio = clientes.filter((c) => (c.engagement?.diasSinMensaje ?? 0) >= 7);
  const sinActivar = clientes.filter((c) => !c.activacion?.activado);
  const conBlocker = clientes.filter((c) => Boolean(c.activacion?.blocker));
  const mensajesSemana = Math.round(
    clientes.reduce((s, c) => s + (c.engagement?.mensajesClienteSemana ?? 0), 0),
  );

  // La conversación semana a semana: si la línea del cliente cae y la del coach no, el
  // equipo está hablando solo.
  const porSemana = useMemo(() => {
    const semanas = new Map();
    actividad.forEach((a) => {
      if (!semanas.has(a.semana)) semanas.set(a.semana, { semana: a.semana, cliente: 0, coach: 0, respuestas: [] });
      const s = semanas.get(a.semana);
      s.cliente += a.mensajesCliente ?? 0;
      s.coach += a.mensajesCoach ?? 0;
      if (a.respuestaCoachHs != null) s.respuestas.push(a.respuestaCoachHs);
    });
    return [...semanas.values()]
      .sort((a, b) => (a.semana < b.semana ? -1 : 1))
      .slice(-12)
      .map((s) => ({
        ...s,
        label: `${s.semana.slice(8, 10)}/${s.semana.slice(5, 7)}`,
        respuestaHs: s.respuestas.length
          ? Math.round((s.respuestas.reduce((x, y) => x + y, 0) / s.respuestas.length) * 10) / 10
          : 0,
      }));
  }, [actividad]);

  const porFranja = FRANJAS.map((f) => ({
    label: f.label, color: f.color,
    clientes: clientes.filter((c) => {
      const s = c.salud?.score ?? 0;
      return s >= f.min && s <= f.max;
    }).length,
  }));

  const pctRojo = clientes.length ? (enRojo.length / clientes.length) * 100 : null;

  return (
    <PanelArea
      kpis={[
        { label: 'Clientes activos', valor: n(clientes.length),
          nota: 'los que siguen en un programa, sin contar bajas' },
        { label: 'En rojo', valor: n(enRojo.length), tono: enRojo.length ? 'alert' : 'ok',
          nota: `${pct(pctRojo)} de la cartera con score menor a 50` },
        { label: 'En silencio', valor: n(silencio.length), tono: silencio.length ? 'warn' : 'ok',
          nota: 'siete días o más sin que el cliente escriba' },
        { label: 'Sin activar', valor: n(sinActivar.length), tono: sinActivar.length ? 'warn' : 'ok',
          nota: 'todavía no contaron un primer resultado' },
        { label: 'Con blocker', valor: n(conBlocker.length),
          nota: 'algo concreto los tiene frenados y está identificado' },
        { label: 'Mensajes de clientes', valor: n(mensajesSemana),
          nota: 'esta semana, sumando toda la cartera' },
      ]}
    >
      <Card
        title="La conversación, semana a semana"
        sub="Cuánto escribe el cliente y cuánto el coach"
        foot="Si la línea del cliente baja y la del coach se mantiene, el equipo está hablando solo. Ese es el momento de llamar, no cuando pide la baja."
      >
        <LineArea
          data={porSemana} x={(d) => d.label} height={190} format="count"
          series={[
            { key: (d) => d.cliente, label: 'Cliente', color: 'var(--s1)' },
            { key: (d) => d.coach, label: 'Coach', color: 'var(--s2)' },
          ]}
        />
      </Card>

      <Card
        title="Cómo está la cartera"
        sub="Clientes activos por franja de score"
        foot="El score sale de los transcripts de Discord: actividad, respuesta del coach y si el cliente ya contó un resultado."
      >
        <Bars
          data={porFranja} x={(d) => d.label} y={(d) => d.clientes} format="count" label="Clientes"
          color={(d) => d.color} height={190}
        />
      </Card>
    </PanelArea>
  );
}
