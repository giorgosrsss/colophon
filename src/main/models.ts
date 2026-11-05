import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { DETECTORS } from '../shared/detectors.ts';
import type { DetectorId, DetectorState } from '../shared/detectors.ts';
import { UserError } from './errors.ts';

interface ModelFile {
  name: string;
  size: number;
  sha256: string;
  /** Where to fetch it, for models that are not shipped with the app. */
  url?: string;
}

// Pinned revisions, so a changed upload upstream fails the checksum instead of slipping in.
const STANDARD_SOURCE = 'https://huggingface.co/MedAliFarhat/ai-text-detector-onnx/resolve/0c809a8de6e600ec2fd0fcdeb595a5461d93e8dc';
const ACCURATE_SOURCE = 'https://huggingface.co/GabeuxDev/ai-text-detector-v1.01-onnx/resolve/1017cdcc0fa315991a32c5a0eb7e1f8c5e74bf34';

export const MODEL_FILES: Record<DetectorId, ModelFile[]> = {
  standard: [
    {
      name: 'model_quantized.onnx',
      size: 125_487_549,
      sha256: 'f04d4477acc1a0dfe8d8f58c150adf5265a9c4e63f5e193ed259d3f0cbb796e3',
      url: `${STANDARD_SOURCE}/onnx/model_quantized.onnx`,
    },
    {
      name: 'vocab.json',
      size: 798_293,
      sha256: 'ed19656ea1707df69134c4af35c8ceda2cc9860bf2c3495026153a133670ab5e',
      url: `${STANDARD_SOURCE}/vocab.json`,
    },
    {
      name: 'merges.txt',
      size: 456_318,
      sha256: '1ce1664773c50f3e0cc8842619a93edc4624525b728b188a9e0be33b7726adc5',
      url: `${STANDARD_SOURCE}/merges.txt`,
    },
  ],
  accurate: [
    {
      name: 'tokenizer.json',
      size: 8_339_875,
      sha256: '2c070ff353c36f85e20919da787a30e1e8e52b626d0e026e044f373378f6d0bf',
      url: `${ACCURATE_SOURCE}/tokenizer.json`,
    },
    {
      name: 'model.onnx',
      size: 1_798_626,
      sha256: 'cb985836e40c5991ee4617b483c17168a3db57550cea30ed4192b2675a302482',
      url: `${ACCURATE_SOURCE}/onnx/model.onnx`,
    },
    {
      name: 'model.onnx_data',
      size: 1_736_052_736,
      sha256: 'f12ebf95c32a6b07218b7ce48490c220503bf9475e01270c365c0937ab13e439',
      url: `${ACCURATE_SOURCE}/onnx/model.onnx_data`,
    },
  ],
};

const PROGRESS_INTERVAL_MS = 200;

export class ModelStore {
  private readonly bundledDir: string;
  private readonly downloadDir: string;
  private readonly downloads = new Map<DetectorId, AbortController>();

  constructor(bundledDir: string, downloadDir: string) {
    this.bundledDir = bundledDir;
    this.downloadDir = downloadDir;
  }

  dir(id: DetectorId): string {
    return join(DETECTORS[id].bundled ? this.bundledDir : this.downloadDir, id);
  }

  async state(id: DetectorId): Promise<DetectorState> {
    if (this.downloads.has(id)) return { status: 'downloading', received: 0, total: DETECTORS[id].size };
    const sizes = await Promise.all(
      MODEL_FILES[id].map((file) => stat(join(this.dir(id), file.name)).then((s) => s.size, () => -1)),
    );
    const complete = MODEL_FILES[id].every((file, i) => sizes[i] === file.size);
    return { status: complete ? 'ready' : 'missing' };
  }

  cancel(id: DetectorId): void {
    this.downloads.get(id)?.abort();
  }

  /** Fetches whatever is missing, checks every file against its pinned SHA-256, then moves it into place. */
  async download(id: DetectorId, onProgress: (received: number, total: number) => void): Promise<void> {
    if (this.downloads.has(id)) throw new UserError('That model is already downloading.');
    const controller = new AbortController();
    this.downloads.set(id, controller);

    const dir = this.dir(id);
    const files = MODEL_FILES[id];
    const total = files.reduce((n, f) => n + f.size, 0);
    let received = 0;
    let reported = 0;
    const report = (force = false) => {
      const now = Date.now();
      if (force || now - reported >= PROGRESS_INTERVAL_MS) {
        reported = now;
        onProgress(received, total);
      }
    };

    try {
      await mkdir(dir, { recursive: true });
      await ensureSpace(dir, total);

      for (const file of files) {
        const target = join(dir, file.name);
        const existing = await stat(target).then((s) => s.size, () => -1);
        if (existing === file.size) {
          received += file.size;
          report(true);
          continue;
        }
        await fetchFile(file, target, controller.signal, (bytes) => {
          received += bytes;
          report();
        });
      }
      report(true);
    } catch (error) {
      if (controller.signal.aborted) throw new UserError('Download cancelled.');
      throw error instanceof UserError ? error : new UserError(`The download failed: ${messageOf(error)}`);
    } finally {
      this.downloads.delete(id);
    }
  }
}

async function fetchFile(file: ModelFile, target: string, signal: AbortSignal, onBytes: (n: number) => void) {
  if (!file.url) throw new UserError(`${file.name} is missing from the app.`);
  const partial = `${target}.part`;
  const response = await fetch(file.url, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) throw new UserError(`The server answered ${response.status} for ${file.name}.`);

  const hash = createHash('sha256');
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      onBytes(chunk.length);
      done(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(response.body as ReadableStream), meter, createWriteStream(partial), { signal });
    const size = (await stat(partial)).size;
    if (size !== file.size || hash.digest('hex') !== file.sha256) {
      throw new UserError(`${file.name} did not match the expected file. Try the download again.`);
    }
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

async function ensureSpace(dir: string, bytes: number): Promise<void> {
  const disk = await statfs(dir).catch(() => null);
  if (!disk) return;
  const free = disk.bavail * disk.bsize;
  if (free < bytes + 256 * 1024 * 1024) {
    throw new UserError(`Not enough free disk space. The model needs ${Math.ceil(bytes / 1e9 * 10) / 10} GB.`);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
