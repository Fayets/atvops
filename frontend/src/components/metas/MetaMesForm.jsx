import { useEffect, useState } from 'react';
import Card from '../ui/Card.jsx';
import Pill from '../ui/Pill.jsx';
import {
  guardarDecreto,
  mesEsInmutable,
  validarDecreto,
} from '../../lib/metasMes.js';
import { formatFecha } from '../../lib/format.js';

const VACIO = {
  chats: '',
  conversaciones: '',
  agendas: '',
  agendasOrganicas: '',
  agendasAds: '',
  showUpRate: '',
  closeRateBueno: '',
  closeRateMuyBueno: '',
  inversionAds: '',
  cashMeta: '',
  cashAds: '',
  cashOrganico: '',
};

function aNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Formulario del decreto mensual (Configuración o modal).
 * @param {{
 *   decretoInicial: import('../../lib/metasMes.js').DecretoMes,
 *   mes: string,
 *   nombreMes: string,
 *   onGuardado?: (d: import('../../lib/metasMes.js').DecretoMes) => void,
 *   embutido?: boolean,
 * }} props
 */
export default function MetaMesForm({ decretoInicial, mes, nombreMes, onGuardado, embutido = false, editable = true }) {
  const inmutable = !editable || mesEsInmutable(mes);
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (!decretoInicial) return;
    setForm({
      chats: String(decretoInicial.chats ?? ''),
      conversaciones: String(decretoInicial.conversaciones ?? ''),
      agendas: String(decretoInicial.agendas ?? ''),
      agendasOrganicas: String(decretoInicial.agendasOrganicas ?? ''),
      agendasAds: String(decretoInicial.agendasAds ?? ''),
      showUpRate: String(decretoInicial.showUpRate ?? ''),
      closeRateBueno: String(decretoInicial.closeRateBueno ?? ''),
      closeRateMuyBueno: String(decretoInicial.closeRateMuyBueno ?? ''),
      inversionAds: String(decretoInicial.inversionAds ?? ''),
      cashMeta: String(decretoInicial.cashMeta ?? ''),
      cashAds: String(decretoInicial.cashAds ?? ''),
      cashOrganico: String(decretoInicial.cashOrganico ?? ''),
    });
  }, [decretoInicial]);

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setError('');
    setOk('');
  }

  function onSubmit(e) {
    e.preventDefault();
    const decreto = {
      mes,
      chats: aNum(form.chats),
      conversaciones: aNum(form.conversaciones),
      agendas: aNum(form.agendas),
      agendasOrganicas: aNum(form.agendasOrganicas),
      agendasAds: aNum(form.agendasAds),
      showUpRate: aNum(form.showUpRate),
      closeRateBueno: aNum(form.closeRateBueno),
      closeRateMuyBueno: aNum(form.closeRateMuyBueno),
      inversionAds: aNum(form.inversionAds),
      cashMeta: aNum(form.cashMeta),
      cashAds: aNum(form.cashAds),
      cashOrganico: aNum(form.cashOrganico),
      creadoAt: decretoInicial?.creadoAt,
      creadoPor: decretoInicial?.creadoPor || 'Equipo',
    };
    const errs = validarDecreto(decreto);
    if (errs.length) {
      setError(`Revisá: ${errs.join(', ')}.`);
      return;
    }
    try {
      const saved = guardarDecreto(decreto, { forzar: editable });
      setOk(`Decreto de ${nombreMes} guardado.`);
      onGuardado?.(saved);
    } catch (err) {
      setError(err.message || 'No se pudo guardar.');
    }
  }

  const campos = [
    { key: 'chats', label: 'Chats', step: 1 },
    { key: 'conversaciones', label: 'Conversaciones', step: 1 },
    { key: 'agendas', label: 'Agendas (total)', step: 1 },
    { key: 'agendasOrganicas', label: 'Agendas orgánicas', step: 1 },
    { key: 'agendasAds', label: 'Agendas ads', step: 1 },
    { key: 'showUpRate', label: 'Show-up %', step: 0.1 },
    { key: 'closeRateBueno', label: 'Close bueno %', step: 0.1 },
    { key: 'closeRateMuyBueno', label: 'Close muy bueno %', step: 0.1 },
    { key: 'inversionAds', label: 'Inversión ads US$', step: 1 },
    { key: 'cashMeta', label: 'Cash meta US$', step: 1 },
    { key: 'cashAds', label: 'Cash ads US$', step: 1 },
    { key: 'cashOrganico', label: 'Cash orgánico US$', step: 1 },
  ];

  const body = (
    <>
      <div className="meta-form-banner">
        <div>
          <div className="eyebrow">{nombreMes}</div>
          <p>
            Decreto del mes: números a los que el equipo se compromete. Una vez cerrado el mes queda
            histórico e inmutable.
          </p>
        </div>
        <Pill tone={inmutable ? 'off' : 'ok'} dot>
          {inmutable ? 'histórico' : 'editable'}
        </Pill>
      </div>

      <form className="meta-form" onSubmit={onSubmit}>
        <div className="meta-form-grid">
          {campos.map((c) => (
            <label key={c.key} className="meta-form-field">
              <span>{c.label}</span>
              <input
                type="number"
                step={c.step}
                min={0}
                value={form[c.key]}
                disabled={inmutable}
                onChange={(e) => set(c.key, e.target.value)}
                required
              />
            </label>
          ))}
        </div>

        {decretoInicial?.creadoAt && (
          <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
            Última carga · {formatFecha(decretoInicial.creadoAt)}
            {decretoInicial.creadoPor ? ` · ${decretoInicial.creadoPor}` : ''}
          </div>
        )}

        {error ? <p className="login-error">{error}</p> : null}
        {ok ? <p className="meta-form-ok">{ok}</p> : null}

        {!inmutable && (
          <button className="btn primary" type="submit" style={{ marginTop: 12 }}>
            Guardar decreto del mes
          </button>
        )}
      </form>
    </>
  );

  if (embutido) return <div className="meta-form-wrap">{body}</div>;

  return (
    <Card title="Metas mensuales" sub="Marketing + Ventas · un solo decreto">
      {body}
    </Card>
  );
}
