import { changedKeys } from '../shared/fields.ts';
import type { ContentStats, FieldKey, Fields } from '../shared/types.ts';

/** Drafting pace for prose, including the rereading and fixing that goes with it. */
const WORDS_PER_HOUR = 430;
const MINUTE = 60_000;
const DAY = 86_400_000;

export interface WritingPlan {
  minutes: number;
  sittings: number;
  saves: number;
  started: string;
  finished: string;
}

export interface Recommendation {
  fields: Fields;
  changes: FieldKey[];
  plan: WritingPlan;
}

/**
 * Values a document of this length usually carries when it was written by hand in Word.
 * The same text and variant always give the same answer, and applying a recommendation
 * and asking again changes nothing.
 */
export function recommend(content: ContentStats, current: Fields, variant = 0, now = Date.now()): Recommendation {
  const random = seededRandom(content.fingerprint ^ Math.imul(variant + 1, 0x9e3779b1));
  const words = content.words;

  const lastSave = parseTime(current.modified) ?? parseTime(current.fileModified) ?? now;
  const finished = floorToMinute(Math.min(lastSave, now));

  const minutes = editingMinutes(words, random);
  const sittings = words === 0 ? 1 : clamp(Math.round(minutes / random.between(55, 85)), 1, 90);
  const started = startTime(finished, minutes, sittings, random);
  const saves = Math.max(sittings, Math.round(sittings * 1.5 + minutes / random.between(7, 11)));

  // Word stores its dates to the minute. The file system keeps the seconds of the actual save.
  const fileCreated = Math.min(started + random.int(1, 6) * MINUTE + random.int(0, 59) * 1000, finished);
  const fileModified = finished + random.int(0, 59) * 1000;
  const fileAccessed = fileModified + random.int(0, 4) * MINUTE + random.int(0, 59) * 1000;

  const fields: Fields = {
    ...current,
    totalTime: minutes,
    revision: saves,
    created: toIso(started),
    modified: toIso(finished),
    words: content.words,
    characters: content.characters,
    charactersWithSpaces: content.charactersWithSpaces,
    paragraphs: content.paragraphs,
    lines: keepIfClose(current.lines, content.lines, 0.25),
    pages: keepIfClose(current.pages, content.pages, 0.35),
    lastModifiedBy: current.lastModifiedBy.trim() ? current.lastModifiedBy : current.creator,
    application: current.application.trim() || 'Microsoft Office Word',
    appVersion: current.appVersion.trim() || '16.0000',
    template: current.template.trim() || 'Normal.dotm',
    fileCreated: toIso(fileCreated),
    fileModified: toIso(fileModified),
    fileAccessed: toIso(fileAccessed),
  };

  return {
    fields,
    changes: changedKeys(current, fields),
    plan: { minutes, sittings, saves, started: toIso(started), finished: toIso(finished) },
  };
}

function editingMinutes(words: number, random: Random): number {
  if (words === 0) return random.int(1, 3);
  const drafting = (words / WORDS_PER_HOUR) * 60;
  const overhead = 4 + Math.sqrt(words) * 0.6;
  return Math.max(2, Math.round((drafting + overhead) * random.between(0.9, 1.15)));
}

/** One sitting finishes within the hour it started. Longer work is spread over days, mostly in the afternoon. */
function startTime(finished: number, minutes: number, sittings: number, random: Random): number {
  const latest = floorToMinute(finished - (minutes + random.int(3, 20)) * MINUTE);
  if (sittings === 1) return latest;

  const days = Math.max(1, Math.round((sittings - 1) * random.between(0.9, 1.6)));
  const first = new Date(finished - days * DAY);
  first.setHours(random.int(9, 20), random.int(0, 59), 0, 0);
  return Math.min(first.getTime(), latest);
}

/** Word's own page and line counts come from real layout, so they win over our estimate unless clearly stale. */
function keepIfClose(stored: number | null, estimate: number, tolerance: number): number {
  if (stored && stored > 0 && Math.abs(stored - estimate) <= Math.max(1, estimate * tolerance)) return stored;
  return estimate;
}

function parseTime(iso: string | null): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

function floorToMinute(time: number): number {
  return Math.floor(time / MINUTE) * MINUTE;
}

function toIso(time: number): string {
  return new Date(time).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface Random {
  between(min: number, max: number): number;
  int(min: number, max: number): number;
}

/** mulberry32 */
function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    between: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
  };
}
