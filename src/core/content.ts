import type { ContentStats, ExcerptParagraph, Layout } from '../shared/types.ts';
import { assessWriting } from './writing.ts';

/**
 * One pass over document.xml. Text runs are matched whole; everything else we care about
 * is a structural tag. Tab stop definitions (<w:tab w:pos=…>) share a name with real tabs,
 * so they are told apart by their attributes further down.
 */
const TOKEN =
  /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<(\/?)(w:p|w:tab|w:br|w:cr|w:pStyle|w:lastRenderedPageBreak|mc:Fallback)(?=[\s/>])([^>]*?)(\/?)>/g;

const EXCERPT_CHARACTERS = 2400;
const EXCERPT_PARAGRAPHS = 40;

interface Paragraph {
  text: string;
  style: string;
}

export interface Analysis {
  content: ContentStats;
  /** Body paragraphs as plain text, headings and empty lines left out. */
  body: string[];
}

export function analyzeContent(documentXml: string, layout: Layout): Analysis {
  const paragraphs: Paragraph[] = [];
  const open: Paragraph[] = [];
  let fallbackDepth = 0;
  let renderedPageBreaks = 0;
  let manualPageBreaks = 0;

  for (const [, text, closing, tag, attributes = '', selfClosing] of documentXml.matchAll(TOKEN)) {
    // Office writes text boxes twice: a modern version and an mc:Fallback copy for old readers.
    if (tag === 'mc:Fallback') {
      if (!selfClosing) fallbackDepth += closing ? -1 : 1;
      continue;
    }
    if (fallbackDepth > 0) continue;

    const current = open.at(-1);
    if (text !== undefined) {
      if (current) current.text += decodeEntities(text);
      continue;
    }
    if (closing && tag !== 'w:p') continue;

    switch (tag) {
      case 'w:p':
        if (closing) {
          const finished = open.pop();
          if (finished) paragraphs.push(finished);
        } else if (selfClosing) {
          paragraphs.push({ text: '', style: '' });
        } else {
          open.push({ text: '', style: '' });
        }
        break;
      case 'w:tab':
        if (current && !attributes.includes('w:pos')) current.text += '\t';
        break;
      case 'w:br':
        if (attributes.includes('w:type="page"')) manualPageBreaks++;
        if (current) current.text += '\n';
        break;
      case 'w:cr':
        if (current) current.text += '\n';
        break;
      case 'w:pStyle':
        if (current) current.style = attribute(attributes, 'w:val') ?? '';
        break;
      case 'w:lastRenderedPageBreak':
        if (open.length === 1) renderedPageBreaks++;
        break;
    }
  }
  paragraphs.push(...open);

  const charactersPerLine = Math.max(20, Math.round(936 / layout.fontSizePt));
  let words = 0;
  let characters = 0;
  let charactersWithSpaces = 0;
  let filled = 0;
  let lines = 0;

  for (const { text } of paragraphs) {
    if (!text.trim()) continue;
    filled++;
    words += countWords(text);
    for (const char of text) {
      if (char === '\n') continue;
      charactersWithSpaces++;
      if (!/\s/.test(char)) characters++;
    }
    for (const line of text.split('\n')) {
      lines += Math.max(1, Math.ceil(line.length / charactersPerLine));
    }
  }

  // Word leaves a marker wherever it last broke a page. When those exist they beat any estimate.
  const estimatedPages = Math.max(manualPageBreaks + 1, Math.ceil(words / wordsPerPage(layout)));
  const pages = renderedPageBreaks > 0 ? renderedPageBreaks + 1 : estimatedPages;

  const kinds = paragraphs.map(({ text, style }) => ({ text, kind: styleKind(style) }));
  const content: ContentStats = {
    words,
    characters,
    charactersWithSpaces,
    paragraphs: filled,
    lines,
    pages,
    layout,
    excerpt: buildExcerpt(paragraphs),
    writing: assessWriting(kinds),
    fingerprint: hash(paragraphs.map((p) => p.text).join('\n')),
  };
  const body = kinds
    .filter(({ text, kind }) => kind === 'body' && text.trim())
    .map(({ text }) => text.replace(/\s+/g, ' ').trim());

  return { content, body };
}

export function countWords(text: string): number {
  let count = 0;
  for (const token of text.split(/\s+/)) {
    if (token) count++;
  }
  return count;
}

/**
 * A rough page model: 6.5 by 9 inches of text, average glyph width of half an em,
 * six characters per word including the space, and a fill factor for short last lines.
 */
export function wordsPerPage({ fontSizePt, lineSpacing }: Layout): number {
  const linesPerPage = 648 / (fontSizePt * 1.17 * lineSpacing);
  const wordsPerLine = 936 / fontSizePt / 6;
  return Math.max(50, Math.round(linesPerPage * wordsPerLine * 0.85));
}

const THEME_FONT = /^(minor|major)/;

export function detectLayout(stylesXml: string | null, themeXml: string | null): Layout {
  const styles = stylesXml ?? '';
  const blocks = [defaultParagraphStyle(styles), section(styles, 'w:docDefaults')];

  const fonts = firstTag(blocks, 'w:rFonts');
  const size = firstTag(blocks, 'w:sz');
  const spacing = blocks.map((block) => lineSpacingTag(block)).find(Boolean) ?? null;

  const halfPoints = Number(size && attribute(size, 'w:val'));
  const fontSizePt = halfPoints > 0 ? halfPoints / 2 : 10;

  let fontFamily = fonts ? (attribute(fonts, 'w:ascii') ?? attribute(fonts, 'w:hAnsi')) : null;
  const themeSlot = fonts && (attribute(fonts, 'w:asciiTheme') ?? attribute(fonts, 'w:hAnsiTheme'));
  if (themeSlot && themeXml) {
    const slot = THEME_FONT.exec(themeSlot)?.[1];
    const themeFonts = slot ? section(themeXml, `a:${slot}Font`) : '';
    fontFamily = attribute(themeFonts.match(/<a:latin\b[^>]*>/)?.[0] ?? '', 'typeface') ?? fontFamily;
  }

  let lineSpacing = 1;
  if (spacing) {
    const line = Number(attribute(spacing, 'w:line'));
    const rule = attribute(spacing, 'w:lineRule') ?? 'auto';
    if (line > 0) {
      lineSpacing = rule === 'auto' ? line / 240 : line / 20 / (fontSizePt * 1.17);
    }
  }

  return { fontFamily: fontFamily || null, fontSizePt, lineSpacing: Math.min(Math.max(lineSpacing, 0.75), 3) };
}

function lineSpacingTag(block: string): string | null {
  for (const [tag] of block.matchAll(/<w:spacing\b[^>]*>/g)) {
    if (tag.includes('w:line=')) return tag;
  }
  return null;
}

function defaultParagraphStyle(styles: string): string {
  for (const [block, open = ''] of styles.matchAll(/(<w:style\b[^>]*>)[\s\S]*?<\/w:style>/g)) {
    if (open.includes('w:type="paragraph"') && /w:default="(1|true|on)"/.test(open)) return block;
  }
  return '';
}

function section(xml: string, tag: string): string {
  const start = xml.indexOf(`<${tag}`);
  if (start === -1) return '';
  const end = xml.indexOf(`</${tag}>`, start);
  return end === -1 ? '' : xml.slice(start, end);
}

function firstTag(blocks: string[], name: string): string | null {
  const pattern = new RegExp(`<${name}\\b[^>]*>`);
  for (const block of blocks) {
    const match = pattern.exec(block);
    if (match) return match[0];
  }
  return null;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decodeEntities(match[1] ?? '') : null;
}

function buildExcerpt(paragraphs: Paragraph[]): ExcerptParagraph[] {
  const excerpt: ExcerptParagraph[] = [];
  let length = 0;
  for (const { text, style } of paragraphs) {
    const clean = text.replace(/\t/g, ' ').replace(/\s+$/, '');
    const previous = excerpt.at(-1);
    if (!clean && (!previous || !previous.text)) continue;

    excerpt.push({ text: clean, kind: styleKind(style) });
    length += clean.length;
    if (length > EXCERPT_CHARACTERS || excerpt.length >= EXCERPT_PARAGRAPHS) break;
  }
  while (excerpt.length && !excerpt.at(-1)?.text) excerpt.pop();
  return excerpt;
}

function styleKind(style: string): ExcerptParagraph['kind'] {
  if (/^title$/i.test(style)) return 'title';
  if (/^(heading|subtitle)/i.test(style)) return 'heading';
  return 'body';
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return ENTITIES[entity] ?? match;
    const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  });
}

/** FNV-1a. Only used to seed recommendations, so collisions don't matter. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
