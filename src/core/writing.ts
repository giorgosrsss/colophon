import type { ExcerptParagraph, MarkedSentence, SignalId, WritingAssessment, WritingSignal } from '../shared/types.ts';

/*
 * A reading of style, not a test of origin. It looks for the habits of model-written prose:
 * the vocabulary language models lean on, their stock phrases, sentences of even length,
 * linking-word openers, em dashes and lists of three. Slips that models almost never make,
 * and a personal voice, count the other way. Every signal reports what it found so the
 * score can be argued with.
 */

export const MIN_WORDS = 120;
const MIN_SENTENCES = 5;
const MAX_MARKED = 6;

/** How far each signal can move the score on its own. */
const REACH: Record<SignalId, number> = {
  vocabulary: 0.55,
  phrases: 0.45,
  rhythm: 0.35,
  dashes: 0.35,
  openers: 0.3,
  paragraphs: 0.2,
  triads: 0.2,
  slips: 0.6,
  voice: 0.2,
};

/** Words far more common in model output than in human writing, weighted by how telling they are. */
const VOCABULARY: [pattern: string, weight: number][] = [
  ['delv(?:e|es|ed|ing)', 1],
  ['tapestr(?:y|ies)', 1],
  ['testament', 1],
  ['underscor(?:e|es|ed|ing)', 1],
  ['showcas(?:e|es|ed|ing)', 1],
  ['intricat(?:e|ely)|intricac(?:y|ies)', 1],
  ['meticulous(?:ly)?', 1],
  ['multifaceted', 1],
  ['realms?', 1],
  ['embark(?:s|ed|ing)?', 1],
  ['unwavering', 1],
  ['commendabl[ey]', 1],
  ['ever-evolving', 1],
  ['beacons?', 1],
  ['myriad', 1],
  ['plethora', 1],
  ['interplay', 1],
  ['bustling', 1],
  ['unparalleled', 0.8],
  ['indelibl[ey]', 0.8],
  ['quintessential', 0.8],
  ['labyrinth(?:ine)?', 0.8],
  ['seamless(?:ly)?', 0.8],
  ['holistic(?:ally)?', 0.8],
  ['pivotal', 0.8],
  ['paramount', 0.8],
  ['transformative', 0.8],
  ['resonat(?:e|es|ed|ing)', 0.7],
  ['foster(?:s|ed|ing)?', 0.7],
  ['bolster(?:s|ed|ing)?', 0.7],
  ['garner(?:s|ed|ing)?', 0.7],
  ['captivating', 0.7],
  ['enigmatic', 0.7],
  ['nuanced?', 0.6],
  ['noteworthy', 0.6],
  ['notably', 0.6],
  ['invaluable', 0.6],
  ['groundbreaking', 0.6],
  ['vibrant', 0.6],
  ['endeavou?rs?', 0.6],
  ['leverag(?:e|es|ed|ing)', 0.6],
  ['harness(?:es|ed|ing)?', 0.6],
  ['streamlin(?:e|es|ed|ing)', 0.6],
  ['empower(?:s|ed|ing|ment)?', 0.6],
  ['crucial(?:ly)?', 0.5],
  ['profound(?:ly)?', 0.5],
  ['robust', 0.5],
  ['elevat(?:e|es|ed|ing)', 0.4],
  ['comprehensive', 0.4],
  ['landscapes?', 0.4],
  ['navigat(?:e|es|ed|ing)', 0.4],
  ['enhanc(?:e|es|ed|ing|ement)', 0.4],
  ['insights?|insightful', 0.4],
];

const VOCABULARY_PATTERN = new RegExp(`\\b(?:${VOCABULARY.map(([pattern]) => `(${pattern})`).join('|')})\\b`, 'gi');

const PHRASES: RegExp[] = [
  /\bit(?:'s| is) (?:important|worth|crucial|essential) to (?:note|remember|recognize|consider|understand)\b/gi,
  /\bit(?:'s| is) worth noting\b/gi,
  /\bin today's (?:fast-paced|digital|modern|ever-changing|interconnected|rapidly changing) (?:world|age|society|landscape)\b/gi,
  /\bplays? (?:a|an) (?:crucial|vital|pivotal|key|significant|important|integral) role\b/gi,
  /\ba testament to\b/gi,
  /\bnavigat(?:e|ing) the (?:complexities|challenges|intricacies)\b/gi,
  /\b(?:rich|vibrant|intricate) tapestry\b/gi,
  /\bin the realm of\b/gi,
  /\bnot only\b[^.?!]{1,80}?\bbut also\b/gi,
  /\b(?:it's|it is|this is|that's) not (?:just|only|merely|simply) (?:about )?[^.?!;]{1,60}?[,;—]\s*(?:it's|it is|but)\b/gi,
  /\b(?:serves|stands) as (?:a|an) (?:testament|reminder|beacon|cornerstone)\b/gi,
  /\bat its core\b/gi,
  /\bin essence\b/gi,
  /\bwhen it comes to\b/gi,
  /\ba (?:wide|diverse|broad|rich) (?:range|array|variety|spectrum) of\b/gi,
  /\b(?:delve|dive) (?:deeper )?into\b/gi,
  /\bshed(?:s|ding)? light on\b/gi,
  /\bpav(?:e|es|ed|ing) the way\b/gi,
  /\bin conclusion\b/gi,
  /\bto sum (?:it )?up\b/gi,
  /\bfoster(?:s|ing)? a sense of\b/gi,
  /\b(?:deeply|profoundly) (?:rooted|ingrained|intertwined)\b/gi,
  /\bcan(?:not|'t) be overstated\b/gi,
  /\b(?:let's|let us) (?:explore|dive|delve|take a closer look)\b/gi,
  /\bthe (?:power|beauty|importance|magic) of\b/gi,
  /\b(?:a|the) (?:key|crucial|critical|vital|essential) (?:factor|aspect|component|element)\b/gi,
  /\bunlock(?:s|ing)? the (?:potential|power|secrets)\b/gi,
  /\bembark(?:s|ed|ing)? on a journey\b/gi,
  /\bstrik(?:e|es|ing) a (?:delicate )?balance\b/gi,
  /\bremains? (?:a )?(?:complex|nuanced|multifaceted) (?:issue|topic|question|challenge)\b/gi,
];

const OPENER =
  /^(?:additionally|furthermore|moreover|overall|ultimately|importantly|consequently|notably|similarly|conversely|nevertheless|nonetheless|thus|hence|indeed|crucially|essentially|interestingly|in addition|in conclusion|in summary|as a result|on the other hand|by contrast|in contrast|that said|in turn)\b/i;

const TRIAD = /\b[a-z][\w'-]*(?: [\w'-]+){0,2}, [\w'-]+(?: [\w'-]+){0,2},? and [\w'-]+/gi;

const SLIPS: RegExp[] = [
  /\b(?:dont|doesnt|didnt|isnt|wasnt|werent|arent|havent|hasnt|wouldnt|couldnt|shouldnt|youre|theyre|thats|whats|ive)\b/gi,
  // A lowercase "i" used as the pronoun, not a loop variable or list marker.
  /(?:^|[\s(])i(?='(?:m|ve|d|ll)\b|\s+(?:am|was|think|thought|have|had|do|did|dont|didnt|can|cant|could|will|would|really|just|feel|felt|guess|mean|know|knew|said|went|got|like|love|hate|want|wanted|need|needed|tried|decided)\b)/g,
  /\b(?!(?:had|that)\b)(\w+) \1\b/gi,
  /\b(?:definately|recieve|seperate|alot|untill|wich|thier|becuase|beleive|occured|goverment|enviroment|tommorow|begining|truely|wierd|arguement|basicly|finaly|neccessary|occassion|publically|embarass|existance|independant|accomodate|acheive|calender|concious|libary|noticable|persue|posession|reccomend|refered|relevent|succesful|suprise|tounge)\b/gi,
  /\w ,/g,
];

const LOWERCASE_START =
  /^(?:the|this|that|these|those|it|its|we|they|there|he|she|you|so|but|and|then|my|our|a|an|in|on|at|when|if|because|also|after|before|some|most|one)\s/;

const FIRST_PERSON =/\b(?:I|I'm|I've|I'd|I'll)\b|\b(?:me|my|mine|myself)\b/g;

interface Mark {
  start: number;
  end: number;
  weight: number;
}

interface Sentence {
  /** Quotes straightened for matching. Same length as `display`, so positions carry over. */
  text: string;
  display: string;
  words: number;
  marks: Mark[];
}

interface Scan {
  sentences: Sentence[];
  paragraphWords: number[];
  words: number;
  /** Double spaces between words, counted before whitespace is tidied. */
  doubleSpaces: number;
}

type Paragraph = Pick<ExcerptParagraph, 'text' | 'kind'>;

export function assessWriting(paragraphs: Paragraph[]): WritingAssessment {
  const scan = scanText(paragraphs);
  const { sentences, words } = scan;

  if (words < MIN_WORDS || sentences.length < MIN_SENTENCES) {
    return { words, sentences: sentences.length, score: null, verdict: 'too-short', signals: [], marked: [] };
  }

  const signals = [
    vocabulary(scan),
    phrases(scan),
    rhythm(scan),
    openers(scan),
    dashes(scan),
    paragraphShape(scan),
    triads(scan),
    slips(scan),
    voice(scan),
  ];

  const ai = combine(signals.filter((s) => s.pointsTo === 'ai'));
  const person = combine(signals.filter((s) => s.pointsTo === 'person'));
  const score = Math.round(100 * ai * (1 - person));

  return {
    words,
    sentences: sentences.length,
    score,
    verdict: score >= 60 ? 'ai' : score >= 30 ? 'unclear' : 'person',
    signals,
    marked: mostMarked(sentences),
  };
}

/** Independent pieces of evidence: each one closes part of the remaining gap. */
function combine(signals: WritingSignal[]): number {
  return 1 - signals.reduce((rest, s) => rest * (1 - REACH[s.id] * s.strength), 1);
}

function scanText(paragraphs: Paragraph[]): Scan {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const sentences: Sentence[] = [];
  const paragraphWords: number[] = [];
  let doubleSpaces = 0;

  for (const { text, kind } of paragraphs) {
    if (kind !== 'body' || !text.trim()) continue;
    doubleSpaces += text.match(/\S {2,}(?=\S)/g)?.length ?? 0;

    const display = text.replace(/\s+/g, ' ').trim();
    let inParagraph = 0;
    for (const { segment } of segmenter.segment(display)) {
      const sentence = segment.trim();
      if (!sentence) continue;
      // Counted the way Word counts, so the totals agree with the rest of the app.
      const words = sentence.split(/\s+/).filter(Boolean).length;
      if (!words) continue;
      inParagraph += words;
      sentences.push({ text: straighten(sentence), display: sentence, words, marks: [] });
    }
    paragraphWords.push(inParagraph);
  }

  return { sentences, paragraphWords, words: sum(paragraphWords), doubleSpaces };
}

function vocabulary(scan: Scan): WritingSignal {
  const counts = new Map<string, number>();
  let weighted = 0;

  for (const sentence of scan.sentences) {
    for (const match of sentence.text.matchAll(VOCABULARY_PATTERN)) {
      const entry = match.slice(1).findIndex((group) => group !== undefined);
      const weight = VOCABULARY[entry]?.[1] ?? 0.5;
      const word = match[0].toLowerCase();
      weighted += weight;
      counts.set(word, (counts.get(word) ?? 0) + 1);
      sentence.marks.push({ start: match.index, end: match.index + match[0].length, weight });
    }
  }

  const uses = sum([...counts.values()]);
  const strength = ramp(per1000(weighted, scan), 3, 15);
  const finding =
    uses === 0
      ? 'None of the words models tend to overuse.'
      : strength < 0.15
        ? `A few words models favor, but no more than people use too.`
        : `${count(uses, 'use')} of words models overuse, in ${count(scan.words, 'word')}.`;

  return signal('vocabulary', 'Word choice', 'ai', strength, finding, topCounts(counts, 5));
}

function phrases(scan: Scan): WritingSignal {
  const found = new Map<string, number>();

  for (const sentence of scan.sentences) {
    for (const pattern of PHRASES) {
      for (const match of sentence.text.matchAll(pattern)) {
        const phrase = shorten(match[0].toLowerCase());
        found.set(phrase, (found.get(phrase) ?? 0) + 1);
        sentence.marks.push({ start: match.index, end: match.index + match[0].length, weight: 1 });
      }
    }
  }

  const uses = sum([...found.values()]);
  const strength = ramp(per1000(uses, scan), 0.8, 5);
  const finding =
    uses === 0
      ? 'No stock phrases.'
      : strength < 0.15
        ? `${count(uses, 'stock phrase')}, about what people use too.`
        : `${count(uses, 'stock phrase')} of the kind models reach for.`;

  return signal('phrases', 'Stock phrases', 'ai', strength, finding, topCounts(found, 4));
}

function rhythm(scan: Scan): WritingSignal {
  const lengths = scan.sentences.map((s) => s.words).filter((n) => n >= 3);
  if (lengths.length < 8) {
    return signal('rhythm', 'Sentence rhythm', 'ai', 0, 'Too few sentences to judge rhythm.', []);
  }

  const spread = deviation(lengths) / mean(lengths);
  const strength = ramp(0.55 - spread, 0, 0.25);
  const sorted = [...lengths].sort((a, b) => a - b);
  const range = `${percentile(sorted, 0.2)} to ${percentile(sorted, 0.8)} words`;
  const finding =
    strength >= 0.6
      ? `Sentences keep to a similar length, mostly ${range}.`
      : strength >= 0.15
        ? `Sentence length varies a little less than usual, mostly ${range}.`
        : `Sentence length varies the way people write, from ${sorted[0]} to ${sorted.at(-1)} words.`;

  return signal('rhythm', 'Sentence rhythm', 'ai', strength, finding, []);
}

function openers(scan: Scan): WritingSignal {
  const used = new Map<string, number>();

  for (const sentence of scan.sentences) {
    const match = OPENER.exec(sentence.text);
    if (!match) continue;
    const word = capitalize(match[0].toLowerCase());
    used.set(word, (used.get(word) ?? 0) + 1);
    sentence.marks.push({ start: 0, end: match[0].length, weight: 0.6 });
  }

  const total = sum([...used.values()]);
  const strength = ramp(total / scan.sentences.length, 0.1, 0.25);
  const finding =
    total === 0
      ? 'No sentences open with linking words like “Moreover”.'
      : `${total} of ${scan.sentences.length} sentences open with a linking word${strength < 0.15 ? ', which is normal' : ''}.`;

  return signal('openers', 'Sentence openers', 'ai', strength, finding, topCounts(used, 4));
}

function dashes(scan: Scan): WritingSignal {
  let total = 0;
  for (const sentence of scan.sentences) {
    for (const match of sentence.text.matchAll(/—/g)) {
      total++;
      sentence.marks.push({ start: match.index, end: match.index + 1, weight: 0.5 });
    }
  }

  const rate = per1000(total, scan);
  const strength = ramp(rate, 1.5, 7);
  const finding =
    total === 0
      ? 'No em dashes.'
      : `${count(total, 'em dash', 'em dashes')}, ${rate.toFixed(1)} per 1,000 words. Models use them far more than most people.`;

  return signal('dashes', 'Em dashes', 'ai', strength, finding, []);
}

function paragraphShape(scan: Scan): WritingSignal {
  const lengths = scan.paragraphWords.filter((n) => n >= 15);
  if (lengths.length < 4) {
    return signal('paragraphs', 'Paragraph shape', 'ai', 0, 'Too few paragraphs to compare.', []);
  }

  const spread = deviation(lengths) / mean(lengths);
  const strength = ramp(0.45 - spread, 0, 0.3);
  const finding =
    strength >= 0.6
      ? `Paragraphs are close to the same size, around ${Math.round(mean(lengths))} words each.`
      : strength >= 0.15
        ? `Paragraph sizes vary a little less than usual, ${Math.min(...lengths)} to ${Math.max(...lengths)} words.`
        : `Paragraph sizes vary, from ${Math.min(...lengths)} to ${Math.max(...lengths)} words.`;

  return signal('paragraphs', 'Paragraph shape', 'ai', strength, finding, []);
}

function triads(scan: Scan): WritingSignal {
  const examples: string[] = [];
  let withTriad = 0;

  for (const sentence of scan.sentences) {
    const match = sentence.display.match(TRIAD);
    if (!match) continue;
    withTriad++;
    if (examples.length < 3) examples.push(shorten(match[0]));
  }

  const strength = ramp(withTriad / scan.sentences.length, 0.12, 0.35);
  const finding =
    withTriad === 0
      ? 'No lists of three.'
      : `${withTriad} of ${scan.sentences.length} sentences list three things in a row${strength < 0.15 ? ', which is normal' : ''}.`;

  return signal('triads', 'Lists of three', 'ai', strength, finding, examples);
}

function slips(scan: Scan): WritingSignal {
  const examples = new Set<string>();
  let total = scan.doubleSpaces;
  if (scan.doubleSpaces) examples.add('double spaces');

  for (const sentence of scan.sentences) {
    // Technical writing starts sentences with field names like "game_id"; only plain words count.
    if (LOWERCASE_START.test(sentence.text)) {
      total++;
      examples.add(shorten(sentence.display.split(' ').slice(0, 3).join(' ')));
    }
    for (const pattern of SLIPS) {
      for (const match of sentence.text.matchAll(pattern)) {
        total++;
        examples.add(match[0].trim());
      }
    }
  }

  const strength = ramp(per1000(total, scan), 0, 4);
  const finding =
    total === 0
      ? 'No typos or slips. Models rarely make them, but careful writers don’t either.'
      : `${count(total, 'slip')} of the kind models almost never make.`;

  return signal('slips', 'Typos and slips', 'person', strength, finding, [...examples].slice(0, 5));
}

function voice(scan: Scan): WritingSignal {
  const total = sum(scan.sentences.map((s) => s.text.match(FIRST_PERSON)?.length ?? 0));
  const strength = ramp(per1000(total, scan), 4, 25);
  const finding = total === 0 ? 'Not written in the first person.' : `Written in the first person (${count(total, 'time')}).`;
  return signal('voice', 'Personal voice', 'person', strength, finding, []);
}

/** The sentences that set off the most signals, in reading order. */
function mostMarked(sentences: Sentence[]): MarkedSentence[] {
  return sentences
    .map((sentence, order) => ({ sentence, order, weight: sum(sentence.marks.map((m) => m.weight)) }))
    .filter(({ weight }) => weight >= 1)
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .slice(0, MAX_MARKED)
    .sort((a, b) => a.order - b.order)
    .map(({ sentence }) => ({ text: sentence.display, marks: mergeRanges(sentence.marks) }));
}

function mergeRanges(marks: Mark[]): [number, number][] {
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  const merged: [number, number][] = [];
  for (const { start, end } of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function signal(
  id: SignalId,
  label: string,
  pointsTo: WritingSignal['pointsTo'],
  strength: number,
  finding: string,
  examples: string[],
): WritingSignal {
  return { id, label, pointsTo, strength: Math.round(strength * 100) / 100, finding, examples };
}

function topCounts(counts: Map<string, number>, limit: number): string[] {
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text, n]) => (n > 1 ? `${text} ×${n}` : text));
}

function straighten(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function shorten(text: string): string {
  return text.length > 42 ? `${text.slice(0, 41).trimEnd()}…` : text;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function per1000(n: number, scan: Scan): number {
  return (n / scan.words) * 1000;
}

/** 0 at `from`, 1 at `to`, straight in between. */
function ramp(value: number, from: number, to: number): number {
  return Math.min(Math.max((value - from) / (to - from), 0), 1);
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

function sum(values: number[]): number {
  return values.reduce((total, n) => total + n, 0);
}

function mean(values: number[]): number {
  return sum(values) / values.length;
}

function deviation(values: number[]): number {
  const average = mean(values);
  return Math.sqrt(mean(values.map((n) => (n - average) ** 2)));
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}
