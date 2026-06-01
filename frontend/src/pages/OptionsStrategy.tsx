interface OptionStrategy {
  strategy: string;
  action: string;
  type: string;
  strikePrice: string;
  objective: string;
}

const STRATEGIES: OptionStrategy[] = [
  {
    strategy: 'Cash-Secured Put (CSP)',
    action: 'SELL',
    type: 'PUT',
    strikePrice: 'Below Current Value (Standard / Out-of-the-Money)',
    objective: 'Want to get paid to buy the stock at a discount, or just collect income if it stays flat/goes up.',
  },
  {
    strategy: 'Cash-Secured Put (ITM)',
    action: 'SELL',
    type: 'PUT',
    strikePrice: 'Above Current Value (Aggressive / In-the-Money)',
    objective: 'Highly bullish; actively want to be assigned the stock right away while pocketing a massive premium.',
  },
  {
    strategy: 'Covered Call (Standard)',
    action: 'SELL',
    type: 'CALL',
    strikePrice: 'Above Current Value (Standard / Out-of-the-Money)',
    objective: 'Already own 100 shares; want to generate "rent" income while giving yourself room for some stock upside.',
  },
  {
    strategy: 'Covered Call (Aggressive)',
    action: 'SELL',
    type: 'CALL',
    strikePrice: 'Below Current Value (Defensive / In-the-Money)',
    objective: 'Already own 100 shares; want heavy downside protection or are happy to lock in a guaranteed sale right now for high premium.',
  },
  {
    strategy: 'Standard Long Call (OTM)',
    action: 'BUY',
    type: 'CALL',
    strikePrice: 'Above Current Value (Out-of-the-Money)',
    objective: 'Expecting a massive, explosive rally; want maximum leverage for very little starting cash (high risk, high reward).',
  },
  {
    strategy: 'At-The-Money Call (ATM)',
    action: 'BUY',
    type: 'CALL',
    strikePrice: 'Equal to Current Value (At-the-Money)',
    objective: 'Want to capture 100% of the upside momentum from the exact dollar the stock starts climbing, balancing moderate cost and 50/50 odds.',
  },
  {
    strategy: 'Deep In-The-Money Call (ITM)',
    action: 'BUY',
    type: 'CALL',
    strikePrice: 'Below Current Value (In-the-Money)',
    objective: 'Want to mimic owning the actual stock for a fraction of the price, maximizing your probability of success while keeping a hard floor to cap your absolute downside.',
  },
];

export default function OptionsStrategy() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Options Strategy Reference
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          A quick reference guide for common options strategies and their key characteristics.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  Strategy
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  Master Toggle Action
                </th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  Master Toggle Type
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  Strike Price Selection
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  Your Primary Objective
                </th>
              </tr>
            </thead>
            <tbody>
              {STRATEGIES.map((strategy, idx) => (
                <tr
                  key={idx}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 text-sm whitespace-nowrap">
                    {strategy.strategy}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                        strategy.action === 'SELL'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      }`}
                    >
                      {strategy.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                        strategy.type === 'PUT'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                      }`}
                    >
                      {strategy.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                    {strategy.strikePrice}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">
                    {strategy.objective}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
