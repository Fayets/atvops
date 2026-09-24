import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';
import { urlPublica } from '../../data/api.js';

/**
 * Documentación de tracking para clientes (lenguaje simple).
 * @param {{ open: boolean, onClose: () => void, token?: string | null }} props
 */
export default function TrackingDocsModal({ open, onClose, token }) {
  const t = token || 'TU_TOKEN';
  const scriptLanding = `<script src="${urlPublica()}/api/track/sdk.js" data-token="${t}" data-page="landing" async></script>`;
  const scriptTy = `<script src="${urlPublica()}/api/track/sdk.js" data-token="${t}" data-page="ty" async></script>`;
  const scriptOptin = `<!-- Cuando el formulario se envía con éxito -->
<script>
  window.AtvOps && AtvOps.track('optin');
</script>`;
  const scriptWa = `<a href="https://wa.me/..."
   onclick="window.AtvOps && AtvOps.track('whatsapp')">
  Unirse al grupo
</a>`;
  const scriptCal = `<a href="https://calendar.google.com/..."
   onclick="window.AtvOps && AtvOps.track('calendario')">
  Agendar el webinar
</a>`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cómo configurar tu landing para el tracking"
      wide
    >
      <section className="docs-sec">
        <h3>Paso 1 — Pegar el script en tu landing</h3>
        <p>
          Para que el sistema pueda contar cuántas personas visitan tu landing, necesitás pegar
          un script en el código de tu página. Este script es el que aparece arriba en el panel
          de Script de tracking. Copialo y pegalo en tu landing, justo antes del cierre de la
          etiqueta <code>&lt;/body&gt;</code>.
        </p>
        <CodeBlock codigo={scriptLanding} />
        <p className="docs-nota">
          Si usás una plataforma como WordPress, pegalo en el footer del sitio o usá un plugin
          de inserción de código. Si usás una plataforma no-code tipo Lovable o similar, pegalo
          en la sección de código personalizado o tracking scripts.
        </p>
      </section>

      <section className="docs-sec">
        <h3>Paso 2 — Pegar el script en tu thank you page</h3>
        <p>
          La thank you page es la página que ven después de completar el formulario. Necesitás
          pegar el script ahí también, para que el sistema sepa cuántas personas llegaron hasta
          esta página. Si no lo pegás acá, no vamos a poder medir el drop-off entre el optin y
          la thank you page.
        </p>
        <CodeBlock codigo={scriptTy} />
        <p className="docs-nota">
          Si tu thank you page es la misma URL que la landing (tipo un popup que aparece), no
          hace falta pegarlo dos veces. Si es una URL distinta, pegalo en esa página con
          <code> data-page=&quot;ty&quot;</code>.
        </p>
      </section>

      <section className="docs-sec">
        <h3>Paso 3 — Disparar el evento cuando se completa el formulario</h3>
        <p>
          Cuando alguien completa el formulario de optin en tu landing, el sistema necesita saber
          que eso pasó. Para eso, tenés que disparar un evento cuando el form se envía. Si usás
          un formulario nativo de tu plataforma, agregá este código en el evento de submit del
          formulario.
        </p>
        <CodeBlock codigo={scriptOptin} />
        <p className="docs-nota">
          Si usás Typeform, Google Forms, o un formulario de tu plataforma, consultá con tu
          dev cómo disparar este evento al enviar el form. Si no tenés dev, contactanos y te
          ayudamos.
        </p>
      </section>

      <section className="docs-sec">
        <h3>Paso 4 — Trackear el click en el botón de WhatsApp (opcional)</h3>
        <p>
          Si tenés un botón de WhatsApp en tu thank you page y querés medir cuánta gente lo
          toca, agregá este código al botón.
        </p>
        <CodeBlock codigo={scriptWa} />
        <p className="docs-nota">
          Esto es opcional pero recomendado. Sin esto no podemos medir la tasa de entrada al
          grupo de WhatsApp.
        </p>
      </section>

      <section className="docs-sec">
        <h3>Paso 5 — Trackear el click en “agendar” (opcional)</h3>
        <p>
          Si en tu thank you page ofrecés guardar el webinar en el calendario, este código
          cuenta cuánta gente lo hace. Es la señal más temprana de que alguien piensa
          asistir de verdad: sirve para estimar el show del día antes de que llegue.
        </p>
        <CodeBlock codigo={scriptCal} />
      </section>

      <section className="docs-sec">
        <h3>¿Cómo sé que funciona?</h3>
        <p>
          Después de pegar los scripts, entrá a tu landing y completá el formulario vos mismo.
          Volvé a la vista de integraciones y mirá el estado de conexión. Si dice
          &quot;Recibiendo eventos&quot; y los contadores se mueven, está todo bien. Si dice
          &quot;Sin datos&quot;, esperá unos minutos y volvé a revisar. Si después de 10 minutos
          no aparece nada, revisá que pegaste el script en el lugar correcto.
        </p>
      </section>
    </Modal>
  );
}

function CodeBlock({ codigo }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="docs-code">
      <div className="docs-code-head">
        <button type="button" className="docs-copy" onClick={copiar}>
          <Icon name="clipboard" size={14} />
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre>{codigo}</pre>
    </div>
  );
}
