import { Outlet } from 'react-router-dom';
import { Sidebar, SIDEBAR_W, SIDEBAR_COLLAPSED_W } from './Sidebar';
import { useApp } from '../contexts/AppContext';
import { StarryBackground } from './StarryBackground';

export function DashboardLayout() {
  const { sidebarCollapsed } = useApp();
  const marginLeft = sidebarCollapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W;

  return (
    <div className="flex min-h-screen">
      <StarryBackground />
      <Sidebar />

      <main
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-screen transition-[margin] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] max-md:ml-0!"
        style={{ marginLeft }}
      >
        <Outlet />
      </main>
    </div>
  );
}
