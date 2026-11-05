import { access, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { RecentDocument } from '../shared/types.ts';

const LIMIT = 8;

interface Entry {
  path: string;
  openedAt: string;
}

export class RecentDocuments {
  private readonly file: string;
  private entries: Entry[] | null = null;

  constructor(directory: string) {
    this.file = join(directory, 'recent.json');
  }

  async list(): Promise<RecentDocument[]> {
    const entries = await this.load();
    const present = await Promise.all(entries.map((entry) => access(entry.path).then(() => true, () => false)));
    return entries
      .filter((_, i) => present[i])
      .map((entry) => ({ ...entry, name: basename(entry.path), folder: dirname(entry.path) }));
  }

  async add(path: string): Promise<void> {
    const entries = (await this.load()).filter((entry) => !samePath(entry.path, path));
    entries.unshift({ path, openedAt: new Date().toISOString() });
    await this.store(entries.slice(0, LIMIT));
  }

  async remove(path: string): Promise<void> {
    await this.store((await this.load()).filter((entry) => !samePath(entry.path, path)));
  }

  private async load(): Promise<Entry[]> {
    if (this.entries) return this.entries;
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      this.entries = Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
      this.entries = [];
    }
    return this.entries;
  }

  private async store(entries: Entry[]): Promise<void> {
    this.entries = entries;
    await writeFile(this.file, JSON.stringify(entries, null, 2)).catch(() => {});
  }
}

function isEntry(value: unknown): value is Entry {
  const entry = value as Partial<Entry> | null;
  return typeof entry?.path === 'string' && typeof entry.openedAt === 'string';
}

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
