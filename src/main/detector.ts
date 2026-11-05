import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as ort from 'onnxruntime-node';
import { ByteLevelBpe } from '../core/bpe.ts';
import { combineSections, splitSections } from '../core/sections.ts';
import type { Tokenizer } from '../core/sections.ts';
import { UnigramTokenizer } from '../core/unigram.ts';
import type { DetectionProgress, DetectionResult, DetectorId } from '../shared/detectors.ts';

interface Layout {
  modelFile: string;
  /** Tokens of text per section, leaving room for the start and end markers. */
  window: number;
  startId: number;
  endId: number;
  /** Fakespot returns [human, ai] logits; Desklib returns a single logit for "AI". */
  output: 'two-class' | 'one-logit';
  tokenizer(dir: string): Promise<Tokenizer>;
}

const LAYOUTS: Record<DetectorId, Layout> = {
  standard: {
    modelFile: 'model_quantized.onnx',
    window: 510,
    startId: 0,
    endId: 2,
    output: 'two-class',
    async tokenizer(dir) {
      const [vocab, merges] = await Promise.all([
        readFile(join(dir, 'vocab.json'), 'utf8'),
        readFile(join(dir, 'merges.txt'), 'utf8'),
      ]);
      return new ByteLevelBpe(JSON.parse(vocab), merges);
    },
  },
  accurate: {
    modelFile: 'model.onnx',
    window: 766,
    startId: 1,
    endId: 2,
    output: 'one-logit',
    async tokenizer(dir) {
      const spec = JSON.parse(await readFile(join(dir, 'tokenizer.json'), 'utf8'));
      return new UnigramTokenizer(spec.model.vocab, spec.model.unk_id);
    },
  },
};

interface Runtime {
  id: DetectorId;
  session: ort.InferenceSession;
  tokenizer: Tokenizer;
}

/** Keeps one model in memory at a time; the large one alone takes about 2 GB. */
export class Detector {
  private readonly locate: (id: DetectorId) => string;
  private runtime: Promise<Runtime> | null = null;
  private runtimeId: DetectorId | null = null;

  constructor(locate: (id: DetectorId) => string) {
    this.locate = locate;
  }

  async detect(
    id: DetectorId,
    paragraphs: string[],
    onProgress: (progress: DetectionProgress) => void = () => {},
  ): Promise<DetectionResult> {
    const started = performance.now();
    const layout = LAYOUTS[id];
    const { session, tokenizer } = await this.load(id);
    const sections = splitSections(paragraphs, tokenizer, layout.window);

    const probabilities: number[] = [];
    onProgress({ done: 0, total: sections.length });
    for (const section of sections) {
      const ids = [layout.startId, ...section.ids, layout.endId];
      const shape = [1, ids.length];
      const feeds = {
        input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), shape),
        attention_mask: new ort.Tensor('int64', new BigInt64Array(ids.length).fill(1n), shape),
      };
      const { logits } = await session.run(feeds);
      probabilities.push(toProbability(logits!.data as Float32Array, layout.output));
      onProgress({ done: probabilities.length, total: sections.length });
    }

    const combined = combineSections(sections, probabilities);
    return {
      detector: id,
      ...combined,
      words: sections.at(-1)?.toWord ?? 0,
      seconds: (performance.now() - started) / 1000,
    };
  }

  async release(): Promise<void> {
    const current = this.runtime;
    this.runtime = null;
    this.runtimeId = null;
    if (current) await (await current.catch(() => null))?.session.release();
  }

  private async load(id: DetectorId): Promise<Runtime> {
    if (this.runtime && this.runtimeId === id) return this.runtime;
    await this.release();

    const dir = this.locate(id);
    const layout = LAYOUTS[id];
    this.runtimeId = id;
    this.runtime = Promise.all([
      ort.InferenceSession.create(join(dir, layout.modelFile), { graphOptimizationLevel: 'all' }),
      layout.tokenizer(dir),
    ]).then(([session, tokenizer]) => ({ id, session, tokenizer }));

    try {
      return await this.runtime;
    } catch (error) {
      this.runtime = null;
      this.runtimeId = null;
      throw error;
    }
  }
}

function toProbability(logits: Float32Array, output: Layout['output']): number {
  if (output === 'one-logit') return 1 / (1 + Math.exp(-logits[0]!));
  const [human = 0, ai = 0] = logits;
  const top = Math.max(human, ai);
  const a = Math.exp(ai - top);
  return a / (a + Math.exp(human - top));
}
