import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { FieldKey, Fields } from '../../shared/types.ts';
import type { Session, SessionAction } from '../session.ts';
import { ActionBar } from './ActionBar.tsx';
import { DocumentPane } from './DocumentPane.tsx';
import { Recommendation } from './Recommendation.tsx';
import { Record } from './Record.tsx';
import { RecordHeader } from './RecordHeader.tsx';
import { ViewSwitch } from './ViewSwitch.tsx';
import type { View } from './ViewSwitch.tsx';
import { useDetection, verdictOf } from '../detection.ts';
import { AiCheck } from './AiCheck.tsx';
import '../styles/record.css';

interface WorkspaceProps {
  session: Session;
  dispatch: Dispatch<SessionAction>;
  changes: number;
  saving: boolean;
  justSaved: boolean;
  onSave(): void;
  onSaveAs(): void;
}

const FLASH_MS = 1200;

export function Workspace({ session, dispatch, changes, saving, justSaved, onSave, onSaveAs }: WorkspaceProps) {
  const [view, setView] = useState<View>('properties');
  const detection = useDetection(session.doc, view === 'writing');
  const score = detection.result
    ? { percent: Math.round(detection.result.probability * 100), verdict: verdictOf(detection.result.probability) }
    : null;
  const [flash, setFlash] = useState<ReadonlySet<FieldKey>>(new Set());
  const flashTimer = useRef<number | undefined>(undefined);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [session.doc]);

  const highlight = useCallback((keys: FieldKey[]) => {
    window.clearTimeout(flashTimer.current);
    setFlash(new Set(keys));
    flashTimer.current = window.setTimeout(() => setFlash(new Set()), FLASH_MS);
  }, []);

  const switchView = (next: View) => {
    setView(next);
    scroller.current?.scrollTo({ top: 0 });
  };

  const apply = (fields: Fields, variant: number, keys: FieldKey[]) => {
    dispatch({ type: 'apply', fields, variant });
    highlight(keys);
  };

  return (
    <main className="workspace">
      <DocumentPane doc={session.doc} />
      <section className="record-pane">
        <div className="record-scroll" ref={scroller}>
          <div className="record-column">
            <RecordHeader doc={session.doc} draft={session.draft} />
            <ViewSwitch view={view} score={score} onChange={switchView} />
            {view === 'properties' ? (
              <>
                <Recommendation
                  session={session}
                  onApply={apply}
                  onUndo={() => dispatch({ type: 'undo-apply' })}
                  onNextVariant={() => dispatch({ type: 'next-variant' })}
                  onFocusField={focusField}
                />
                <Record session={session} flash={flash} dispatch={dispatch} />
              </>
            ) : (
              <AiCheck writing={session.doc.content.writing} detection={detection} />
            )}
          </div>
        </div>
        <ActionBar
          changes={changes}
          saving={saving}
          justSaved={justSaved}
          onRevert={() => dispatch({ type: 'restore-all' })}
          onSave={onSave}
          onSaveAs={onSaveAs}
        />
      </section>
    </main>
  );
}

function focusField(key: FieldKey) {
  const input = document.getElementById(`field-${key}`);
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
}
