import { PALETTES, useUIStore, type Palette } from '../store/uiStore';

/** Fixed preview colours (background, surface, accent, gain, loss), so each
    swatch shows its own palette whichever one is active. */
const SWATCHES: Record<Palette, string[]> = {
  classic: ['#0f172a', '#e2e8f0', '#1d4ed8', '#10b981', '#ef4444'],
  brass: ['#23162a', '#f3eadb', '#bf8a24', '#1d8d6e', '#e04a2b'],
};

export default function Settings() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const palette = useUIStore((state) => state.palette);
  const setPalette = useUIStore((state) => state.setPalette);

  const refreshIntervalMinutes = 15;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Settings
      </h1>

      {/* Theme Section */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Appearance
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Choose your preferred display theme. Your selection is saved automatically.
        </p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="theme"
              value="light"
              checked={theme === 'light'}
              onChange={() => setTheme('light')}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Light
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="theme"
              value="dark"
              checked={theme === 'dark'}
              onChange={() => setTheme('dark')}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Dark
            </span>
          </label>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Current theme: <span className="font-medium capitalize">{theme}</span>
        </p>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Colour palette
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PALETTES.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                  palette === p.id
                    ? 'border-blue-600 ring-1 ring-blue-600'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="palette"
                  value={p.id}
                  checked={palette === p.id}
                  onChange={() => setPalette(p.id)}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {p.label}
                </span>
                <span className="flex overflow-hidden rounded-md" aria-hidden="true">
                  {SWATCHES[p.id].map((color) => (
                    <span key={color} className="h-6 w-4" style={{ background: color }} />
                  ))}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* Refresh Interval Section */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Data Refresh
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Market data is refreshed automatically at the interval configured on the backend.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Refresh interval:
          </span>
          <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-sm font-medium text-blue-700 dark:text-blue-300">
            {refreshIntervalMinutes} minutes
          </span>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          This value is configured via the REFRESH_INTERVAL_MINUTES environment variable on the backend server.
        </p>
      </section>
    </div>
  );
}
