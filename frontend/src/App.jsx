import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './components/auth/RequireAuth.jsx';
import AppShell from './components/layout/AppShell.jsx';
import Calendario from './pages/Calendario.jsx';
import Cobranza from './pages/Cobranza.jsx';
import Configuracion from './pages/Configuracion.jsx';
import Ideas from './pages/Ideas.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Marketing from './pages/Marketing.jsx';
import Sistemas from './pages/Sistemas.jsx';
import Ventas from './pages/Ventas.jsx';
import Activacion from './pages/fulfillment/Activacion.jsx';
import ClienteDetalle from './pages/fulfillment/ClienteDetalle.jsx';
import Clientes from './pages/fulfillment/Clientes.jsx';
import Engagement from './pages/fulfillment/Engagement.jsx';
import Outcomes from './pages/fulfillment/Outcomes.jsx';
import Resumen from './pages/fulfillment/Resumen.jsx';
import Retencion from './pages/fulfillment/Retencion.jsx';

/**
 * Seis bloques: Fulfillment, Marketing, Ventas, Sistemas, Cobranza e Ideas. La
 * home es el cuadro de mando que los une y prescribe la semana. Fulfillment tiene su propia estructura porque es donde vive
 * el trabajo que sostiene el revenue ya vendido.
 */
export default function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="calendario" element={<Calendario />} />

          <Route path="fulfillment">
            <Route index element={<Resumen />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/:clienteId" element={<ClienteDetalle />} />
            <Route path="activacion" element={<Activacion />} />
            <Route path="engagement" element={<Engagement />} />
            <Route path="retencion" element={<Retencion />} />
            <Route path="outcomes" element={<Outcomes />} />
          </Route>

          <Route path="marketing" element={<Marketing />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="sistemas" element={<Sistemas />} />
          <Route path="cobranza" element={<Cobranza />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="configuracion" element={<Configuracion />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
