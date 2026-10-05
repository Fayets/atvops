import { useEffect, useState } from 'react';
import { getLlamadasDelPost } from '../../data/api.js';
import { formatValue } from '../../lib/format.js';
import { CON_LLAMADAS, FUENTE, QUE_ES, formulaDe } from '../../lib/webinarDesglose.js';

/**
 * De dónde sale un número del webinar.
 *
 * Casi todos se cargan a mano, así que el desglose no puede ser solo "la fórmula": tiene
 * que decir también de qué sistema vino el dato. Un número de Meta se audita; uno que
 * tipeó alguien un martes, no, y eso hay que poder verlo.
 *
 * Cuando hay filas detrás —solo la fase 3— se listan. Las llamadas que trajo el setting
 * van aparte y en gris: no son del webinar, pero están en el mismo calendario y conviene
 * ver por qué quedaron afuera en vez de preguntarse si falta alguna.
 */

const fmt = (v, formato) => {
  if (v == null) return '—';
  if (formato === 'usd') return formatValue(v, 'usd');
  if (formato === 'pct') return `${v}%`;
  return formatValue(v, 'count');
};
const corta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

export default function DesgloseKpi({ webinarId, metrica, metricas, onCerrar }) {
  const [llamadas, setLlamadas] = useState(null);
  const [cargando, setCargando] = useState(false);
  const pideLlamadas = CON_LLAMADAS.has(metrica.key);

  useEffect(() => {
    if (!pideLlamadas || !webinarId) return undefined;
    let vivo = true;
    setCargando(true);
    getLlamadasDelPost(webinarId)
      .then((d) => vivo && setLlamadas(d))
      .catch(() => vivo && setLlamadas(null))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [pideLlamadas, webinarId]);

  const formula = formulaDe(metrica.key, metricas);
  const fuente = FUENTE[metrica.key];
  const queEs = QUE_ES[metrica.key];

  return (
    <div className="modal-backdrop" onClick={onCerrar} role="presentation">
      <div className="modal-card wb-desglose" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={`De dónde sale ${metrica.label}`}>
        <header>
          <div>
            <h3>{metrica.label}</h3>
            {queEs ? <p className="dim">{queEs}</p> : null}
          </div>
          <button type="button" className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </header>

        <div className="wb-desglose-valor">
          <span className="num">{fmt(metrica.valor, metrica.formato)}</span>
          {formula ? <span className="dim">{formula.texto}</span> : null}
        </div>

        {formula ? (
          <div className="wb-desglose-partes">
            {formula.partes.map((p) => (
              <div key={p.label}>
                <span className="dim">{p.label}</span>
                <b>{p.usd ? formatValue(p.valor, 'usd') : formatValue(p.valor, 'count')}</b>
              </div>
            ))}
          </div>
        ) : null}

        {fuente ? (
          <p className="wb-desglose-fuente">
            <span className="dim">De dónde sale</span> {fuente}
          </p>
        ) : null}

        {pideLlamadas ? (
          cargando ? <p className="dim">Buscando las llamadas…</p>
            : llamadas?.delWebinar?.length ? (
              <>
                <h4>
                  Las {llamadas.delWebinar.length} llamadas del webinar
                  {llamadas.resumen?.sinCargar
                    ? <span className="dim"> · {llamadas.resumen.sinCargar} sin resultado todavía</span>
                    : null}
                </h4>
                <div className="wb-desglose-lista">
                  {llamadas.delWebinar.map((l) => (
                    <div key={l.id} className={`wb-desglose-fila${l.cerro ? ' cerro' : ''}`}>
                      <span className="num dim">{corta(l.fechaAt)}</span>
                      <span className="quien">{l.prospecto}</span>
                      <span className={`est${l.cargada ? '' : ' falta'}`}>
                        {l.resultado ? l.resultado.toLowerCase() : 'sin cargar'}
                      </span>
                      <span className="plata">{l.cashUsd ? formatValue(l.cashUsd, 'usd') : ''}</span>
                    </div>
                  ))}
                </div>
                {llamadas.delSetting?.length ? (
                  <p className="dim wb-desglose-nota">
                    Quedan afuera {llamadas.delSetting.length} llamadas del mismo período
                    porque las trajo un pitch de setting, no el webinar.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="dim">Todavía no hay llamadas del webinar en el calendario.</p>
            )
        ) : null}
      </div>
    </div>
  );
}
