import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Preferences } from '../shared/types.ts';

const DEFAULTS: Preferences = { detector: 'standard' };

export class PreferenceStore {
  private readonly file: string;
  private current: Preferences | null = null;

  constructor(directory: string) {
    this.file = join(directory, 'preferences.json');
  }

  async get(): Promise<Preferences> {
    if (this.current) return this.current;
    try {
      const stored = JSON.parse(await readFile(this.file, 'utf8')) as Partial<Preferences>;
      this.current = { ...DEFAULTS, ...(stored.detector === 'accurate' ? { detector: 'accurate' } : {}) };
    } catch {
      this.current = { ...DEFAULTS };
    }
    return this.current;
  }

  async update(changes: Partial<Preferences>): Promise<Preferences> {
    this.current = { ...(await this.get()), ...changes };
    await writeFile(this.file, JSON.stringify(this.current, null, 2)).catch(() => {});
    return this.current;
  }
}
