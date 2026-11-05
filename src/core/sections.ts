import type { SectionResult } from '../shared/detectors.ts';
import { countWords } from './content.ts';

export interface Tokenizer {
  encode(text: string): number[];
}

export interface Section {
  text: string;
  ids: number[];
  fromWord: number;
  toWord: number;
}

/**
 * Packs whole sentences into sections that fit the model's window, so no sentence is cut
 * in half. A sentence longer than the window on its own is truncated. A short tail is
 * folded into the section before it when there is room, since tiny inputs score poorly.
 */
export function splitSections(paragraphs: string[], tokenizer: Tokenizer, limit: number): Section[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const sentences: { text: string; tokens: number; words: number }[] = [];

  for (const paragraph of paragraphs) {
    const clean = paragraph.replace(/\s+/g, ' ').trim();
    for (const { segment } of segmenter.segment(clean)) {
      const text = segment.trim();
      if (!text) continue;
      sentences.push({ text, tokens: tokenizer.encode(` ${text}`).length, words: countWords(text) });
    }
  }

  const groups: (typeof sentences)[] = [];
  let current: typeof sentences = [];
  let used = 0;
  for (const sentence of sentences) {
    if (current.length && used + sentence.tokens > limit) {
      groups.push(current);
      current = [];
      used = 0;
    }
    current.push(sentence);
    used += sentence.tokens;
  }
  if (current.length) groups.push(current);

  const last = groups.at(-1);
  const previous = groups.at(-2);
  if (last && previous) {
    const size = (group: typeof sentences) => group.reduce((n, s) => n + s.tokens, 0);
    if (size(last) < limit / 4 && size(previous) + size(last) <= limit) {
      previous.push(...groups.pop()!);
    }
  }

  const sections: Section[] = [];
  let word = 1;
  for (const group of groups) {
    const text = group.map((s) => s.text).join(' ');
    const words = group.reduce((n, s) => n + s.words, 0);
    sections.push({ text, ids: tokenizer.encode(text).slice(0, limit), fromWord: word, toWord: word + words - 1 });
    word += words;
  }
  return sections;
}

/** Long sections count for more: a probability per section, weighted by its tokens. */
export function combineSections(sections: Section[], probabilities: number[]) {
  const weights = sections.map((s) => s.ids.length);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const probability = probabilities.reduce((sum, p, i) => sum + p * weights[i]!, 0) / total;
  const aiShare = probabilities.reduce((sum, p, i) => sum + (p >= 0.5 ? weights[i]! : 0), 0) / total;

  const results: SectionResult[] = sections.map((s, i) => ({
    fromWord: s.fromWord,
    toWord: s.toWord,
    preview: preview(s.text),
    probability: probabilities[i] ?? 0,
  }));
  return { probability, aiShare, sections: results };
}

function preview(text: string): string {
  return text.length > 160 ? `${text.slice(0, 159).trimEnd()}…` : text;
}
