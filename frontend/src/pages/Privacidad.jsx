/**
 * La política de privacidad de ATV, pública y sin sesión.
 *
 * Vive acá porque es la dirección que ATV controla. Meta la exige para publicar la app
 * `AVT MKT` y la lee una persona cuando se pide acceso avanzado a los permisos de
 * mensajería: por eso dice lo que el sistema hace de verdad y no una plantilla.
 *
 * La ruta está fuera de RequireAuth: si pidiera login, Meta la rechaza.
 */

const CORREO = 'aumentatuvalorx@gmail.com';
const ACTUALIZADA = '10 de septiembre de 2026';

const Correo = () => <a href={`mailto:${CORREO}`}>{CORREO}</a>;

export default function Privacidad() {
  return (
    <div className="legal">
      <article className="legal-hoja">
        <header>
          <div className="legal-marca">Aumenta Tu Valor</div>
          <h1>Política de privacidad</h1>
          <p className="dim">Última actualización: {ACTUALIZADA}</p>
        </header>

        <p>
          Esta política explica qué datos trata Aumenta Tu Valor (en adelante, «ATV»), para qué
          los usa y qué puede hacer una persona para acceder a ellos o pedir que se borren.
          Alcanza a nuestras cuentas de Instagram y YouTube y a las herramientas internas con las
          que gestionamos el negocio, entre ellas la aplicación <strong>AVT MKT</strong>,
          registrada en la plataforma de Meta, y este sistema, ATV Ops.
        </p>

        <h2>Quién es responsable</h2>
        <p>Aumenta Tu Valor. Consultas sobre datos personales: <Correo />.</p>

        <h2>Qué datos tratamos y por qué</h2>
        <p>
          <strong>De nuestras propias cuentas.</strong> Traemos las estadísticas de lo que
          publicamos: reproducciones, alcance, likes, comentarios, compartidos, guardados y
          respuestas de nuestros reels, historias y videos. Son datos agregados de nuestro propio
          contenido y no identifican a ninguna persona. Los usamos para saber qué contenido
          funciona.
        </p>
        <p>
          <strong>De quien nos escribe.</strong> Cuando alguien nos escribe por mensaje directo de
          Instagram, comenta una palabra clave en un reel o completa un formulario, guardamos su
          nombre de usuario, su nombre y los datos de contacto que nos deja, junto con lo necesario
          para responder esa conversación. Lo usamos para contestar, coordinar una llamada y llevar
          el seguimiento comercial. No accedemos a conversaciones ajenas a nuestra cuenta.
        </p>
        <p>
          <strong>De quien agenda una llamada.</strong> Nombre, correo, teléfono, fecha y hora de
          la reunión y las respuestas al formulario de agendamiento. Lo usamos para tener la
          llamada y para nuestro registro comercial.
        </p>
        <p>
          <strong>De quien contrata un programa.</strong> Además de lo anterior, los datos de
          facturación y el estado de pago, para prestar el servicio y cumplir obligaciones fiscales
          y contables.
        </p>
        <p>
          No vendemos datos personales, no los cedemos con fines publicitarios de terceros y no
          tomamos decisiones automatizadas que produzcan efectos jurídicos sobre las personas.
        </p>

        <h2>Con qué herramientas trabajamos</h2>
        <p>
          Usamos proveedores que, en su carácter de encargados del tratamiento, acceden solo a los
          datos que su función necesita:
        </p>
        <ul>
          <li><strong>Meta (Instagram y Facebook)</strong>: mensajería y estadísticas de nuestras cuentas.</li>
          <li><strong>Google (YouTube y Calendar)</strong>: estadísticas del canal y agenda de reuniones.</li>
          <li><strong>ManyChat</strong>: automatización de las conversaciones de Instagram.</li>
          <li><strong>Calendly</strong>: agendamiento de llamadas.</li>
          <li><strong>Nuestros propios servidores</strong>, donde vive este sistema de gestión, con acceso restringido al equipo de ATV.</li>
        </ul>
        <p>
          Algunos de estos proveedores están radicados fuera de la Argentina, por lo que los datos
          pueden transferirse a otros países. Elegimos proveedores que ofrecen garantías adecuadas
          de protección.
        </p>

        <h2>Cuánto tiempo los guardamos</h2>
        <p>
          Los datos de una conversación comercial se conservan mientras dure el vínculo y hasta
          cinco años después, plazo en el que pueden hacer falta para responder reclamos o cumplir
          obligaciones legales y fiscales. Las estadísticas de contenido, al ser agregadas y no
          identificar personas, se conservan de forma indefinida.
        </p>

        <h2>Sus derechos</h2>
        <p>
          Toda persona puede pedirnos acceder a sus datos, corregirlos, actualizarlos o suprimirlos,
          y oponerse a determinados usos. Escribiendo a <Correo /> respondemos dentro de los diez
          días corridos.
        </p>
        <p>
          En la Argentina, el titular de los datos personales tiene derecho a solicitar el acceso a
          ellos en forma gratuita a intervalos no inferiores a seis meses, salvo que acredite un
          interés legítimo, conforme al artículo 14, inciso 3 de la Ley 25.326. La Agencia de Acceso
          a la Información Pública, órgano de control de la Ley 25.326, tiene la atribución de
          atender las denuncias y reclamos que interpongan quienes resulten afectados en sus
          derechos por incumplimiento de las normas vigentes en materia de protección de datos
          personales.
        </p>

        <h2 id="eliminacion">Cómo pedir que borremos sus datos</h2>
        <p>
          Para pedir la eliminación de sus datos, envíe un correo a <Correo /> desde la dirección
          que nos haya dejado, o un mensaje directo desde la misma cuenta de Instagram con la que
          nos escribió, indicando «Baja de datos». Confirmamos la identidad, eliminamos la
          información dentro de los treinta días y avisamos cuando está hecho.
        </p>
        <p>
          Se conserva únicamente lo que la ley obliga a conservar —por ejemplo, comprobantes de
          facturación— y queda bloqueado para cualquier otro uso.
        </p>
        <p>
          Si además quiere cortar el acceso de nuestra aplicación a su cuenta de Instagram o
          Facebook, puede hacerlo desde <em>Configuración → Aplicaciones y sitios web</em> de su
          cuenta de Meta.
        </p>

        <h2>Este sistema</h2>
        <p>
          ATV Ops es una herramienta interna: solo entra el equipo de ATV con usuario y contraseña.
          No usa cookies de seguimiento ni de publicidad; guarda en el navegador únicamente lo
          necesario para sostener la sesión de quien inició sesión.
        </p>

        <h2>Cambios</h2>
        <p>
          Si esta política cambia, publicamos la versión nueva en esta misma dirección y
          actualizamos la fecha del encabezado.
        </p>
      </article>
    </div>
  );
}
