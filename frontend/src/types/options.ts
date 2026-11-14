/** Mirrors backend/app/schemas/options.py. */

export type OptionTradeType = 'sell_put' | 'sell_call' | 'buy_call' | 'buy_put';
export type OptionStatus = 'open' | 'closed' | 'expired_worthless' | 'assigned';

export interface OptionsTrade {
  id: number;
  ticker: string;
  trade_type: OptionTradeType;
  strike_price: number;
  premium: number;
  contracts: number;
  open_date: string;
  expiry_date: string;
  status: OptionStatus;
  close_price: number | null;
  notes: string | null;
  broker: string | null;
  created_at: string;
  updated_at: string;
  /** Realized P&L; null while the trade is open. */
  pnl: number | null;
}

export interface OptionPayload {
  ticker: string;
  trade_type: OptionTradeType;
  strike_price: number;
  premium: number;
  contracts: number;
  open_date: string;
  expiry_date: string;
  status: OptionStatus;
  close_price?: number | null;
  notes?: string | null;
  broker?: string | null;
}

export interface OptionsSummary {
  total_pnl: number;
  open_positions: number;
  expiring_this_week: number;
  win_rate: number;
}

export interface OptionQuote {
  bid: number | null;
  ask: number | null;
  last_price: number | null;
  current_price: number | null;
  unrealized_pnl: number | null;
}

export interface MonthlyPnlEntry {
  transaction_date: string;
  realized_gain: number;
}
