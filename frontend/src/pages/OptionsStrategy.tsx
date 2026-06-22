interface OptionStrategy {
  strategy: string;
  openingAction: string;
  whatYoureDoing: string;
  closingAction: string;
  profitWhenClosingEarly: string;
}

const STRATEGIES: OptionStrategy[] = [
  {
    strategy: 'Cash-Secured Put (Standard / OTM)',
    openingAction: 'Sell to Open (Put)',
    whatYoureDoing: 'Collect premium while holding cash aside to buy 100 shares at the strike, aiming for a discount entry',
    closingAction: 'Buy to Close',
    profitWhenClosingEarly: 'Option price has fallen below what you sold it for',
  },
  {
    strategy: 'Cash-Secured Put (Aggressive / ITM)',
    openingAction: 'Sell to Open (Put)',
    whatYoureDoing: 'Collect a large premium while actively wanting to be assigned the stock right away',
    closingAction: 'Buy to Close',
    profitWhenClosingEarly: 'Option price has fallen below what you sold it for',
  },
  {
    strategy: 'Covered Call (Standard)',
    openingAction: 'Sell to Open (Call)',
    whatYoureDoing: 'Collect premium while owning 100 shares',
    closingAction: 'Buy to Close',
    profitWhenClosingEarly: 'Option price has fallen below what you sold it for',
  },
  {
    strategy: 'Covered Call (Aggressive / ITM)',
    openingAction: 'Sell to Open (Call)',
    whatYoureDoing: 'Collect a large premium while owning 100 shares, prioritizing downside protection or accepting an early sale',
    closingAction: 'Buy to Close',
    profitWhenClosingEarly: 'Option price has fallen below what you sold it for',
  },
  {
    strategy: 'Standard Long Call (OTM)',
    openingAction: 'Buy to Open (Call)',
    whatYoureDoing: 'Pay premium for maximum leveraged upside, betting on a big rally before expiration',
    closingAction: 'Sell to Close',
    profitWhenClosingEarly: 'Option price has risen above what you paid for it',
  },
  {
    strategy: 'At-The-Money Call (ATM)',
    openingAction: 'Buy to Open (Call)',
    whatYoureDoing: "Pay premium to capture the stock's upside from the current price, balancing moderate cost with 50/50 odds",
    closingAction: 'Sell to Close',
    profitWhenClosingEarly: 'Option price has risen above what you paid for it',
  },
  {
    strategy: 'Deep In-The-Money Call (ITM)',
    openingAction: 'Buy to Open (Call)',
    whatYoureDoing: 'Pay a larger premium to mimic owning the stock for a fraction of the price, with a higher probability of success and a built-in downside cushion',
    closingAction: 'Sell to Close',
    profitWhenClosingEarly: 'Option price has risen above what you paid for it',
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
                  Strategy / Position
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  Opening Action
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  What You're Doing
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  Closing Action
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 text-sm">
                  Profit When Closing Early
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
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                        strategy.openingAction.startsWith('Sell')
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      }`}
                    >
                      {strategy.openingAction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">
                    {strategy.whatYoureDoing}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm whitespace-nowrap">
                    {strategy.closingAction}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">
                    {strategy.profitWhenClosingEarly}
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
