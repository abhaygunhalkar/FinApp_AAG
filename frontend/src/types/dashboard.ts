export interface DashboardSummary {
  total_portfolio_value: number;
  total_invested: number;
  unrealized_gain: number;
  etf_unrealized_gain: number;
  realized_gain: number;
  daily_change: number;
  annual_dividend_income: number;
  cash_position: number;
  number_of_holdings: number;
  stale_data: boolean;
  last_successful_fetch: string | null;
}

export interface BrokerSummary {
  broker: string;
  market_value: number;
  total_invested: number;
  unrealized_gain: number;
  holding_count: number;
}

export interface ActivityEvent {
  event_type: 'holding_added' | 'stock_sold' | 'watchlist_added' | 'watchlist_removed' | 'notes_updated';
  ticker: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface PortfolioSnapshot {
  date: string;
  total_value: number;
}
