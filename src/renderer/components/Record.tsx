import type { Dispatch } from 'react';
import type { ContentStats, FieldKey } from '../../shared/types.ts';
import { formatNumber } from '../format.ts';
import { SECTIONS } from '../schema.ts';
import type { Session, SessionAction } from '../session.ts';
import { Field } from './Field.tsx';

/** What the text itself says, shown under a stored count when the two disagree. */
const FROM_TEXT: Partial<Record<FieldKey, { count(content: ContentStats): number; estimate?: boolean }>> = {
  words: { count: (c) => c.words },
  characters: { count: (c) => c.characters },
  charactersWithSpaces: { count: (c) => c.charactersWithSpaces },
  paragraphs: { count: (c) => c.paragraphs },
  pages: { count: (c) => c.pages, estimate: true },
  lines: { count: (c) => c.lines, estimate: true },
};

function textNote(key: FieldKey, value: unknown, content: ContentStats): string | undefined {
  const source = FROM_TEXT[key];
  if (!source) return undefined;
  const count = source.count(content);
  if (value === count) return undefined;
  return `Text: ${source.estimate ? 'about ' : ''}${formatNumber(count)}`;
}

interface RecordProps {
  session: Session;
  flash: ReadonlySet<FieldKey>;
  dispatch: Dispatch<SessionAction>;
}

export function Record({ session, flash, dispatch }: RecordProps) {
  const { doc, draft } = session;

  return (
    <div className="record">
      {SECTIONS.map((section) => (
        <section key={section.id} className="section" aria-labelledby={`section-${section.id}`}>
          <header className="section-head">
            <h2 id={`section-${section.id}`}>{section.title}</h2>
            {section.description && <p>{section.description}</p>}
          </header>
          <div className="section-grid">
            {section.fields.map((def) => (
              <Field
                key={def.key}
                def={def}
                value={draft[def.key]}
                saved={doc.fields[def.key]}
                note={textNote(def.key, draft[def.key], doc.content)}
                flash={flash.has(def.key)}
                onChange={(value) => dispatch({ type: 'edit', key: def.key, value })}
                onRestore={() => dispatch({ type: 'restore', key: def.key })}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
