import { Outlet } from 'react-router-dom';
import { MesProvider } from '../../lib/MesContext.jsx';
import { RolProvider } from '../../lib/RolContext.jsx';
import { IdeasProvider } from '../../lib/useIdeas.jsx';
import GateLlamadas from '../ventas/GateLlamadas.jsx';
import BotonAtvAi from './BotonAtvAi.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppShell() {
  return (
    <RolProvider>
      <MesProvider>
        <IdeasProvider>
          <GateLlamadas />
          <div className="shell">
            <Sidebar />
            <div className="main">
              <Topbar />
              <Outlet />
            </div>
            <BotonAtvAi />
          </div>
        </IdeasProvider>
      </MesProvider>
    </RolProvider>
  );
}
