import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ByteLevelBpe } from '../src/core/bpe.ts';
import { combineSections, splitSections } from '../src/core/sections.ts';
import { UnigramTokenizer } from '../src/core/unigram.ts';
import { assessWriting } from '../src/core/writing.ts';

const STANDARD = new URL('../models/standard/', import.meta.url);
const hasStandard = existsSync(new URL('model_quantized.onnx', STANDARD));

/** One token per word, so section sizes are easy to reason about. */
const wordTokenizer = { encode: (text: string) => text.split(/\s+/).filter(Boolean).map((_, i) => i) };

describe('sections', () => {
  it('keeps sentences whole and fills each section up to the window', () => {
    const paragraphs = ['One two three. Four five six.', 'Seven eight nine. Ten eleven twelve.'];
    const sections = splitSections(paragraphs, wordTokenizer, 7);
    assert.deepEqual(
      sections.map((s) => s.text),
      ['One two three. Four five six.', 'Seven eight nine. Ten eleven twelve.'],
    );
    assert.deepEqual(sections.map((s) => [s.fromWord, s.toWord]), [[1, 6], [7, 12]]);
  });

  it('folds a short tail into the section before it', () => {
    const sections = splitSections(['A b c d e f g h. I j k l m n o p. Q.'], wordTokenizer, 20);
    assert.equal(sections.length, 1);
  });

  it('truncates a sentence longer than the window', () => {
    const long = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ');
    const [section] = splitSections([`${long}.`], wordTokenizer, 10);
    assert.equal(section?.ids.length, 10);
  });

  it('weights each section by its length', () => {
    const sections = splitSections(['A b c d e f. G h.'], wordTokenizer, 100);
    const { probability, aiShare } = combineSections(
      [{ ...sections[0]!, ids: new Array(30).fill(0) }, { ...sections[0]!, ids: new Array(10).fill(0) }],
      [1, 0],
    );
    assert.equal(probability, 0.75);
    assert.equal(aiShare, 0.75);
  });
});

describe('unigram tokenizer', () => {
  const vocab: [string, number][] = [
    ['[PAD]', 0], ['[CLS]', 0], ['[SEP]', 0], ['[UNK]', 0],
    ['▁', -2], ['▁the', -1], ['▁cat', -1.5], ['▁c', -3], ['at', -3], ['s', -2], ['▁sat', -1.5],
  ];
  const tokenizer = new UnigramTokenizer(vocab, 3);

  it('picks the highest scoring split of each word', () => {
    assert.deepEqual(tokenizer.encode('the cats sat'), [5, 6, 9, 10]);
  });

  it('treats leading, repeated and trailing whitespace the way SentencePiece does', () => {
    assert.deepEqual(tokenizer.encode('  the\n\ncat  '), [5, 6]);
  });

  it('collapses a run of unknown characters into one [UNK]', () => {
    assert.deepEqual(tokenizer.encode('the zzz'), [5, 4, 3]);
  });

  it('does not let typed control tokens through', () => {
    assert.deepEqual(tokenizer.encode('[CLS] the'), [5]);
  });
});

describe('byte-level BPE', { skip: !hasStandard && 'models/standard is not downloaded' }, () => {
  it('matches the reference tokenizer', async () => {
    const vocab = JSON.parse(await readFile(new URL('vocab.json', STANDARD), 'utf8'));
    const bpe = new ByteLevelBpe(vocab, await readFile(new URL('merges.txt', STANDARD), 'utf8'));
    assert.deepEqual(bpe.encode('Hello world'), [31414, 232]);
    assert.deepEqual(bpe.encode('It’s a café — naïve \u{1F642}'), [243, 17, 27, 29, 10, 26059, 93, 39300, 45868]);
    assert.deepEqual(bpe.encode("don't  stop"), [7254, 75, 1437, 912]);
  });
});

describe('standard detector', { skip: !hasStandard && 'models/standard is not downloaded' }, () => {
  it('tells chatbot prose from casual writing', async () => {
    const { Detector } = await import('../src/main/detector.ts');
    const detector = new Detector(() => fileURLToPath(STANDARD));
    const machine = await detector.detect('standard', [
      'In today’s fast-paced world, the role of urban parks cannot be overstated. Parks are not just places to relax — they are vibrant ecosystems that foster a sense of community.',
      'Moreover, they play a crucial role in shaping the health, happiness, and resilience of the cities we live in. At its core, the debate about parks is a debate about equity.',
    ]);
    const person = await detector.detect('standard', [
      'I didnt expect the garden thing to work. My neighbour Ruth talked me into it last spring, mostly because she was sick of looking at the empty lot behind the laundromat. We had no money. Zero.',
      'The first month was a mess. Half the tomatoes died because nobody watered them over the long weekend. Would I do it again? Probably. Ask me in March.',
    ]);
    await detector.release();
    assert.ok(machine.probability > 0.9, `machine ${machine.probability}`);
    assert.ok(person.probability < 0.5, `person ${person.probability}`);
  });
});

describe('slips in technical writing', () => {
  it('does not count field names that start a sentence', () => {
    const technical = Array.from({ length: 12 }, (_, i) =>
      `game_id identifies a game. grade is an attribute of RESULT number ${i}. player_id is unique. The captain is a player.`,
    ).map((text) => ({ text, kind: 'body' as const }));
    const slips = assessWriting(technical).signals.find((s) => s.id === 'slips');
    assert.equal(slips?.strength, 0);
  });
});
