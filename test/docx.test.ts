import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import JSZip from 'jszip';
import { DocxError, readDocx, writeDocx } from '../src/core/docx.ts';

const essay = await readFile(new URL('./fixtures/essay.docx', import.meta.url));

/** What Word itself reports for the fixture (ComputeStatistics, right after saving). */
const WORD_REPORTS = { words: 829, characters: 3782, charactersWithSpaces: 4593, paragraphs: 18, pages: 3 };

async function part(data: Uint8Array, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const file = zip.file(path);
  assert.ok(file, `${path} is missing`);
  return file.async('string');
}

async function bareDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      '<w:p><w:r><w:t>Fish &amp; chips</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">for two </w:t></w:r></w:p>' +
      '<w:p/>' +
      '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Second</w:t></w:r></w:p>' +
      '</w:body></w:document>',
  );
  return zip.generateAsync({ type: 'uint8array' });
}

describe('reading', () => {
  it('counts the text the way Word does', async () => {
    const { content } = await readDocx(essay);
    assert.equal(content.words, WORD_REPORTS.words);
    assert.equal(content.characters, WORD_REPORTS.characters);
    assert.equal(content.charactersWithSpaces, WORD_REPORTS.charactersWithSpaces);
    assert.equal(content.paragraphs, WORD_REPORTS.paragraphs);
    assert.equal(content.pages, WORD_REPORTS.pages);
  });

  it('reads the stored properties', async () => {
    const { properties } = await readDocx(essay);
    assert.equal(properties.creator, 'Morgan Ellery');
    assert.equal(properties.revision, 1);
    assert.equal(properties.totalTime, 0);
    assert.equal(properties.words, WORD_REPORTS.words);
    assert.equal(properties.application, 'Microsoft Office Word');
    assert.equal(properties.title, '');
    assert.equal(properties.lastPrinted, null);
    assert.match(properties.created ?? '', /^\d{4}-\d\d-\d\dT\d\d:\d\d:00\.000Z$/);
  });

  it('finds the default font and spacing through the theme', async () => {
    const { content } = await readDocx(essay);
    assert.equal(content.layout.fontFamily, 'Aptos');
    assert.equal(content.layout.fontSizePt, 12);
    assert.ok(Math.abs(content.layout.lineSpacing - 278 / 240) < 0.001);
  });

  it('keeps headings apart from body text in the excerpt', async () => {
    const { content } = await readDocx(essay);
    assert.deepEqual(content.excerpt[0], { text: 'Why Cities Plant Street Trees', kind: 'title' });
    assert.equal(content.excerpt[1]?.kind, 'heading');
    assert.equal(content.excerpt[2]?.kind, 'body');
  });

  it('decodes entities, counts tabs as spaces and ignores tab stop definitions', async () => {
    const { content, properties } = await readDocx(await bareDocx());
    assert.equal(content.words, 6);
    assert.equal(content.paragraphs, 2);
    assert.equal(content.charactersWithSpaces, 'Fish & chips\tfor two '.length + 'Second'.length);
    assert.equal(content.excerpt[0]?.text, 'Fish & chips for two');
    assert.equal(properties.creator, '');
    assert.equal(properties.totalTime, null);
  });

  it('refuses files that are not Word documents', async () => {
    await assert.rejects(readDocx(new TextEncoder().encode('plain text')), DocxError);
    const legacy = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0]);
    await assert.rejects(readDocx(legacy), /older \.doc/);
  });
});

describe('writing', () => {
  it('round-trips every kind of value', async () => {
    const written = await writeDocx(essay, {
      title: 'Street trees',
      creator: 'Avery Lindqvist',
      totalTime: 312,
      revision: 41,
      created: '2026-10-30T15:08:00.000Z',
      modified: '2026-11-03T19:47:00.000Z',
      lastPrinted: '2026-11-04T08:15:00.000Z',
      company: 'Northfield College',
      words: 830,
    });
    const { properties } = await readDocx(written);
    assert.equal(properties.title, 'Street trees');
    assert.equal(properties.creator, 'Avery Lindqvist');
    assert.equal(properties.totalTime, 312);
    assert.equal(properties.revision, 41);
    assert.equal(properties.created, '2026-10-30T15:08:00.000Z');
    assert.equal(properties.modified, '2026-11-03T19:47:00.000Z');
    assert.equal(properties.lastPrinted, '2026-11-04T08:15:00.000Z');
    assert.equal(properties.company, 'Northfield College');
    assert.equal(properties.words, 830);
    assert.equal(properties.lastModifiedBy, 'Morgan Ellery');
  });

  it('writes dates the way Office does and puts new elements where Word would', async () => {
    const written = await writeDocx(essay, { lastPrinted: '2026-11-04T08:15:27.512Z', modified: '2026-11-03T19:47:00.000Z' });
    const core = await part(written, 'docProps/core.xml');
    assert.match(core, /<cp:revision>1<\/cp:revision><cp:lastPrinted>2026-11-04T08:15:27Z<\/cp:lastPrinted><dcterms:created/);
    assert.match(core, /<dcterms:modified xsi:type="dcterms:W3CDTF">2026-11-03T19:47:00Z<\/dcterms:modified>/);
    assert.ok(core.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<cp:coreProperties'));
  });

  it('removes numbers and dates that are cleared, but keeps empty text elements', async () => {
    const written = await writeDocx(essay, { totalTime: null, created: null, subject: '' });
    const core = await part(written, 'docProps/core.xml');
    const app = await part(written, 'docProps/app.xml');
    assert.doesNotMatch(app, /TotalTime/);
    assert.doesNotMatch(core, /dcterms:created/);
    assert.match(core, /<dc:subject\/>|<dc:subject><\/dc:subject>/);
  });

  it('leaves every other part untouched', async () => {
    const written = await writeDocx(essay, { totalTime: 95 });
    const before = await JSZip.loadAsync(essay);
    const after = await JSZip.loadAsync(written);
    assert.deepEqual(Object.keys(after.files), Object.keys(before.files));
    for (const name of Object.keys(before.files)) {
      if (name === 'docProps/app.xml') continue;
      assert.equal(await after.file(name)?.async('string'), await before.file(name)?.async('string'), name);
    }
    assert.equal(after.file('docProps/app.xml')?.date.getTime(), before.file('docProps/app.xml')?.date.getTime());
    assert.equal(await part(written, 'docProps/core.xml'), await part(essay, 'docProps/core.xml'));
  });

  it('creates the property parts when a document has none', async () => {
    const written = await writeDocx(await bareDocx(), { creator: 'Avery Lindqvist', totalTime: 4, created: '2026-01-02T03:04:00.000Z' });
    const types = await part(written, '[Content_Types].xml');
    const rels = await part(written, '_rels/.rels');
    assert.match(types, /PartName="\/docProps\/core\.xml"/);
    assert.match(types, /PartName="\/docProps\/app\.xml"/);
    assert.match(rels, /Id="rId2"[^>]*metadata\/core-properties/);
    assert.match(rels, /Id="rId3"[^>]*extended-properties/);
    const { properties } = await readDocx(written);
    assert.equal(properties.creator, 'Avery Lindqvist');
    assert.equal(properties.totalTime, 4);
    assert.equal(properties.created, '2026-01-02T03:04:00.000Z');
  });

  it('does not create parts just to store nothing', async () => {
    const bare = await bareDocx();
    const written = await writeDocx(bare, { title: '', totalTime: null });
    const zip = await JSZip.loadAsync(written);
    assert.equal(zip.file('docProps/core.xml'), null);
    assert.equal(zip.file('docProps/app.xml'), null);
  });
});
