import PortfolioAnalysis from '../components/utilities/PortfolioAnalysis';

export default function PortfolioAnalysisPage() {
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Portfolio Analysis</h1>
        <p className="text-sm text-slate-400 mt-0.5">Rule-based insights across concentration, risk, behaviour, and options.</p>
      </div>
      <PortfolioAnalysis />
    </div>
  );
}
