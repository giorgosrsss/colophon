import { CaretRightIcon, FolderOpenIcon } from '@phosphor-icons/react';
import type { OpenedDocument } from '../../shared/types.ts';
import { Mark } from './Mark.tsx';

interface TitleBarProps {
  doc: OpenedDocument | null;
  dirty: boolean;
  onOpen(): void;
}

export function TitleBar({ doc, dirty, onOpen }: TitleBarProps) {
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <Mark />
        <span>Colophon</span>
      </div>
      {doc && (
        <div className="titlebar-doc">
          <CaretRightIcon size={11} weight="bold" />
          <span className="titlebar-name" title={doc.path}>
            {doc.name}
          </span>
          {dirty && <span className="titlebar-state">Edited</span>}
        </div>
      )}
      {doc && (
        <button className="button button-ghost titlebar-open" onClick={onOpen} title="Open another document (Ctrl+O)">
          <FolderOpenIcon />
          Open
        </button>
      )}
    </header>
  );
}
