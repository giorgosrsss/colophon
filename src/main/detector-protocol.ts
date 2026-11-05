import type { DetectionProgress, DetectionResult, DetectorId } from '../shared/detectors.ts';

/** Messages between the main process and the utility process that runs the models. */
export type WorkerRequest = { type: 'detect'; job: number; id: DetectorId; dir: string; paragraphs: string[] };

export type WorkerReply =
  | { type: 'progress'; job: number; progress: DetectionProgress }
  | { type: 'result'; job: number; result: DetectionResult }
  | { type: 'error'; job: number; message: string };
