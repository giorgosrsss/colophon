import { FileDocIcon, FolderOpenIcon, XIcon } from '@phosphor-icons/react';
import type { RecentDocument } from '../../shared/types.ts';
import { formatRelative } from '../format.ts';
import { Mark } from './Mark.tsx';
import '../styles/welcome.css';

interface WelcomeProps {
  recent: RecentDocument[];
  onOpen(): void;
  onOpenRecent(path: string): void;
  onForget(path: string): void;
}

export function Welcome({ recent, onOpen, onOpenRecent, onForget }: WelcomeProps) {
  return (
    <main className="welcome">
      <div className="welcome-intro">
        <Mark size={40} />
        <h1>Open a Word document</h1>
        <p className="welcome-lede">
          Change its editing time, dates, author and word counts. Nothing is written to the file until you save.
        </p>
        <button className="button button-primary welcome-open" onClick={onOpen}>
          <FolderOpenIcon size={17} />
          Open document
          <kbd>Ctrl+O</kbd>
        </button>
        <p className="welcome-hint">You can also drop a .docx file anywhere in this window.</p>
      </div>

      <section className="welcome-recent" aria-labelledby="recent-heading">
        <h2 id="recent-heading">Recent</h2>
        {recent.length > 0 ? (
          <ul className="recent-list">
            {recent.map((item) => (
              <li key={item.path} className="recent-row">
                <button className="recent-item" onClick={() => onOpenRecent(item.path)} title={item.path}>
                  <FileDocIcon size={22} className="recent-icon" />
                  <span className="recent-text">
                    <span className="recent-name">{item.name}</span>
                    <span className="recent-folder mono">{item.folder}</span>
                  </span>
                  <span className="recent-time">{formatRelative(item.openedAt)}</span>
                </button>
                <button
                  className="button button-ghost icon-button recent-remove"
                  onClick={() => onForget(item.path)}
                  aria-label={`Remove ${item.name} from the list`}
                  title="Remove from the list"
                >
                  <XIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="recent-empty">Documents you open will be listed here.</p>
        )}
      </section>
    </main>
  );
}
