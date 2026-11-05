import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { readDocx, writeDocx } from '../core/docx.ts';
import { FILE_TIME_KEYS, isFileTimeKey } from '../shared/fields.ts';
import type { DocumentProperties, Fields, FileTimes, OpenedDocument } from '../shared/types.ts';
import { UserError } from './errors.ts';

export const DOCUMENT_EXTENSIONS = ['docx', 'docm', 'dotx', 'dotm'];

const run = promisify(execFile);

export function isDocumentPath(path: string): boolean {
  return DOCUMENT_EXTENSIONS.includes(extname(path).slice(1).toLowerCase());
}

export async function openDocument(path: string): Promise<OpenedDocument> {
  // Stat first: reading the file can move its access time forward.
  const info = await stat(path).catch((error) => {
    throw friendly(error, path);
  });
  const data = await readFile(path).catch((error) => {
    throw friendly(error, path);
  });
  return describe(path, data, info);
}

/** Body text of documents opened this session, kept so the AI check never has to reread the file. */
const bodies = new Map<string, string[]>();

export async function bodyText(path: string): Promise<string[]> {
  const cached = bodies.get(path);
  if (cached) return cached;
  const { body } = await readDocx(await readFile(path));
  bodies.set(path, body);
  return body;
}

async function describe(path: string, data: Uint8Array, info: Stats): Promise<OpenedDocument> {
  const { properties, content, body } = await readDocx(data);
  bodies.set(path, body);
  return {
    path,
    name: basename(path),
    folder: dirname(path),
    size: info.size,
    fields: {
      ...properties,
      fileCreated: info.birthtime.toISOString(),
      fileModified: info.mtime.toISOString(),
      fileAccessed: info.atime.toISOString(),
    },
    content,
  };
}

/**
 * Writes the changed properties to `target` (which may be the source itself), then stamps the
 * file with the dates shown in the app. Dates the user did not touch are carried over, so a
 * save never quietly moves "Date modified" to now.
 */
export async function saveDocument(source: string, changes: Partial<Fields>, target = source): Promise<OpenedDocument> {
  const original = await stat(source);
  const data = await readFile(source);

  const propertyChanges: Partial<DocumentProperties> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (!isFileTimeKey(key as keyof Fields)) Object.assign(propertyChanges, { [key]: value });
  }

  const output = Object.keys(propertyChanges).length ? await writeDocx(data, propertyChanges) : data;
  if (output !== data || target !== source) {
    await replaceFile(target, output);
  }

  const times: Record<keyof FileTimes, Date> = {
    fileCreated: original.birthtime,
    fileModified: original.mtime,
    fileAccessed: original.atime,
  };
  for (const key of FILE_TIME_KEYS) {
    const value = changes[key];
    if (value) times[key] = new Date(value);
  }
  await setFileTimes(target, times);
  if (output !== data || target !== source) holdAccessTime(target, times);

  // Describe the bytes we just wrote rather than reading the file back, which would bump its access time.
  return describe(target, output, await stat(target));
}

const HOLD_CHECKS_MS = [1500, 3000, 6000, 10000];
const holds = new Map<string, symbol>();

/**
 * Windows Search and similar services open a freshly written file a few seconds after it
 * changes, which moves its access date to now. Watch for a little while and put it back,
 * unless someone else has modified the file in the meantime.
 */
function holdAccessTime(path: string, times: Record<keyof FileTimes, Date>): void {
  const token = Symbol(path);
  holds.set(path, token);

  void (async () => {
    for (const delay of HOLD_CHECKS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (holds.get(path) !== token) return;
      const info = await stat(path).catch(() => null);
      if (!info || info.mtime.getTime() !== times.fileModified.getTime()) break;
      if (info.atime.getTime() !== times.fileAccessed.getTime()) {
        await utimes(path, times.fileAccessed, times.fileModified).catch(() => {});
      }
    }
    if (holds.get(path) === token) holds.delete(path);
  })();
}

async function replaceFile(target: string, data: Uint8Array): Promise<void> {
  const temp = join(dirname(target), `.${basename(target)}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    await writeFile(temp, data);
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw friendly(error, target);
  }
}

/**
 * Node can set access and modification times but not creation time, so on Windows the
 * creation time goes through .NET. Values travel as FILETIME ticks in environment
 * variables, which keeps paths and dates out of the command line.
 */
async function setFileTimes(path: string, times: Record<keyof FileTimes, Date>): Promise<void> {
  await utimes(path, times.fileAccessed, times.fileModified).catch((error) => {
    throw friendly(error, path);
  });
  if (process.platform !== 'win32') return;

  const script = [
    '$p = $env:COLOPHON_PATH',
    '[IO.File]::SetCreationTimeUtc($p, [DateTime]::FromFileTimeUtc([long]$env:COLOPHON_CREATED))',
    '[IO.File]::SetLastWriteTimeUtc($p, [DateTime]::FromFileTimeUtc([long]$env:COLOPHON_MODIFIED))',
    '[IO.File]::SetLastAccessTimeUtc($p, [DateTime]::FromFileTimeUtc([long]$env:COLOPHON_ACCESSED))',
  ].join('; ');

  try {
    await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      env: {
        ...process.env,
        COLOPHON_PATH: path,
        COLOPHON_CREATED: fileTime(times.fileCreated),
        COLOPHON_MODIFIED: fileTime(times.fileModified),
        COLOPHON_ACCESSED: fileTime(times.fileAccessed),
      },
    });
  } catch {
    throw new UserError('The document was saved, but Windows would not let Colophon change its creation date.');
  }
}

/** 100-nanosecond intervals since 1601-01-01 UTC. */
function fileTime(date: Date): string {
  return ((BigInt(date.getTime()) + 11_644_473_600_000n) * 10_000n).toString();
}

function friendly(error: unknown, path: string): Error {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const name = basename(path);
  switch (code) {
    case 'ENOENT':
      return new UserError(`${name} could not be found. It may have been moved or deleted.`);
    case 'EBUSY':
    case 'EPERM':
    case 'EACCES':
      return new UserError(`${name} is open in another program, or the folder is read-only. Close it in Word and try again.`);
    default:
      return error instanceof Error ? error : new Error(String(error));
  }
}
