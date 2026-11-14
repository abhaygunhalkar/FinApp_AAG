import OptionsLogForm from './OptionsLogForm';

export default function OptionsLogModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: any }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl mx-4 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-xl">
        <OptionsLogForm editing={editing} onClose={onClose} />
      </div>
    </div>
  );
}
