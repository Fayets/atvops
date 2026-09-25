import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './components/auth/RequireAuth.jsx';
import RequireRole from './components/auth/RequireRole.jsx';
import AppShell from './components/layout/AppShell.jsx';
import Calendario from './pages/Calendario.jsx';
import Asistente from './pages/Asistente.jsx';
import Cobranza from './pages/Cobranza.jsx';
import Configuracion from './pages/Configuracion.jsx';
import Ideas from './pages/Ideas.jsx';
import Home from './pages/Home.jsx';
import HomeMarketingPage from './pages/HomeMarketingPage.jsx';
import HomeVentasPage from './pages/HomeVentasPage.jsx';
import ContenidoPage from './pages/marketing/ContenidoPage.jsx';
import Login from './pages/Login.jsx';
import Marketing from './pages/Marketing.jsx';
import MarketingOpsPage from './pages/MarketingOpsPage.jsx';
import Ads from './pages/Ads.jsx';
import Sistemas from './pages/Sistemas.jsx';
import Metas from './pages/Metas.jsx';
import ReporteSemanal from './pages/ReporteSemanal.jsx';
import VentasCloser from './pages/VentasCloser.jsx';
import VentasLlamadas from './pages/VentasLlamadas.jsx';
import VentasOperativaPage from './pages/VentasOperativa.jsx';
import VentasOps from './pages/VentasOps.jsx';
import VentasPerformancePage from './pages/VentasPerformance.jsx';
import Setting from './pages/Setting.jsx';
import Laboratorio from './pages/Laboratorio.jsx';
import VentasDashboard from './pages/VentasDashboard.jsx';
import VentasSetter from './pages/VentasSetter.jsx';
import Webinars from './pages/Webinars.jsx';
import WebinarsListado from './pages/WebinarsListado.jsx';
import WebinarDetalle from './pages/WebinarDetalle.jsx';
import WebinarFaseDetalle from './pages/WebinarFaseDetalle.jsx';
import Integraciones from './pages/Integraciones.jsx';
import ClavesApi from './pages/ClavesApi.jsx';
import Activacion from './pages/fulfillment/Activacion.jsx';
import Chats from './pages/fulfillment/Chats.jsx';
import Pendientes from './pages/fulfillment/Pendientes.jsx';
import ClienteDetalle from './pages/fulfillment/ClienteDetalle.jsx';
import Clientes from './pages/fulfillment/Clientes.jsx';
import Diagnostico from './pages/fulfillment/Diagnostico.jsx';
import Engagement from './pages/fulfillment/Engagement.jsx';
import Outcomes from './pages/fulfillment/Outcomes.jsx';
import FulfillmentOps from './pages/fulfillment/FulfillmentOps.jsx';
import Resumen from './pages/fulfillment/Resumen.jsx';
import Retencion from './pages/fulfillment/Retencion.jsx';
import { useRol } from './lib/RolContext.jsx';
import {
  homeParaRol,
  puedeVerVentasCloser,
  puedeVerVentasDirector,
  puedeVerVentasOps,
  puedeVerVentasSetter,
} from './lib/roles.js';

/** /ventas: Closer → Mi día · Setter → Mi progreso · OPS → Salud vs meta · resto → Operativa. */
/** El día a día de fulfillment es del CSM; el resto entra a la lectura de cartera. */
function FulfillmentIndex() {
  const { rol } = useRol();
  if (rol !== 'csm') return <Navigate to="/fulfillment/ops" replace />;
  return <Resumen />;
}

function VentasIndex() {
  const { rol } = useRol();
  if (puedeVerVentasCloser(rol) && !puedeVerVentasDirector(rol)) {
    return <Navigate to="/ventas/mi-dia" replace />;
  }
  if (puedeVerVentasSetter(rol) && !puedeVerVentasDirector(rol)) {
    return <Navigate to="/ventas/mi-progreso" replace />;
  }
  if (!puedeVerVentasDirector(rol) && puedeVerVentasOps(rol)) {
    return <Navigate to="/ventas/ops" replace />;
  }
  // `/ventas` es el dashboard del área: los dos bloques y nada más. La Operativa sigue
  // viva en su propia ruta, pero deja de ser la puerta de entrada.
  return <VentasDashboard />;
}

function VentasMiDiaRoute() {
  const { rol } = useRol();
  if (!puedeVerVentasCloser(rol)) {
    return <Navigate to={homeParaRol(rol)} replace />;
  }
  return <VentasCloser />;
}

function VentasMiProgresoRoute() {
  const { rol } = useRol();
  if (!puedeVerVentasSetter(rol)) {
    return <Navigate to={homeParaRol(rol)} replace />;
  }
  return <VentasSetter />;
}

function VentasPerformanceRoute() {
  const { rol } = useRol();
  if (!puedeVerVentasDirector(rol)) {
    return <Navigate to={homeParaRol(rol)} replace />;
  }
  return <VentasPerformancePage />;
}

/** Operaciones ve la proyección del mes; marketing, su tablero de contenido. */
function MarketingIndex() {
  const { rol } = useRol();
  return rol === 'marketing' ? <Marketing /> : <MarketingOpsPage />;
}

function HomeIndex() {
  const { rol } = useRol();
  // Closer / Setter no ven el cuadro de mando de la empresa.
  if (puedeVerVentasCloser(rol) && !puedeVerVentasDirector(rol)) {
    return <Navigate to="/ventas/mi-dia" replace />;
  }
  if (puedeVerVentasSetter(rol) && !puedeVerVentasDirector(rol)) {
    return <Navigate to="/ventas/mi-progreso" replace />;
  }
  // El director de marketing ve cómo viene su mes, no el cuadro de mando de operaciones.
  if (rol === 'marketing') return <HomeMarketingPage />;
  // El director de ventas ve cash + métricas por calidad de lead.
  if (rol === 'ventas') return <HomeVentasPage />;
  return <Home />;
}

function FallbackRuta() {
  const { rol } = useRol();
  return <Navigate to={homeParaRol(rol)} replace />;
}

/**
 * Rutas del tablero. Auth + rol filtran qué entra cada usuario.
 */
export default function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route element={<RequireRole />}>
            <Route index element={<HomeIndex />} />
            <Route path="calendario" element={<Calendario />} />
            <Route path="reporte" element={<ReporteSemanal />} />

            <Route path="fulfillment">
              <Route index element={<FulfillmentIndex />} />
              <Route path="ops" element={<FulfillmentOps />} />
              <Route path="diagnostico" element={<Diagnostico />} />
              <Route path="clientes/:clienteId" element={<ClienteDetalle />} />
              {/* Las vistas viejas siguen respondiendo: un link guardado no tiene por qué
                  romperse porque consolidamos la navegación. */}
              <Route path="clientes" element={<Navigate to="/fulfillment/diagnostico" replace />} />
              <Route path="activacion" element={<Navigate to="/fulfillment/diagnostico" replace />} />
              <Route path="onboarding" element={<Navigate to="/fulfillment/diagnostico" replace />} />
              <Route path="engagement" element={<Navigate to="/fulfillment/diagnostico" replace />} />
              <Route path="retencion" element={<Navigate to="/fulfillment/diagnostico" replace />} />
              <Route path="outcomes" element={<Outcomes />} />
              <Route path="pendientes" element={<Pendientes />} />
              <Route path="chats" element={<Chats />} />
              <Route path="chats/:categoria/:canal" element={<Chats />} />
            </Route>

            <Route path="marketing">
              <Route index element={<MarketingIndex />} />
              <Route path="calendario" element={<ContenidoPage vista="calendario" />} />
              <Route path="reels" element={<ContenidoPage vista="reels" />} />
              <Route path="historias" element={<ContenidoPage vista="historias" />} />
              <Route path="youtube" element={<ContenidoPage vista="youtube" />} />
            </Route>
            <Route path="ads" element={<Ads />} />
            <Route path="webinars">
              <Route index element={<Webinars />} />
              <Route path="listado" element={<WebinarsListado />} />
              <Route path="nuevo" element={<WebinarDetalle modo="nuevo" />} />
              <Route path=":id/fase/:faseId" element={<WebinarFaseDetalle />} />
              <Route path=":id" element={<WebinarDetalle />} />
            </Route>
            <Route path="ventas">
              <Route index element={<VentasIndex />} />
              <Route path="operativa" element={<VentasOperativaPage />} />
              <Route path="lab-setting" element={<Laboratorio cual="setting" />} />
              <Route path="lab-closing" element={<Laboratorio cual="closing" />} />
              <Route path="mi-dia" element={<VentasMiDiaRoute />} />
              <Route path="llamadas" element={<VentasLlamadas />} />
              <Route path="mi-progreso" element={<VentasMiProgresoRoute />} />
              <Route path="setting" element={<Setting />} />
              <Route path="performance" element={<VentasPerformanceRoute />} />
              <Route path="ops" element={<VentasOps />} />
            </Route>
            <Route path="metas" element={<Metas />} />
            <Route path="sistemas" element={<Sistemas />} />
            <Route path="integraciones" element={<Integraciones />} />
            <Route path="claves" element={<ClavesApi />} />
            <Route path="cobranza" element={<Cobranza />} />
        <Route path="asistente" element={<Asistente />} />
            <Route path="ideas" element={<Ideas />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>

          <Route path="*" element={<FallbackRuta />} />
        </Route>
      </Route>
    </Routes>
  );
}
