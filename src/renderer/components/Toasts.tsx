import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { Toast } from '../hooks.ts';

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-tone={toast.tone}>
          {toast.tone === 'error' ? <WarningCircleIcon size={17} weight="fill" /> : <CheckCircleIcon size={17} weight="fill" />}
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
