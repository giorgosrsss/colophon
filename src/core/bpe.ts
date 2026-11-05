/**
 * Byte-level BPE, the tokenizer behind GPT-2 and RoBERTa. Text is split into word-like
 * pieces, each piece becomes UTF-8 bytes spelled with printable stand-in characters, and
 * adjacent symbols are merged in the order the merges file ranks them.
 */

const PIECES = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

export class ByteLevelBpe {
  private readonly vocab: Map<string, number>;
  private readonly ranks = new Map<string, number>();
  private readonly cache = new Map<string, number[]>();
  private readonly byteChars = byteCharacters();
  private readonly utf8 = new TextEncoder();
  private readonly unknown: number;

  constructor(vocab: Record<string, number>, merges: string) {
    this.vocab = new Map(Object.entries(vocab));
    this.unknown = this.vocab.get('<unk>') ?? 3;
    let rank = 0;
    for (const line of merges.split('\n')) {
      if (!line || line.startsWith('#version')) continue;
      this.ranks.set(line.trimEnd(), rank++);
    }
  }

  encode(text: string): number[] {
    const ids: number[] = [];
    for (const [piece] of text.matchAll(PIECES)) {
      let tokens = this.cache.get(piece);
      if (!tokens) {
        const symbols = Array.from(this.utf8.encode(piece), (byte) => this.byteChars[byte]!);
        tokens = this.merge(symbols).map((symbol) => this.vocab.get(symbol) ?? this.unknown);
        if (this.cache.size < 50_000) this.cache.set(piece, tokens);
      }
      ids.push(...tokens);
    }
    return ids;
  }

  private merge(symbols: string[]): string[] {
    let word = symbols;
    while (word.length > 1) {
      let best = -1;
      let bestRank = Infinity;
      for (let i = 0; i < word.length - 1; i++) {
        const rank = this.ranks.get(`${word[i]} ${word[i + 1]}`);
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          best = i;
        }
      }
      if (best === -1) break;

      const first = word[best]!;
      const second = word[best + 1]!;
      const next: string[] = [];
      for (let i = 0; i < word.length; ) {
        if (i < word.length - 1 && word[i] === first && word[i + 1] === second) {
          next.push(first + second);
          i += 2;
        } else {
          next.push(word[i]!);
          i += 1;
        }
      }
      word = next;
    }
    return word;
  }
}

/** GPT-2's table: printable bytes stand for themselves, the rest move above U+0100. */
function byteCharacters(): string[] {
  const printable: number[] = [];
  for (let b = 0x21; b <= 0x7e; b++) printable.push(b);
  for (let b = 0xa1; b <= 0xac; b++) printable.push(b);
  for (let b = 0xae; b <= 0xff; b++) printable.push(b);

  const table = new Array<string>(256);
  for (const b of printable) table[b] = String.fromCharCode(b);
  let shifted = 0;
  for (let b = 0; b < 256; b++) {
    if (table[b] === undefined) table[b] = String.fromCharCode(256 + shifted++);
  }
  return table;
}
