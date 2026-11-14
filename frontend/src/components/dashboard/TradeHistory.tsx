import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { LoadingSpinner } from '../shared';
import { fmtDate } from '../../utils/date';

interface SellRecord {
  id: number;
  ticker: string;
  quantity: number;
  price: number;
  fees: number;
  transaction_date: string;
  cost_basis: number;
  realized_gain: number;
}

export default function TradeHistory() {
  const { data: sells, isLoading } = useQuery({
    queryKey: ['transactions', 'sells'],
    queryFn: async () => {
      const response = await apiClient.get('/api/transactions/sells');
      return response.data.data as SellRecord[];
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Trade History (Sells)
        </h2>
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  const sellRecords = sells ?? [];

  if (sellRecords.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Trade History (Sells)
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No sell transactions recorded yet.
        </p>
      </div>
    );
  }

  const formatCurrency = (value: number | undefined | null) =>
    (value ?? 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  const formatDate = fmtDate;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Trade History (Sells)
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Ticker</th>
              <th className="pb-2 pr-4 font-medium text-right">Qty</th>
              <th className="pb-2 pr-4 font-medium text-right">Sell Price</th>
              <th className="pb-2 pr-4 font-medium text-right">Cost Basis</th>
              <th className="pb-2 pr-4 font-medium text-right">Realized Gain</th>
            </tr>
          </thead>
          <tbody>
            {sellRecords.map((sell) => {
              const gain = sell.realized_gain ?? 0;
              const gainColor =
                gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

              return (
                <tr key={sell.id} className="border-b border-gray-100 dark:border-gray-700/50">
                  <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">
                    {formatDate(sell.transaction_date)}
                  </td>
                  <td className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100">
                    {sell.ticker}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-900 dark:text-gray-100">
                    {sell.quantity}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-900 dark:text-gray-100">
                    {formatCurrency(sell.price)}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-500 dark:text-gray-400">
                    {formatCurrency(sell.cost_basis)}
                  </td>
                  <td className={`py-2 pr-4 text-right font-semibold ${gainColor}`}>
                    {gain >= 0 ? '+' : ''}
                    {formatCurrency(gain)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300 dark:border-gray-600">
              <td
                colSpan={5}
                className="pt-3 pr-4 text-right font-semibold text-gray-700 dark:text-gray-300"
              >
                Total Realized:
              </td>
              <td
                className={`pt-3 pr-4 text-right font-bold ${
                  sellRecords.reduce((sum, s) => sum + (s.realized_gain ?? 0), 0) >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {sellRecords.reduce((sum, s) => sum + (s.realized_gain ?? 0), 0) >= 0 ? '+' : ''}
                {formatCurrency(sellRecords.reduce((sum, s) => sum + (s.realized_gain ?? 0), 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
