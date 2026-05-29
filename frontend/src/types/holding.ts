export interface Holding {
  id: number;
  ticker: string;
  company_name: string | null;
  quantity: number;
  average_buy_price: number;
  current_price: number;
  total_invested: number;
  current_value: number;
  daily_change: number;
  daily_change_pct: number;
  unrealized_gain: number;
  unrealized_gain_pct: number;
  allocation_pct: number;
  holding_type: 'stock' | 'etf';
  sector: string | null;
  industry: string | null;
  dividend_yield: number;
  annual_dividend_income: number;
  broker: string | null;
  created_at: string;
  updated_at: string;
}

export interface HoldingCreate {
  ticker: string;
  quantity: number;
  buy_price: number;
  company_name?: string;
  sector?: string;
  industry?: string;
  broker?: string;
  notes?: string;
}
