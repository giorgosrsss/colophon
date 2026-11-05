import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessWriting } from '../src/core/writing.ts';

const body = (...paragraphs: string[]) => paragraphs.map((text) => ({ text, kind: 'body' as const }));

const MACHINE_STYLE = body(
  'In today’s fast-paced world, the role of urban parks cannot be overstated. Parks are not just places to relax — they are vibrant ecosystems that foster a sense of community. Moreover, they play a crucial role in shaping the health, happiness, and resilience of the cities we live in.',
  'At its core, the debate about parks is a debate about equity. Let’s delve into the multifaceted ways green spaces enhance our lives, from physical health to mental well-being to economic vitality. It’s important to note that these benefits are not evenly distributed across neighborhoods.',
  'Furthermore, the intricate interplay between design, maintenance, and public engagement determines whether a park thrives. A well-designed park serves as a testament to thoughtful planning — a beacon of what collaborative governance can achieve. Additionally, parks provide invaluable habitat for pollinators, birds, and other wildlife.',
  'In conclusion, investing in urban green spaces is not only an environmental imperative but also a pivotal step toward a more just society. By embracing a holistic approach, cities can unlock the potential of every neighborhood. Ultimately, the rich tapestry of urban life depends on the spaces we choose to protect.',
);

const PERSON_STYLE = body(
  'I didnt expect the garden thing to work. My neighbour Ruth talked me into it last spring, mostly because she was sick of looking at the empty lot behind the laundromat. We had no money. Zero. So we begged pallets off the hardware store and built six beds that were, honestly, a bit crooked.',
  'The first month was a mess. Half the tomatoes died because nobody watered them over the long weekend, and somebody pulled up the the beans thinking they were weeds. i was ready to quit. Ruth wasnt. She made a rota, taped it to the fence and texted everyone who signed it every single morning until they gave in.',
  'By August we had more zucchini than anyone could eat. Kids from the flats started coming by after school. One of them, Dev, decided he was in charge of the compost, which was fine by me because I hate the compost.',
  'Would I do it again? Probably. Ask me in March.',
);

describe('writing check', () => {
  it('scores prose full of model habits as likely AI', () => {
    const result = assessWriting(MACHINE_STYLE);
    assert.equal(result.verdict, 'ai');
    assert.ok((result.score ?? 0) >= 60, `score ${result.score}`);
    const strength = (id: string) => result.signals.find((s) => s.id === id)?.strength ?? 0;
    assert.ok(strength('vocabulary') > 0.8);
    assert.ok(strength('phrases') > 0.8);
    assert.ok(strength('dashes') > 0.5);
  });

  it('scores casual writing with slips as likely a person', () => {
    const result = assessWriting(PERSON_STYLE);
    assert.equal(result.verdict, 'person', `score ${result.score}`);
    const slips = result.signals.find((s) => s.id === 'slips');
    assert.ok((slips?.strength ?? 0) > 0.5);
    assert.ok(slips?.examples.some((e) => e.includes('the the')));
  });

  it('marks the exact words that set off a signal', () => {
    const { marked } = assessWriting(MACHINE_STYLE);
    assert.ok(marked.length > 0 && marked.length <= 6);
    const picked = marked.flatMap(({ text, marks }) => marks.map(([start, end]) => text.slice(start, end).toLowerCase()));
    assert.ok(picked.includes('delve') || picked.some((p) => p.startsWith("let’s delve")), picked.join(', '));
    for (const { text, marks } of marked) {
      let previous = -1;
      for (const [start, end] of marks) {
        assert.ok(start > previous && end <= text.length && start < end);
        previous = end;
      }
    }
  });

  it('declines to judge very short text', () => {
    const result = assessWriting(body('A short note. Only a few words here.'));
    assert.equal(result.verdict, 'too-short');
    assert.equal(result.score, null);
  });

  it('ignores headings', () => {
    const withHeadings = [{ text: 'Delve into the tapestry', kind: 'heading' as const }, ...PERSON_STYLE];
    assert.equal(assessWriting(withHeadings).score, assessWriting(PERSON_STYLE).score);
  });
});
