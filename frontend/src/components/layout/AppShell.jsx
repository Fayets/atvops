import { Outlet } from 'react-router-dom';
import { IdeasProvider } from '../../lib/useIdeas.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AppShell() {
  return (
    <IdeasProvider>
      <div className="shell">
        <Sidebar />
        <div className="main">
          <Topbar />
          <Outlet />
        </div>
      </div>
    </IdeasProvider>
  );
}
