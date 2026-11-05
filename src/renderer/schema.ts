import { FIELD_LABELS } from '../shared/fields.ts';
import type { FieldKey, Fields } from '../shared/types.ts';
import { formatDate, formatDuration, formatNumber } from './format.ts';

export type Control = 'text' | 'multiline' | 'number' | 'duration' | 'date' | 'precise-date';

export interface FieldDef {
  key: FieldKey;
  control: Control;
  label: string;
  hint?: string;
  wide?: boolean;
  clearable?: boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
}

function field(key: FieldKey, control: Control, extra: Partial<FieldDef> = {}): FieldDef {
  return { key, control, label: FIELD_LABELS[key], ...extra };
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'editing',
    title: 'Editing',
    description: 'Shown in Word under File > Info.',
    fields: [
      field('totalTime', 'duration'),
      field('revision', 'number', { hint: 'Word adds one every time the file is saved.' }),
    ],
  },
  {
    id: 'document-dates',
    title: 'Dates in the document',
    description: 'Stored inside the file, so they travel with it wherever it goes.',
    fields: [
      field('created', 'date'),
      field('modified', 'date'),
      field('lastPrinted', 'date', { clearable: true }),
    ],
  },
  {
    id: 'disk-dates',
    title: 'Dates on this computer',
    description: 'What File Explorer shows. Saving applies them exactly as set here.',
    fields: [
      field('fileCreated', 'precise-date'),
      field('fileModified', 'precise-date'),
      field('fileAccessed', 'precise-date', { hint: 'When the file was last opened.' }),
    ],
  },
  {
    id: 'counts',
    title: 'Counts',
    description: 'Saved statistics. Word recalculates them the next time it saves.',
    fields: [
      field('words', 'number'),
      field('pages', 'number'),
      field('paragraphs', 'number'),
      field('lines', 'number'),
      field('characters', 'number'),
      field('charactersWithSpaces', 'number'),
    ],
  },
  {
    id: 'people',
    title: 'People',
    fields: [field('creator', 'text'), field('lastModifiedBy', 'text'), field('manager', 'text'), field('company', 'text')],
  },
  {
    id: 'description',
    title: 'Description',
    fields: [
      field('title', 'text', { wide: true }),
      field('subject', 'text'),
      field('category', 'text'),
      field('keywords', 'text', { hint: 'Separate tags with semicolons.' }),
      field('contentStatus', 'text'),
      field('description', 'multiline', { wide: true }),
    ],
  },
  {
    id: 'application',
    title: 'Application',
    fields: [field('application', 'text'), field('appVersion', 'text'), field('template', 'text')],
  },
];

export const FIELD_DEFS = new Map(SECTIONS.flatMap((section) => section.fields.map((def) => [def.key, def])));

export function describeValue(def: FieldDef, value: Fields[FieldKey]): string {
  if (value === null || value === '') return 'empty';
  switch (def.control) {
    case 'duration':
      return formatDuration(Number(value));
    case 'number':
      return formatNumber(Number(value));
    case 'date':
      return formatDate(String(value));
    case 'precise-date':
      return formatDate(String(value), true);
    default: {
      const text = String(value).replace(/\s+/g, ' ');
      return `“${text.length > 28 ? `${text.slice(0, 27)}…` : text}”`;
    }
  }
}
