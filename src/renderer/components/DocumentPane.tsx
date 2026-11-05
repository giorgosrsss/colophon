import { ArrowUpRightIcon } from '@phosphor-icons/react';
import type { OpenedDocument } from '../../shared/types.ts';
import { api } from '../api.ts';
import { formatBytes, formatNumber, readingMinutes } from '../format.ts';
import { Sheet } from './Sheet.tsx';
import '../styles/document.css';

export function DocumentPane({ doc }: { doc: OpenedDocument }) {
  const { content } = doc;
  const font = content.layout.fontFamily;

  return (
    <aside className="document-pane">
      <figure className="document-figure">
        <Sheet key={doc.path} content={content} />
        <figcaption>
          Page 1 of {formatNumber(content.pages)}
        </figcaption>
      </figure>

      <dl className="document-stats">
        <div>
          <dt>Words</dt>
          <dd className="num">{formatNumber(content.words)}</dd>
        </div>
        <div>
          <dt>Paragraphs</dt>
          <dd className="num">{formatNumber(content.paragraphs)}</dd>
        </div>
        <div>
          <dt>Reading time</dt>
          <dd className="num">
            {readingMinutes(content.words)}
            <small> min</small>
          </dd>
        </div>
      </dl>

      <div className="document-file">
        <p className="document-folder mono" title={doc.folder}>
          {doc.folder}
        </p>
        <p className="document-meta">
          {formatBytes(doc.size)}
          {font && (
            <>
              <span aria-hidden="true"> · </span>
              {font} {content.layout.fontSizePt} pt
            </>
          )}
        </p>
        <button className="link-button" onClick={() => api.reveal(doc.path)}>
          Show in folder
          <ArrowUpRightIcon size={12} weight="bold" />
        </button>
      </div>
    </aside>
  );
}
