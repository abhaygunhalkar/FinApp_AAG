import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { queryClient } from './hooks/queryClient';
import { useUIStore } from './store/uiStore';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Holdings from './pages/Holdings';
import ETFHoldings from './pages/ETFHoldings';
import Watchlist from './pages/Watchlist';
import TradeHistory from './pages/TradeHistory';
import EarningsCalendar from './pages/EarningsCalendar';
import Settings from './pages/Settings';
import OptionsStrategy from './pages/OptionsStrategy';
import OptionsTradesPage from './pages/OptionsTradesPage';
import Utilities from './pages/Utilities';
import PortfolioAnalysisPage from './pages/PortfolioAnalysisPage';

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/holdings', element: <Holdings /> },
      { path: '/etf-holdings', element: <ETFHoldings /> },
      { path: '/watchlist', element: <Watchlist /> },
      { path: '/trades', element: <TradeHistory /> },
      { path: '/earnings', element: <EarningsCalendar /> },
      { path: '/options-strategy', element: <OptionsStrategy /> },
      { path: '/options', element: <OptionsTradesPage /> },
      { path: '/settings', element: <Settings /> },
      { path: '/utilities', element: <Utilities /> },
      { path: '/portfolio-analysis', element: <PortfolioAnalysisPage /> },
    ],
  },
]);

function App() {
  const theme = useUIStore((state) => state.theme);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
