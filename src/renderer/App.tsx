import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { changedKeys, pickChanges } from '../shared/fields.ts';
import type { OpenedDocument, RecentDocument } from '../shared/types.ts';
import { api, isDocumentPath } from './api.ts';
import { DropOverlay } from './components/DropOverlay.tsx';
import { TitleBar } from './components/TitleBar.tsx';
import { Toasts } from './components/Toasts.tsx';
import { Welcome } from './components/Welcome.tsx';
import { Workspace } from './components/Workspace.tsx';
import { useFileDrop, useLatest, useShortcuts, useToasts } from './hooks.ts';
import { sessionReducer } from './session.ts';
import './styles/layout.css';

export function App() {
  const [session, dispatch] = useReducer(sessionReducer, null);
  const [recent, setRecent] = useState<RecentDocument[]>([]);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const { toasts, notify } = useToasts();

  const changes = useMemo(() => (session ? changedKeys(session.doc.fields, session.draft) : []), [session]);
  const dirty = changes.length > 0;

  const refreshRecent = useCallback(() => {
    api.recent().then(setRecent, () => setRecent([]));
  }, []);

  useEffect(refreshRecent, [refreshRecent]);

  useEffect(() => {
    api.setDirty(dirty);
    if (dirty) setJustSaved(false);
  }, [dirty]);

  useEffect(() => {
    document.title = session ? `${session.doc.name} - Colophon` : 'Colophon';
  }, [session]);

  async function openWith(task: () => Promise<OpenedDocument | null>) {
    if (session && dirty && !(await api.confirmDiscard(session.doc.name))) return;
    try {
      const doc = await task();
      if (!doc) return;
      dispatch({ type: 'load', doc });
      setJustSaved(false);
    } catch (error) {
      notify(messageOf(error), 'error');
    } finally {
      refreshRecent();
    }
  }

  const openDialog = () => openWith(api.open);
  const openPath = (path: string) => openWith(() => api.openPath(path));

  async function save(asCopy: boolean) {
    if (!session || saving) return;
    const edits = pickChanges(session.doc.fields, session.draft);
    if (!asCopy && Object.keys(edits).length === 0) return;

    setSaving(true);
    try {
      const doc = asCopy ? await api.saveAs(session.doc.path, edits) : await api.save(session.doc.path, edits);
      if (!doc) return;
      dispatch({ type: 'load', doc });
      setJustSaved(true);
      notify(asCopy ? `Saved as ${doc.name}` : `Saved ${doc.name}`);
      refreshRecent();
    } catch (error) {
      notify(messageOf(error), 'error');
    } finally {
      setSaving(false);
    }
  }

  const latestOpenPath = useLatest(openPath);
  useEffect(() => api.onOpenRequest((path) => latestOpenPath.current(path)), [latestOpenPath]);

  const dragging = useFileDrop((file) => {
    const path = api.pathForFile(file);
    if (path && isDocumentPath(path)) openPath(path);
    else notify('Only Word documents (.docx) can be opened.', 'error');
  });

  useShortcuts({
    o: openDialog,
    s: () => save(false),
    'Shift+s': () => save(true),
  });

  return (
    <div className="app">
      <TitleBar doc={session?.doc ?? null} dirty={dirty} onOpen={openDialog} />
      {session ? (
        <Workspace
          session={session}
          dispatch={dispatch}
          changes={changes.length}
          saving={saving}
          justSaved={justSaved}
          onSave={() => save(false)}
          onSaveAs={() => save(true)}
        />
      ) : (
        <Welcome
          recent={recent}
          onOpen={openDialog}
          onOpenRecent={openPath}
          onForget={(path) => api.forget(path).then(refreshRecent)}
        />
      )}
      {dragging && <DropOverlay />}
      <Toasts toasts={toasts} />
    </div>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
