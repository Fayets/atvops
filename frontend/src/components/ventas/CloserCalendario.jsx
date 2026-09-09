import { useEffect, useMemo, useState } from 'react';
import DispositionLlamada from './DispositionLlamada.jsx';
import Pill from '../ui/Pill.jsx';
import {
  ESTADO_LLAMADA,
  ORIGEN_LABEL,
  llamadaPasada,
  resumenCalendarioHoy,
} from '../../lib/dispositions.js';
import { formatFechaHora, formatValue } from '../../lib/format.js';

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

function horaDe(iso) {
  return formatFechaHora(iso).split(', ')[1] || formatFechaHora(iso);
}

function diaKey(iso) {
  return iso.slice(0, 10);
}

function inicioSemana(isoDia) {
  const d = new Date(`${isoDia}T12:00:00`);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

/**
 * Calendario del closer: día / semana + disposition al click.
 */
export default function CloserCalendario({
  llamadas,
  hoyIso,
  flashId = null,
  onGuardarDisposition,
  onSimular,
}) {
  const [vista, setVista] = useState('dia');
  const [activa, setActiva] = useState(null);
  const [promptPasada, setPromptPasada] = useState(null);
  const [omitidas, setOmitidas] = useState(() => new Set());

  const delDia = useMemo(
    () => (llamadas ?? []).filter((l) => diaKey(l.fechaAt) === hoyIso),
    [llamadas, hoyIso],
  );

  const resumen = resumenCalendarioHoy(delDia);

  const semana = useMemo(() => {
    const start = inicioSemana(hoyIso);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        key,
        label: DIAS[i],
        num: d.getDate(),
        esHoy: key === hoyIso,
        items: (llamadas ?? []).filter((l) => diaKey(l.fechaAt) === key),
      };
    });
  }, [llamadas, hoyIso]);

  useEffect(() => {
    if (activa || promptPasada) return;
    const pastDue = delDia.find((l) => llamadaPasada(l) && !omitidas.has(l.id));
    if (pastDue) setPromptPasada(pastDue);
  }, [delDia, activa, promptPasada, omitidas]);

  const abrir = (l) => {
    setPromptPasada(null);
    setActiva(l);
  };

  const guardar = async (payload) => {
    await onGuardarDisposition(payload);
    setActiva(null);
    setPromptPasada(null);
  };

  const modalLlamada = activa || null;

  return (
    <>
      <div className="closer-cal-toolbar">
        <div className="closer-cal-tabs">
          <button
            type="button"
            className={`btn sm${vista === 'dia' ? ' primary' : ''}`}
            onClick={() => setVista('dia')}
          >
            Hoy
          </button>
          <button
            type="button"
            className={`btn sm${vista === 'semana' ? ' primary' : ''}`}
            onClick={() => setVista('semana')}
          >
            Semana
          </button>
        </div>
        {onSimular && (
          <button
            type="button"
            className="btn sm"
            onClick={onSimular}
            title="Aplica disposition demo a Tomás Riganti"
          >
            Simular disposition
          </button>
        )}
      </div>

      <p className="closer-cal-count">
        {resumen.total} llamadas hoy · {resumen.showsConfirmados} shows · {resumen.pendientes}{' '}
        pendientes
      </p>

      {vista === 'dia' ? (
        delDia.length === 0 ? (
          <div className="empty">Sin llamadas agendadas para hoy.</div>
        ) : (
          delDia.map((l) => (
            <CallRow key={l.id} llamada={l} flash={flashId === l.id} onClick={() => abrir(l)} />
          ))
        )
      ) : (
        <div className="closer-cal-semana">
          {semana.map((dia) => (
            <div key={dia.key} className={`closer-cal-dia${dia.esHoy ? ' hoy' : ''}`}>
              <div className="closer-cal-dia-head">
                <span>{dia.label}</span>
                <strong>{dia.num}</strong>
              </div>
              {dia.items.length === 0 ? (
                <div className="dim" style={{ fontSize: 11.5, padding: '6px 0' }}>
                  —
                </div>
              ) : (
                dia.items.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`closer-cal-chip estado-${l.estado}${l.atenua ? ' atenua' : ''}${flashId === l.id ? ' flash' : ''}`}
                    onClick={() => abrir(l)}
                  >
                    <span className="h">{horaDe(l.fechaAt)}</span>
                    <span className="n">{l.prospecto}</span>
                    {l.estado === 'cerrado' && l.montoUsd != null && (
                      <span className="m">{formatValue(l.montoUsd, 'usd')}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {promptPasada && !activa && (
        <div className="closer-cal-prompt">
          <span>
            La llamada con <strong>{promptPasada.prospecto}</strong> ya pasó. ¿Marcar disposition?
          </span>
          <div className="disp-toggle">
            <button type="button" className="btn sm primary" onClick={() => setActiva(promptPasada)}>
              Abrir formulario
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setOmitidas((s) => new Set(s).add(promptPasada.id));
                setPromptPasada(null);
              }}
            >
              Después
            </button>
          </div>
        </div>
      )}

      {modalLlamada && (
        <DispositionLlamada
          llamada={modalLlamada}
          onCerrar={() => setActiva(null)}
          onGuardar={guardar}
        />
      )}
    </>
  );
}

function CallRow({ llamada: l, flash, onClick }) {
  const est = ESTADO_LLAMADA[l.estado] ?? ESTADO_LLAMADA.agendado;
  return (
    <button
      type="button"
      className={`lista-item clickable closer-call estado-${l.estado}${l.atenua ? ' atenua' : ''}${flash ? ' flash' : ''}`}
      onClick={onClick}
    >
      <Pill tone={est.tone} dot>
        {horaDe(l.fechaAt)}
      </Pill>
      <span className="who">
        {est.check && (
          <span className="closer-check" aria-hidden>
            ✓
          </span>
        )}
        {l.prospecto}
      </span>
      <span className="q">
        {ORIGEN_LABEL[l.origen] ?? l.origen} · {l.oferta} · {est.label}
        {l.estado === 'cerrado' && l.montoUsd != null ? ` · ${formatValue(l.montoUsd, 'usd')}` : ''}
      </span>
    </button>
  );
}
