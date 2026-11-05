import type { Verdict } from '../detection.ts';

export type View = 'properties' | 'writing';

interface ViewSwitchProps {
  view: View;
  /** The AI check's result for this document, once it has run. */
  score: { percent: number; verdict: Verdict } | null;
  onChange(view: View): void;
}

export function ViewSwitch({ view, score, onChange }: ViewSwitchProps) {
  return (
    <div className="view-switch" role="tablist" aria-label="View">
      <button role="tab" aria-selected={view === 'properties'} onClick={() => onChange('properties')}>
        Properties
      </button>
      <button role="tab" aria-selected={view === 'writing'} onClick={() => onChange('writing')}>
        AI check
        {score && (
          <span className="view-score num" data-verdict={score.verdict}>
            {score.percent}%
          </span>
        )}
      </button>
    </div>
  );
}
