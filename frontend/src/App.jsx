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
import Login from './pages/Login.jsx';
import Marketing from './pages/Marketing.jsx';
import Ads from './pages/Ads.jsx';
import Sistemas from './pages/Sistemas.jsx';
import Ventas from './pages/Ventas.jsx';
import Metas from './pages/Metas.jsx';
import Activacion from './pages/fulfillment/Activacion.jsx';
import Chats from './pages/fulfillment/Chats.jsx';
import ClienteDetalle from './pages/fulfillment/ClienteDetalle.jsx';
import Clientes from './pages/fulfillment/Clientes.jsx';
import Engagement from './pages/fulfillment/Engagement.jsx';
import Outcomes from './pages/fulfillment/Outcomes.jsx';
import Resumen from './pages/fulfillment/Resumen.jsx';
import Retencion from './pages/fulfillment/Retencion.jsx';

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
          <Route path="chats" element={<Chats />} />
          <Route path="chats/:categoria/:canal" element={<Chats />} />
            </Route>

            <Route path="marketing" element={<Marketing />} />
            <Route path="ads" element={<Ads />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="metas" element={<Metas />} />
            <Route path="sistemas" element={<Sistemas />} />
            <Route path="cobranza" element={<Cobranza />} />
        <Route path="asistente" element={<Asistente />} />
            <Route path="ideas" element={<Ideas />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
