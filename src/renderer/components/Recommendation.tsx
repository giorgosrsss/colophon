import { ArrowCounterClockwiseIcon, CheckIcon, RulerIcon, ShuffleIcon, WarningIcon } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { findIssues } from '../../core/checks.ts';
import { recommend } from '../../core/recommend.ts';
import type { WritingPlan } from '../../core/recommend.ts';
import type { FieldKey, Fields } from '../../shared/types.ts';
import { formatDay, formatDuration, plural } from '../format.ts';
import type { Session } from '../session.ts';

interface RecommendationProps {
  session: Session;
  onApply(fields: Fields, variant: number, changed: FieldKey[]): void;
  onUndo(): void;
  onNextVariant(): void;
  onFocusField(key: FieldKey): void;
}

export function Recommendation({ session, onApply, onUndo, onNextVariant, onFocusField }: RecommendationProps) {
  const { doc, draft, variant, beforeApply } = session;
  const { content } = doc;

  const suggestion = useMemo(() => recommend(content, draft, variant), [content, draft, variant]);
  const issues = useMemo(() => findIssues(draft, content), [draft, content]);
  const settled = suggestion.changes.length === 0;

  // Once applied, another variation replaces the applied one instead of stacking on top of it.
  const shuffle = () => {
    if (!settled) return onNextVariant();
    const next = recommend(content, beforeApply ?? draft, variant + 1);
    onApply(next.fields, variant + 1, next.changes);
  };

  let title = `Recommended for ${plural(content.words, 'word')}`;
  if (settled) title = beforeApply ? 'Recommended values applied' : 'Matches the recommendation';

  return (
    <section className="advice" data-settled={settled || undefined} aria-live="polite">
      <div className="advice-main">
        <div className="advice-icon" aria-hidden="true">
          {settled ? <CheckIcon size={17} weight="bold" /> : <RulerIcon size={18} />}
        </div>
        <div className="advice-text">
          <h2>{title}</h2>
          <p>
            {describePlan(suggestion.plan)}
            {settled && beforeApply && ' Look over the highlighted fields, then save.'}
          </p>
        </div>
        <div className="advice-actions">
          {settled && beforeApply && (
            <button className="button button-secondary" onClick={onUndo}>
              <ArrowCounterClockwiseIcon />
              Undo
            </button>
          )}
          <button
            className="button button-ghost icon-button"
            onClick={shuffle}
            title="Try another variation"
            aria-label="Try another variation"
          >
            <ShuffleIcon />
          </button>
          {!settled && (
            <button
              className="button button-accent"
              onClick={() => onApply(suggestion.fields, variant, suggestion.changes)}
            >
              Apply {plural(suggestion.changes.length, 'change')}
            </button>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="advice-issues">
          {issues.map((issue) => (
            <li key={`${issue.key}-${issue.message}`}>
              <button className="issue" onClick={() => onFocusField(issue.key)}>
                <WarningIcon size={15} weight="fill" />
                <span>{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describePlan({ minutes, sittings, saves, started, finished }: WritingPlan): string {
  const from = formatDay(started);
  const to = formatDay(finished);
  const when = from === to ? `on ${to}` : `between ${from} and ${to}`;
  return `About ${formatDuration(minutes)} of editing over ${plural(sittings, 'sitting')} and ${plural(saves, 'save')}, ${when}.`;
}
