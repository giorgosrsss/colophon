import { ArrowCounterClockwiseIcon, CheckIcon } from '@phosphor-icons/react';
import { plural } from '../format.ts';

interface ActionBarProps {
  changes: number;
  saving: boolean;
  justSaved: boolean;
  onRevert(): void;
  onSave(): void;
  onSaveAs(): void;
}

export function ActionBar({ changes, saving, justSaved, onRevert, onSave, onSaveAs }: ActionBarProps) {
  let status = 'No changes';
  if (changes > 0) status = plural(changes, 'unsaved change');
  else if (justSaved) status = 'All changes saved';

  return (
    <footer className="actionbar">
      <p className="actionbar-status" data-pending={changes > 0 || undefined}>
        {justSaved && changes === 0 && <CheckIcon size={14} weight="bold" />}
        {status}
      </p>
      <div className="actionbar-buttons">
        <button className="button button-ghost" disabled={changes === 0 || saving} onClick={onRevert}>
          <ArrowCounterClockwiseIcon />
          Revert
        </button>
        <button className="button button-secondary" disabled={saving} onClick={onSaveAs} title="Save a copy (Ctrl+Shift+S)">
          Save as…
        </button>
        <button className="button button-primary" disabled={changes === 0 || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save'}
          <kbd>Ctrl+S</kbd>
        </button>
      </div>
    </footer>
  );
}
