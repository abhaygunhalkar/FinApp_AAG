import { Outlet } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import Sidebar from './Sidebar';

export default function AppLayout() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden bg-surface-gradient">
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with menu toggle */}
        <header className="flex items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm lg:hidden">
          <button
            onClick={toggleSidebar}
            className={`p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 ${
              !sidebarCollapsed ? 'hidden' : ''
            }`}
            aria-label="Open sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <h1 className="ml-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            FINAPP_AAG
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
