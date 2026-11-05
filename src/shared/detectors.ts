export type DetectorId = 'standard' | 'accurate';

export interface DetectorInfo {
  id: DetectorId;
  name: string;
  model: string;
  /** Bytes on disk. */
  size: number;
  summary: string;
  bundled: boolean;
}

export const DETECTORS: Record<DetectorId, DetectorInfo> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    model: 'Fakespot RoBERTa-base',
    size: 126_742_160,
    summary: 'Fast, and good at spotting chatbot-style text.',
    bundled: true,
  },
  accurate: {
    id: 'accurate',
    name: 'Accurate',
    model: 'Desklib DeBERTa-v3-large',
    size: 1_746_191_237,
    summary: 'A much larger model, usually more accurate. Slower, and needs about 3 GB of memory.',
    bundled: false,
  },
};

export interface SectionResult {
  /** First and last word of the section, counted through the body text from 1. */
  fromWord: number;
  toWord: number;
  preview: string;
  probability: number;
}

export interface DetectionResult {
  detector: DetectorId;
  /** Chance the text is AI-generated, weighted by section length. 0 to 1. */
  probability: number;
  /** Share of the text in sections the model rates as more likely AI than not. */
  aiShare: number;
  sections: SectionResult[];
  words: number;
  seconds: number;
}

export type DetectorState =
  | { status: 'ready' }
  | { status: 'missing' }
  | { status: 'downloading'; received: number; total: number }
  | { status: 'error'; message: string };

export type DetectionProgress = { done: number; total: number };
