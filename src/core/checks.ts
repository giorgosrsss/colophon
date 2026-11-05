import { FIELD_LABELS } from '../shared/fields.ts';
import type { ContentStats, FieldKey, Fields } from '../shared/types.ts';

export interface Issue {
  key: FieldKey;
  message: string;
}

const MINUTE = 60_000;
const FUTURE_GRACE = 5 * MINUTE;

const DATED: FieldKey[] = ['created', 'modified', 'lastPrinted', 'fileCreated', 'fileModified', 'fileAccessed'];

/** Things that would look wrong to anyone who opens File > Info or the Properties dialog. */
export function findIssues(fields: Fields, content: ContentStats, now = Date.now()): Issue[] {
  const issues: Issue[] = [];
  const created = time(fields.created);
  const modified = time(fields.modified);

  if (created !== null && modified !== null && created > modified) {
    issues.push({ key: 'created', message: 'Created is later than Last saved.' });
  } else if (created !== null && modified !== null && fields.totalTime !== null) {
    const span = (modified - created) / MINUTE;
    if (fields.totalTime > span + 1) {
      issues.push({ key: 'totalTime', message: 'Editing time is longer than the gap between Created and Last saved.' });
    }
  }

  if (fields.totalTime === null) {
    issues.push({ key: 'totalTime', message: 'Total editing time is missing.' });
  }
  if (!fields.revision) {
    issues.push({ key: 'revision', message: 'Revision number is missing.' });
  }

  if (fields.words !== null && Math.abs(fields.words - content.words) > Math.max(3, content.words * 0.02)) {
    issues.push({
      key: 'words',
      message: `Word count says ${format(fields.words)}, but the text has ${format(content.words)}.`,
    });
  }

  const fileModified = time(fields.fileModified);
  if (fileModified !== null && modified !== null && fileModified < modified - 2 * MINUTE) {
    issues.push({ key: 'fileModified', message: 'Date modified on disk is earlier than Last saved.' });
  }

  for (const key of DATED) {
    const value = time(fields[key] as string | null);
    if (value !== null && value > now + FUTURE_GRACE) {
      issues.push({ key, message: `${FIELD_LABELS[key]} is in the future.` });
    }
  }

  return issues;
}

function time(iso: string | null): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function format(n: number): string {
  return n.toLocaleString();
}
