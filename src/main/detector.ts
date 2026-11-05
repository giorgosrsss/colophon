import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type * as Ort from 'onnxruntime-node';
import { ByteLevelBpe } from '../core/bpe.ts';
import { combineSections, splitSections } from '../core/sections.ts';
import type { Tokenizer } from '../core/sections.ts';
import { UnigramTokenizer } from '../core/unigram.ts';
import type { DetectionProgress, DetectionResult, DetectorId } from '../shared/detectors.ts';
import { UserError } from './errors.ts';

export const MISSING_RUNTIME =
  'The AI detector couldn’t start because a Windows component it needs is missing: the Microsoft Visual C++ Redistributable. Install it from Microsoft, then restart Colophon.';

let onnxRuntime: Promise<typeof Ort> | null = null;

/**
 * ONNX Runtime is a native module, so it loads on first use rather than at startup. If a
 * system library it depends on is missing, only the AI check is affected.
 */
function loadRuntime(): Promise<typeof Ort> {
  onnxRuntime ??= import('onnxruntime-node').catch((error: unknown) => {
    onnxRuntime = null;
    console.error('Could not load ONNX Runtime:', error);
    throw new UserError(MISSING_RUNTIME);
  });
  return onnxRuntime;
}

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

interface LoadedModel {
  id: DetectorId;
  ort: typeof Ort;
  session: Ort.InferenceSession;
  tokenizer: Tokenizer;
}

/** Keeps one model in memory at a time; the large one alone takes about 2 GB. */
export class Detector {
  private readonly locate: (id: DetectorId) => string;
  private model: Promise<LoadedModel> | null = null;
  private modelId: DetectorId | null = null;

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
    const { ort, session, tokenizer } = await this.load(id);
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
    const current = this.model;
    this.model = null;
    this.modelId = null;
    if (current) await (await current.catch(() => null))?.session.release();
  }

  private async load(id: DetectorId): Promise<LoadedModel> {
    if (this.model && this.modelId === id) return this.model;
    await this.release();

    const dir = this.locate(id);
    const layout = LAYOUTS[id];
    const session = loadRuntime().then(async (ort) => ({
      ort,
      session: await ort.InferenceSession.create(join(dir, layout.modelFile), { graphOptimizationLevel: 'all' }),
    }));
    this.modelId = id;
    this.model = Promise.all([session, layout.tokenizer(dir)]).then(([loaded, tokenizer]) => ({ id, ...loaded, tokenizer }));

    try {
      return await this.model;
    } catch (error) {
      this.model = null;
      this.modelId = null;
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
