/**
 * SentencePiece unigram tokenizer, as DeBERTa-v3 uses it through tokenizer.json: whitespace
 * is collapsed and every word gets a leading "▁", then each word is split into the pieces
 * whose scores add up highest (Viterbi). Characters no piece covers become one [UNK].
 */

const SPACE = '▁';
const UNKNOWN_PENALTY = 10;
/** Control tokens typed into a document are text, not instructions to the model. */
const SPECIAL_TOKENS = /\[(?:CLS|SEP|PAD|UNK|MASK)\]/g;

export class UnigramTokenizer {
  private readonly pieces = new Map<string, { id: number; score: number }>();
  private readonly longest: number;
  private readonly unknownId: number;
  private readonly unknownScore: number;
  private readonly cache = new Map<string, number[]>();

  constructor(vocab: [piece: string, score: number][], unknownId: number) {
    let longest = 1;
    let lowest = 0;
    vocab.forEach(([piece, score], id) => {
      if (!this.pieces.has(piece)) this.pieces.set(piece, { id, score });
      longest = Math.max(longest, [...piece].length);
      lowest = Math.min(lowest, score);
    });
    this.longest = longest;
    this.unknownId = unknownId;
    this.unknownScore = lowest - UNKNOWN_PENALTY;
  }

  encode(text: string): number[] {
    const normalized = text
      .replace(SPECIAL_TOKENS, ' ')
      .replace(/\s{2,}|[\n\r\t]/g, ' ')
      .normalize('NFC')
      .trimEnd();
    if (!normalized) return [];

    const ids: number[] = [];
    const spaced = normalized.replaceAll(' ', SPACE);
    const marked = spaced.startsWith(SPACE) ? spaced : SPACE + spaced;
    for (const word of marked.split(new RegExp(`(?=${SPACE})`, 'u'))) {
      if (!word) continue;
      let tokens = this.cache.get(word);
      if (!tokens) {
        tokens = this.segment(word);
        if (this.cache.size < 50_000) this.cache.set(word, tokens);
      }
      ids.push(...tokens);
    }
    return ids;
  }

  private segment(word: string): number[] {
    const chars = Array.from(word);
    const n = chars.length;
    const best = new Float64Array(n + 1).fill(-Infinity);
    const from = new Int32Array(n + 1).fill(-1);
    const token = new Int32Array(n + 1).fill(-1);
    best[0] = 0;

    for (let start = 0; start < n; start++) {
      const base = best[start]!;
      if (base === -Infinity) continue;
      let coveredOne = false;
      let piece = '';
      for (let end = start + 1; end <= Math.min(n, start + this.longest); end++) {
        piece += chars[end - 1];
        const entry = this.pieces.get(piece);
        if (!entry) continue;
        if (end === start + 1) coveredOne = true;
        const score = base + entry.score;
        if (score > best[end]!) {
          best[end] = score;
          from[end] = start;
          token[end] = entry.id;
        }
      }
      if (!coveredOne && base + this.unknownScore > best[start + 1]!) {
        best[start + 1] = base + this.unknownScore;
        from[start + 1] = start;
        token[start + 1] = this.unknownId;
      }
    }

    const ids: number[] = [];
    for (let end = n; end > 0; end = from[end]!) ids.push(token[end]!);
    ids.reverse();
    // Runs of unknown characters collapse into a single [UNK], as in the reference tokenizer.
    return ids.filter((id, i) => id !== this.unknownId || ids[i - 1] !== this.unknownId);
  }
}
