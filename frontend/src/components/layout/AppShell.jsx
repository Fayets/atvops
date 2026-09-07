import { Outlet } from 'react-router-dom';
import { MesProvider } from '../../lib/MesContext.jsx';
import { RolProvider } from '../../lib/RolContext.jsx';
import { IdeasProvider } from '../../lib/useIdeas.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppShell() {
  return (
    <RolProvider>
      <MesProvider>
        <IdeasProvider>
          <div className="shell">
            <Sidebar />
            <div className="main">
              <Topbar />
              <Outlet />
            </div>
          </div>
        </IdeasProvider>
      </MesProvider>
    </RolProvider>
  );
}
