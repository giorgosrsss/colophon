import { ArrowClockwiseIcon, DownloadSimpleIcon, XIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { MIN_WORDS } from '../../core/writing.ts';
import { DETECTORS } from '../../shared/detectors.ts';
import type { DetectionResult, DetectorInfo, DetectorState } from '../../shared/detectors.ts';
import type { MarkedSentence, WritingAssessment, WritingSignal } from '../../shared/types.ts';
import { verdictOf } from '../detection.ts';
import type { Detection, Verdict } from '../detection.ts';
import { formatDownloadSize, formatNumber, plural } from '../format.ts';
import '../styles/writing.css';

const VERDICTS: Record<Verdict, string> = {
  ai: 'Likely AI-generated',
  unclear: 'Hard to tell',
  person: 'Likely written by a person',
};

export function AiCheck({ writing, detection }: { writing: WritingAssessment; detection: Detection }) {
  return (
    <div className="writing">
      <DetectorPicker detection={detection} />
      <ModelPanel detection={detection} />
      {detection.result && detection.result.sections.length > 1 && <SectionList result={detection.result} />}
      <WritingPatterns writing={writing} />
    </div>
  );
}

function DetectorPicker({ detection }: { detection: Detection }) {
  return (
    <div className="detector-picker" role="radiogroup" aria-label="Detection model">
      {Object.values(DETECTORS).map((info) => (
        <button
          key={info.id}
          role="radio"
          aria-checked={detection.detector === info.id}
          className="detector-option"
          onClick={() => detection.choose(info.id)}
        >
          <span className="detector-top">
            <span className="detector-name">{info.name}</span>
            <span className="detector-tag">{tagFor(info, detection.states?.[info.id])}</span>
          </span>
          <span className="detector-summary">{info.summary}</span>
        </button>
      ))}
    </div>
  );
}

function tagFor(info: DetectorInfo, state: DetectorState | undefined): string {
  if (info.bundled) return 'Built in';
  if (state?.status === 'ready') return 'Downloaded';
  if (state?.status === 'downloading') return state.total ? `${Math.floor((state.received / state.total) * 100)}%` : 'Starting';
  return formatDownloadSize(info.size);
}

function ModelPanel({ detection }: { detection: Detection }) {
  const info = DETECTORS[detection.detector];
  const state = detection.states?.[detection.detector];

  if (!state) return <div className="verdict verdict-loading" aria-busy="true" />;

  if (state.status === 'missing' || state.status === 'error') {
    return (
      <section className="verdict">
        <h2>Download the {info.name} model</h2>
        <p className="verdict-meta">
          {info.model}, {formatDownloadSize(info.size)} from Hugging Face. It’s saved on this computer, so you only download it
          once.
        </p>
        {state.status === 'error' && <p className="verdict-error">{state.message}</p>}
        <div className="verdict-actions">
          <button className="button button-accent" onClick={() => detection.download(info.id)}>
            <DownloadSimpleIcon />
            {state.status === 'error' ? 'Try again' : `Download ${formatDownloadSize(info.size)}`}
          </button>
        </div>
      </section>
    );
  }

  if (state.status === 'downloading') {
    const fraction = state.total ? state.received / state.total : 0;
    return (
      <section className="verdict">
        <h2>Downloading the {info.name} model</h2>
        <p className="verdict-meta num">
          {formatDownloadSize(state.received)} of {formatDownloadSize(state.total || info.size)}
        </p>
        <Progress fraction={fraction} />
        <div className="verdict-actions">
          <button className="button button-secondary" onClick={() => detection.cancel(info.id)}>
            <XIcon />
            Cancel
          </button>
        </div>
      </section>
    );
  }

  if (detection.error) {
    return (
      <section className="verdict">
        <h2>The check didn’t finish</h2>
        <p className="verdict-error">{detection.error}</p>
        <div className="verdict-actions">
          <button className="button button-secondary" onClick={detection.retry}>
            <ArrowClockwiseIcon />
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!detection.result) {
    const { done = 0, total = 0 } = detection.progress ?? {};
    return (
      <section className="verdict" aria-busy="true">
        <h2>Checking with the {info.name} model</h2>
        <p className="verdict-meta">
          {total ? `Section ${Math.min(done + 1, total)} of ${total}` : 'Loading the model'}
          {detection.detector === 'accurate' && done === 0 ? '. The first run takes a little longer.' : ''}
        </p>
        <Progress fraction={total ? done / total : 0} indeterminate={!total} />
      </section>
    );
  }

  return <ModelVerdict result={detection.result} info={info} />;
}

function ModelVerdict({ result, info }: { result: DetectionResult; info: DetectorInfo }) {
  const percent = Math.round(result.probability * 100);
  const verdict = verdictOf(result.probability);
  const sections = result.sections.length;

  return (
    <section className="verdict" data-verdict={verdict}>
      <div className="verdict-top">
        <div>
          <h2>{VERDICTS[verdict]}</h2>
          <p className="verdict-meta">
            {info.name} model, {plural(result.words, 'word')}
            {sections > 1 ? ` in ${sections} sections` : ''}, {result.seconds < 1 ? 'under a second' : `${result.seconds.toFixed(1)} s`}.
          </p>
        </div>
        <p className="verdict-score num" aria-label={`${percent} percent likely AI`}>
          {percent}
          <small>% AI</small>
        </p>
      </div>

      <div className="scale" aria-hidden="true">
        <div className="scale-track">
          <span data-zone="person" />
          <span data-zone="unclear" />
          <span data-zone="ai" />
        </div>
        <span className="scale-marker" style={{ left: `${percent}%` }} />
        <div className="scale-labels">
          <span>Person</span>
          <span>Hard to tell</span>
          <span>AI</span>
        </div>
      </div>

      {sections > 1 && (
        <p className="verdict-share">
          {result.aiShare === 0
            ? 'No section reads as more likely AI than not.'
            : `${Math.round(result.aiShare * 100)}% of the text is in sections that read as more likely AI than not.`}
        </p>
      )}

      <p className="verdict-note">
        An estimate, not proof. Detectors often disagree with each other, formal writing by people can score high, and
        edited AI text can score low. Don’t use it on its own to accuse anyone.
      </p>
    </section>
  );
}

function SectionList({ result }: { result: DetectionResult }) {
  return (
    <section className="section" aria-labelledby="by-section">
      <header className="section-head">
        <h2 id="by-section">By section</h2>
        <p>The model reads a few hundred words at a time, so longer documents are checked in parts.</p>
      </header>
      <ol className="model-sections">
        {result.sections.map((s) => {
          const percent = Math.round(s.probability * 100);
          return (
            <li key={s.fromWord} data-verdict={verdictOf(s.probability)}>
              <div className="model-section-head">
                <span>
                  Words {formatNumber(s.fromWord)} to {formatNumber(s.toWord)}
                </span>
                <span className="model-section-score num">{percent}% AI</span>
              </div>
              <div className="meter" aria-hidden="true">
                <span style={{ width: `${Math.max(percent, 1)}%` }} />
              </div>
              <p className="model-section-preview">{s.preview}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Progress({ fraction, indeterminate = false }: { fraction: number; indeterminate?: boolean }) {
  return (
    <div className="progress" data-indeterminate={indeterminate || undefined} role="progressbar" aria-valuenow={Math.round(fraction * 100)}>
      <span style={{ width: `${Math.round(fraction * 100)}%` }} />
    </div>
  );
}

function WritingPatterns({ writing }: { writing: WritingAssessment }) {
  const forAi = writing.signals.filter((s) => s.pointsTo === 'ai').sort((a, b) => b.strength - a.strength);
  const forPerson = writing.signals.filter((s) => s.pointsTo === 'person');

  return (
    <>
      <section className="section" aria-labelledby="patterns">
        <header className="section-head">
          <h2 id="patterns">Writing patterns</h2>
          <p>
            {writing.score === null
              ? `Needs at least ${formatNumber(MIN_WORDS)} words of body text. This document has ${formatNumber(writing.words)}.`
              : `Habits that show up far more in chatbot text than in people’s. Pattern score ${writing.score} of 100.`}
          </p>
        </header>
        {forAi.length > 0 && (
          <>
            <h3 className="signals-group">Points to AI</h3>
            <SignalList signals={forAi} />
          </>
        )}
        {forPerson.length > 0 && (
          <>
            <h3 className="signals-group">Points to a person</h3>
            <SignalList signals={forPerson} />
          </>
        )}
      </section>

      {writing.marked.length > 0 && (
        <section className="section" aria-labelledby="marked">
          <header className="section-head">
            <h2 id="marked">Sentences with the most patterns</h2>
          </header>
          <ul className="marked">
            {writing.marked.map((sentence, i) => (
              <li key={i}>
                <Highlighted sentence={sentence} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SignalList({ signals }: { signals: WritingSignal[] }) {
  return (
    <ul className="signals">
      {signals.map((s) => {
        const level = levelOf(s.strength);
        return (
          <li key={s.id} className="signal" data-level={level} data-points={s.pointsTo}>
            <div className="signal-name">
              <span>{s.label}</span>
              <span className="signal-level">
                <span className="pips" aria-hidden="true">
                  <i data-on={s.strength >= 0.15 || undefined} />
                  <i data-on={s.strength >= 0.4 || undefined} />
                  <i data-on={s.strength >= 0.7 || undefined} />
                </span>
                {LEVEL_NAMES[level]}
              </span>
            </div>
            <div>
              <p className="signal-finding">{s.finding}</p>
              {s.examples.length > 0 && (
                <ul className="signal-examples">
                  {s.examples.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type Level = 'none' | 'weak' | 'moderate' | 'strong';

const LEVEL_NAMES: Record<Level, string> = { none: 'None', weak: 'Weak', moderate: 'Moderate', strong: 'Strong' };

function levelOf(strength: number): Level {
  if (strength >= 0.7) return 'strong';
  if (strength >= 0.4) return 'moderate';
  if (strength >= 0.15) return 'weak';
  return 'none';
}

function Highlighted({ sentence }: { sentence: MarkedSentence }) {
  const parts: ReactNode[] = [];
  let at = 0;
  sentence.marks.forEach(([start, end], i) => {
    if (start > at) parts.push(sentence.text.slice(at, start));
    parts.push(<mark key={i}>{sentence.text.slice(start, end)}</mark>);
    at = end;
  });
  if (at < sentence.text.length) parts.push(sentence.text.slice(at));
  return <>{parts}</>;
}
