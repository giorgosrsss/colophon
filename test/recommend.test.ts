import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { findIssues } from '../src/core/checks.ts';
import { readDocx } from '../src/core/docx.ts';
import { recommend } from '../src/core/recommend.ts';
import type { ContentStats, Fields } from '../src/shared/types.ts';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const { properties, content } = await readDocx(await readFile(new URL('./fixtures/essay.docx', import.meta.url)));

const fields: Fields = {
  ...properties,
  fileCreated: '2026-11-05T10:11:20.000Z',
  fileModified: '2026-11-05T10:11:36.000Z',
  fileAccessed: '2026-11-05T10:11:36.000Z',
};

function withWords(words: number): ContentStats {
  return { ...content, words, characters: words * 5, charactersWithSpaces: words * 6, fingerprint: words };
}

describe('recommendations', () => {
  it('suggests a believable amount of work for the word count', () => {
    const { plan, fields: next } = recommend(content, fields, 0, NOW);
    assert.ok(plan.minutes > 100 && plan.minutes < 180, `${plan.minutes} minutes for ${content.words} words`);
    assert.ok(plan.sittings >= 1 && plan.sittings <= 3);
    assert.equal(next.totalTime, plan.minutes);
    assert.equal(next.revision, plan.saves);
    assert.equal(next.words, content.words);
  });

  it("keeps Word's own layout counts when they are close to the estimate", () => {
    const { fields: next } = recommend(content, fields, 0, NOW);
    assert.equal(next.lines, properties.lines);
    assert.equal(next.pages, properties.pages);
    assert.equal(recommend(content, { ...fields, lines: 4 }, 0, NOW).fields.lines, content.lines);
  });

  it('keeps the last-saved date and builds the history backwards from it', () => {
    const { fields: next } = recommend(content, fields, 0, NOW);
    assert.equal(next.modified, properties.modified);
    assert.ok(Date.parse(next.created ?? '') < Date.parse(next.modified ?? ''));
    assert.ok(Date.parse(next.fileModified ?? '') >= Date.parse(next.modified ?? ''));
  });

  it('gives the same answer every time and settles once applied', () => {
    const first = recommend(content, fields, 0, NOW);
    assert.deepEqual(recommend(content, fields, 0, NOW), first);
    assert.deepEqual(recommend(content, first.fields, 0, NOW).changes, []);
  });

  it('offers a different variation on request', () => {
    const pick = ({ totalTime, revision, created, fileModified }: Fields) => ({ totalTime, revision, created, fileModified });
    const variants = [0, 1, 2].map((variant) => pick(recommend(content, fields, variant, NOW).fields));
    assert.notDeepEqual(variants[0], variants[1]);
    assert.notDeepEqual(variants[1], variants[2]);
  });

  it('never produces values that fail its own checks', () => {
    for (const words of [0, 12, 250, 829, 2400, 9000, 60000]) {
      for (const variant of [0, 1, 2, 3]) {
        const stats = words === 829 ? content : withWords(words);
        const next = recommend(stats, fields, variant, NOW).fields;
        assert.deepEqual(findIssues(next, stats, NOW), [], `${words} words, variant ${variant}`);
      }
    }
  });

  it('never moves the last save into the future', () => {
    const future = { ...fields, modified: '2027-03-01T09:00:00.000Z' };
    const next = recommend(content, future, 0, NOW).fields;
    assert.ok(Date.parse(next.modified ?? '') <= NOW);
  });

  it('fills in the usual Word defaults only where nothing is set', () => {
    const blank = { ...fields, application: '', appVersion: '', template: '', lastModifiedBy: '' };
    const next = recommend(content, blank, 0, NOW).fields;
    assert.equal(next.application, 'Microsoft Office Word');
    assert.equal(next.appVersion, '16.0000');
    assert.equal(next.template, 'Normal.dotm');
    assert.equal(next.lastModifiedBy, 'Morgan Ellery');

    const custom = recommend(content, { ...fields, template: 'Thesis.dotx' }, 0, NOW).fields;
    assert.equal(custom.template, 'Thesis.dotx');
  });
});

describe('checks', () => {
  it('flags dates that contradict each other', () => {
    const issues = findIssues({ ...fields, created: '2026-11-06T09:00:00.000Z', modified: '2026-11-05T09:00:00.000Z' }, content, NOW);
    assert.ok(issues.some((issue) => issue.key === 'created'));
  });

  it('flags editing time that would not fit between the dates', () => {
    const issues = findIssues({ ...fields, totalTime: 600 }, content, NOW);
    assert.ok(issues.some((issue) => issue.key === 'totalTime'));
  });

  it('flags a stored word count that does not match the text', () => {
    const issues = findIssues({ ...fields, words: 12 }, content, NOW);
    assert.ok(issues.some((issue) => issue.key === 'words'));
  });
});
