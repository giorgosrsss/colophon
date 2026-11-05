import type { DocumentProperties, FieldKey, Fields, FileTimes } from './types.ts';

export const FIELD_LABELS: Record<FieldKey, string> = {
  title: 'Title',
  subject: 'Subject',
  creator: 'Author',
  keywords: 'Tags',
  description: 'Comments',
  category: 'Category',
  contentStatus: 'Status',
  lastModifiedBy: 'Last saved by',
  revision: 'Revision number',
  created: 'Created',
  modified: 'Last saved',
  lastPrinted: 'Last printed',
  totalTime: 'Total editing time',
  pages: 'Pages',
  words: 'Words',
  characters: 'Characters (no spaces)',
  charactersWithSpaces: 'Characters (with spaces)',
  lines: 'Lines',
  paragraphs: 'Paragraphs',
  application: 'Application',
  appVersion: 'Version',
  template: 'Template',
  company: 'Company',
  manager: 'Manager',
  fileCreated: 'Date created',
  fileModified: 'Date modified',
  fileAccessed: 'Date accessed',
};

export const FIELD_KEYS = Object.keys(FIELD_LABELS) as FieldKey[];

export const FILE_TIME_KEYS: (keyof FileTimes)[] = ['fileCreated', 'fileModified', 'fileAccessed'];

const DATE_KEYS = new Set<FieldKey>(['created', 'modified', 'lastPrinted', ...FILE_TIME_KEYS]);

export function isDateKey(key: FieldKey): boolean {
  return DATE_KEYS.has(key);
}

export function isFileTimeKey(key: FieldKey): key is keyof FileTimes {
  return (FILE_TIME_KEYS as FieldKey[]).includes(key);
}

export function emptyProperties(): DocumentProperties {
  return {
    title: '',
    subject: '',
    creator: '',
    keywords: '',
    description: '',
    category: '',
    contentStatus: '',
    lastModifiedBy: '',
    revision: null,
    created: null,
    modified: null,
    lastPrinted: null,
    totalTime: null,
    pages: null,
    words: null,
    characters: null,
    charactersWithSpaces: null,
    lines: null,
    paragraphs: null,
    application: '',
    appVersion: '',
    template: '',
    company: '',
    manager: '',
  };
}

/** Dates compare by instant, so "…:00Z" and "…:00.000Z" count as the same value. */
export function sameValue(key: FieldKey, a: Fields[FieldKey], b: Fields[FieldKey]): boolean {
  if (isDateKey(key) && typeof a === 'string' && typeof b === 'string') {
    return Date.parse(a) === Date.parse(b);
  }
  return a === b;
}

export function changedKeys(from: Fields, to: Fields): FieldKey[] {
  return FIELD_KEYS.filter((key) => !sameValue(key, from[key], to[key]));
}

export function pickChanges(from: Fields, to: Fields): Partial<Fields> {
  const changes: Partial<Fields> = {};
  for (const key of changedKeys(from, to)) {
    Object.assign(changes, { [key]: to[key] });
  }
  return changes;
}
