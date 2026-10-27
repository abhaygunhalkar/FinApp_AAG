/** Shares a sell took from one buy lot, with that lot's cost. */
export interface LotAllocation {
  buy_transaction_id: number;
  quantity: number;
  price: number;
  transaction_date: string;
}

export interface Transaction {
  id: number;
  holding_id: number | null;
  ticker: string;
  transaction_type: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees: number;
  transaction_date: string;
  notes: string | null;
  broker?: string | null;
  created_at: string;
  /** Buys: shares of this lot not yet sold. */
  remaining_quantity?: number | null;
  /** Sells: the lots the shares came from. */
  lots?: LotAllocation[];
}

/** Shares to sell from one buy lot. */
export interface LotSelection {
  buy_transaction_id: number;
  quantity: number;
}

export interface TransactionCreate {
  ticker: string;
  transaction_type: 'buy' | 'sell';
  quantity: number;
  price: number;
  fees?: number;
  transaction_date: string;
  notes?: string;
  /** The holding (ticker at one broker) the trade belongs to. */
  holding_id?: number;
  /** Sells only: which lots to sell from; left out, the oldest go first. */
  lots?: LotSelection[];
}
