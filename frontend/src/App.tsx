import { useEffect, useLayoutEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { setSignedOutHandler } from './api/client';
import { queryClient } from './hooks/queryClient';
import { useUIStore } from './store/uiStore';
import AppLayout from './components/layout/AppLayout';
import { RequireAuth, loginUrl } from './components/auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Dashboard2 from './pages/Dashboard2';
import Holdings from './pages/Holdings';
import ETFHoldings from './pages/ETFHoldings';
import Watchlist from './pages/Watchlist';
import TradeHistory from './pages/TradeHistory';
import EarningsCalendar from './pages/EarningsCalendar';
import Settings from './pages/Settings';
import OptionsStrategy from './pages/OptionsStrategy';
import MortgagePayoff from './pages/MortgagePayoff';
import OptionsTradesPage from './pages/OptionsTradesPage';
import Utilities from './pages/Utilities';
import PortfolioAnalysisPage from './pages/PortfolioAnalysisPage';
import NetWorth from './pages/NetWorth';
import FixedCosts from './pages/FixedCosts';
import CashFlow from './pages/CashFlow';

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    // Every other page needs a signed-in session.
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/dashboard-2', element: <Dashboard2 /> },
          { path: '/net-worth', element: <NetWorth /> },
          { path: '/fixed-costs', element: <FixedCosts /> },
          { path: '/cash-flow', element: <CashFlow /> },
          { path: '/holdings', element: <Holdings /> },
          { path: '/etf-holdings', element: <ETFHoldings /> },
          { path: '/watchlist', element: <Watchlist /> },
          { path: '/trades', element: <TradeHistory /> },
          { path: '/earnings', element: <EarningsCalendar /> },
          { path: '/options-strategy', element: <OptionsStrategy /> },
          { path: '/mortgage-payoff', element: <MortgagePayoff /> },
          { path: '/options', element: <OptionsTradesPage /> },
          { path: '/settings', element: <Settings /> },
          { path: '/utilities', element: <Utilities /> },
          { path: '/portfolio-analysis', element: <PortfolioAnalysisPage /> },
        ],
      },
    ],
  },
]);

function App() {
  const theme = useUIStore((state) => state.theme);
  const palette = useUIStore((state) => state.palette);

  // Layout effects run before the first paint, so the page never flashes
  // in the wrong theme.
  useLayoutEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useLayoutEffect(() => {
    document.documentElement.dataset.palette = palette;
  }, [palette]);

  // When the API says the session ended: drop every cached response and go
  // to the sign-in page, coming back here afterwards.
  useEffect(() => {
    setSignedOutHandler(() => {
      const { pathname, search } = router.state.location;
      if (pathname === '/login') return;
      queryClient.clear();
      void router.navigate(loginUrl(pathname + search, true), { replace: true });
    });
    return () => setSignedOutHandler(null);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
