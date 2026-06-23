import { useState, useEffect, useCallback } from 'react';
import { useCreateHolding, useUpdateHolding } from '../../hooks/useHoldings';
import { useCreateETFHolding } from '../../hooks/useETFHoldings';
import apiClient from '../../api/client';
import type { Holding, HoldingCreate } from '../../types';
import { AxiosError } from 'axios';

interface HoldingFormProps {
  holding?: Holding | null;
  holdingType?: 'stock' | 'etf';
  onClose: () => void;
}

interface FormErrors {
  ticker?: string;
  quantity?: string;
  buy_price?: string;
  general?: string;
}

interface FormData {
  ticker: string;
  quantity: string;
  buy_price: string;
  company_name: string;
  sector: string;
  industry: string;
  broker: string;
  notes: string;
}

interface TickerInfo {
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  notes: string | null;
}

const inputClass =
  'w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 focus:border-transparent transition';

const labelClass =
  'block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5';

export default function HoldingForm({ holding, holdingType = 'stock', onClose }: HoldingFormProps) {
  const isEditing = !!holding;
  const createMutation = holdingType === 'etf' ? useCreateETFHolding() : useCreateHolding();
  const updateMutation = useUpdateHolding();

  const [formData, setFormData] = useState<FormData>({
    ticker: holding?.ticker ?? '',
    quantity: holding?.quantity?.toString() ?? '',
    buy_price: holding?.average_buy_price?.toString() ?? '',
    company_name: holding?.company_name ?? '',
    sector: holding?.sector ?? '',
    industry: holding?.industry ?? '',
    broker: holding?.broker ?? '',
    notes: '',
  });

  const [brokers, setBrokers] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [infoFetched, setInfoFetched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get('/api/market/brokers')
      .then((res) => {
        if (res.data.success) setBrokers(res.data.data);
      })
      .catch(() => setBrokers(['Robinhood', 'Schwab', 'Merrill']));
  }, []);

  useEffect(() => {
    if (holding) {
      setFormData({
        ticker: holding.ticker,
        quantity: holding.quantity.toString(),
        buy_price: holding.average_buy_price.toString(),
        company_name: holding.company_name ?? '',
        sector: holding.sector ?? '',
        industry: holding.industry ?? '',
        broker: holding.broker ?? '',
        notes: '',
      });
      setInfoFetched(true);
    }
  }, [holding]);

  const fetchTickerInfo = useCallback(async (ticker: string) => {
    if (!ticker || ticker.length < 1 || !/^[A-Z]{1,5}$/.test(ticker)) return;
    setIsFetchingInfo(true);
    setFetchError(null);
    try {
      const response = await apiClient.get(`/api/market/info/${ticker}`);
      const data = response.data;
      if (data.success && data.data) {
        const info: TickerInfo = data.data;
        setFormData((prev) => ({
          ...prev,
          company_name: info.company_name ?? '',
          sector: info.sector ?? '',
          industry: info.industry ?? '',
          notes: info.notes ?? '',
        }));
        setInfoFetched(true);
        setFetchError(null);
      } else {
        setFetchError('Could not find company info for this ticker');
        setInfoFetched(false);
      }
    } catch {
      setFetchError('Could not fetch company info. You can still add the holding.');
      setInfoFetched(false);
    } finally {
      setIsFetchingInfo(false);
    }
  }, []);

  useEffect(() => {
    if (isEditing) return;
    const ticker = formData.ticker.trim();
    if (ticker.length >= 1 && /^[A-Z]{1,5}$/.test(ticker)) {
      const debounce = setTimeout(() => fetchTickerInfo(ticker), 600);
      return () => clearTimeout(debounce);
    } else {
      setInfoFetched(false);
      setFetchError(null);
      setFormData((prev) => ({ ...prev, company_name: '', sector: '', industry: '', notes: '' }));
    }
  }, [formData.ticker, isEditing, fetchTickerInfo]);

  function validate(): FormErrors {
    const newErrors: FormErrors = {};
    const ticker = formData.ticker.trim().toUpperCase();
    if (!ticker) newErrors.ticker = 'Ticker is required';
    else if (!/^[A-Z]{1,5}$/.test(ticker))
      newErrors.ticker = 'Ticker must be 1–5 uppercase letters';
    const quantity = parseFloat(formData.quantity);
    if (!formData.quantity.trim()) newErrors.quantity = 'Quantity is required';
    else if (isNaN(quantity) || quantity <= 0)
      newErrors.quantity = 'Quantity must be greater than 0';
    const buyPrice = parseFloat(formData.buy_price);
    if (!formData.buy_price.trim()) newErrors.buy_price = 'Buy price is required';
    else if (isNaN(buyPrice) || buyPrice < 0.01)
      newErrors.buy_price = 'Buy price must be at least $0.01';
    return newErrors;
  }

  function parseBackendErrors(error: unknown): FormErrors {
    if (error instanceof AxiosError && error.response) {
      const { status, data } = error.response;
      if (status === 422) {
        if (data?.detail && Array.isArray(data.detail)) {
          const fieldErrors: FormErrors = {};
          for (const err of data.detail) {
            const field = err.loc?.[err.loc.length - 1];
            if (field && typeof field === 'string')
              fieldErrors[field as keyof FormErrors] = err.msg;
          }
          return fieldErrors;
        }
        if (data?.error) return { general: data.error };
      }
      if (data?.error) return { general: data.error };
    }
    if (error instanceof Error) return { general: error.message };
    return { general: 'An unexpected error occurred' };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    const payload: HoldingCreate = {
      ticker: formData.ticker.trim().toUpperCase(),
      quantity: parseFloat(formData.quantity),
      buy_price: parseFloat(formData.buy_price),
      ...(formData.company_name.trim() && { company_name: formData.company_name.trim() }),
      ...(formData.sector.trim() && { sector: formData.sector.trim() }),
      ...(formData.industry.trim() && { industry: formData.industry.trim() }),
      ...(formData.broker && { broker: formData.broker }),
      ...(formData.notes.trim() && { notes: formData.notes.trim() }),
    };
    try {
      if (isEditing && holding) {
        await updateMutation.mutateAsync({
          id: holding.id,
          holding: {
            company_name: formData.company_name.trim() || undefined,
            sector: formData.sector.trim() || undefined,
            industry: formData.industry.trim() || undefined,
            notes: formData.notes.trim() || undefined,
          },
        });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (error: unknown) {
      setErrors(parseBackendErrors(error));
    }
  }

  function handleTickerChange(value: string) {
    const upper = value
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 5);
    setFormData((prev) => ({ ...prev, ticker: upper }));
    if (errors.ticker)
      setErrors((prev) => {
        const n = { ...prev };
        delete n.ticker;
        return n;
      });
  }

  function handleChange(field: keyof FormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors])
      setErrors((prev) => {
        const n = { ...prev };
        delete n[field as keyof FormErrors];
        return n;
      });
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="holding-form-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* dark header */}
        <div className="bg-slate-900 dark:bg-slate-950 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 id="holding-form-title" className="text-base font-bold text-white">
              {isEditing
                ? `Edit ${holdingType === 'etf' ? 'ETF' : 'Stock'} Holding`
                : `Add ${holdingType === 'etf' ? 'ETF' : 'Stock'} Holding`}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEditing
                ? 'Update the details below'
                : "Enter a ticker and we'll fetch company details automatically"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {errors.general && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="w-4 h-4 text-red-500 flex-shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0-4a.75.75 0 0 1-.75-.75v-3.5a.75.75 0 0 1 1.5 0v3.5A.75.75 0 0 1 8 11Zm0 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm text-red-700 dark:text-red-400">{errors.general}</span>
            </div>
          )}

          {/* Ticker */}
          <div>
            <label htmlFor="ticker" className={labelClass}>
              Ticker Symbol <span className="text-red-400 font-normal normal-case">*</span>
            </label>
            <div className="relative">
              <input
                id="ticker"
                type="text"
                value={formData.ticker}
                onChange={(e) => handleTickerChange(e.target.value)}
                disabled={isEditing}
                maxLength={5}
                placeholder="e.g. AAPL"
                className={`${inputClass} uppercase ${errors.ticker ? 'border-red-400 focus:ring-red-400' : ''} ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              {isFetchingInfo && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg
                    className="animate-spin h-4 w-4 text-slate-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>
              )}
            </div>
            {errors.ticker && <p className="mt-1 text-xs text-red-500">{errors.ticker}</p>}
            {fetchError && !errors.ticker && (
              <p className="mt-1 text-xs text-amber-500">{fetchError}</p>
            )}
          </div>

          {/* Company info (auto-fetched) */}
          {infoFetched && formData.company_name && (
            <div className="px-3 py-2.5 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="w-3.5 h-3.5 text-sky-500"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-xs font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-wider">
                  Company info loaded
                </span>
              </div>
              <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">
                {formData.company_name}
              </p>
              {(formData.sector || formData.industry) && (
                <p className="text-xs text-sky-600 dark:text-sky-400">
                  {[formData.sector, formData.industry].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          )}

          {/* Quantity + Buy Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="quantity" className={labelClass}>
                Quantity <span className="text-red-400 font-normal normal-case">*</span>
              </label>
              <input
                id="quantity"
                type="number"
                step="any"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', e.target.value)}
                disabled={isEditing}
                placeholder="e.g. 10"
                className={`${inputClass} ${errors.quantity ? 'border-red-400 focus:ring-red-400' : ''} ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              {errors.quantity && <p className="mt-1 text-xs text-red-500">{errors.quantity}</p>}
            </div>
            <div>
              <label htmlFor="buy_price" className={labelClass}>
                Buy Price/Share <span className="text-red-400 font-normal normal-case">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  $
                </span>
                <input
                  id="buy_price"
                  type="number"
                  step="0.01"
                  value={formData.buy_price}
                  onChange={(e) => handleChange('buy_price', e.target.value)}
                  disabled={isEditing}
                  placeholder="0.00"
                  className={`${inputClass} pl-7 ${errors.buy_price ? 'border-red-400 focus:ring-red-400' : ''} ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              {errors.buy_price && <p className="mt-1 text-xs text-red-500">{errors.buy_price}</p>}
            </div>
          </div>

          {/* Broker */}
          <div>
            <label htmlFor="broker" className={labelClass}>
              Broker
            </label>
            <select
              id="broker"
              value={formData.broker}
              onChange={(e) => handleChange('broker', e.target.value)}
              className={inputClass}
            >
              <option value="">Select broker…</option>
              {brokers.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </form>

        {/* footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || isFetchingInfo}
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting
              ? 'Saving…'
              : isEditing
                ? 'Save Changes'
                : `Add ${holdingType === 'etf' ? 'ETF' : 'Holding'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
