import type { Fields, OpenedDocument } from '../../shared/types.ts';
import { formatDate } from '../format.ts';

export function RecordHeader({ doc, draft }: { doc: OpenedDocument; draft: Fields }) {
  const titleParagraph = doc.content.excerpt.find((p) => p.kind === 'title')?.text;
  const title = draft.title.trim() || titleParagraph?.trim() || doc.name.replace(/\.[^.]+$/, '');
  const savedBy = draft.lastModifiedBy.trim() || draft.creator.trim();

  return (
    <header className="record-header">
      <h1>{title}</h1>
      <p>
        {draft.modified ? `Last saved ${formatDate(draft.modified)}` : 'Never saved by Word'}
        {savedBy && ` by ${savedBy}`}
      </p>
    </header>
  );
}
