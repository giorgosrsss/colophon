const numbers = new Intl.NumberFormat();
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateTimeSeconds = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const READING_WORDS_PER_MINUTE = 238;

export function formatNumber(n: number): string {
  return numbers.format(n);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatDate(iso: string, seconds = false): string {
  return (seconds ? dateTimeSeconds : dateTime).format(new Date(iso));
}

export function formatDay(iso: string): string {
  return day.format(new Date(iso));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

export function formatRelative(iso: string, now = Date.now()): string {
  const delta = Date.parse(iso) - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(delta) >= size) return relative.format(Math.round(delta / size), unit);
  }
  return 'just now';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Download sizes in decimal units, the way the hosting site lists them. */
export function formatDownloadSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** datetime-local inputs speak local wall-clock time; the app stores UTC instants. */
export function toInputValue(iso: string | null, seconds: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  const value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return seconds ? `${value}:${pad(d.getSeconds())}` : value;
}

export function fromInputValue(value: string): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
