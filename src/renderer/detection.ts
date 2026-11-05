import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectionProgress, DetectionResult, DetectorId, DetectorState } from '../shared/detectors.ts';
import type { OpenedDocument } from '../shared/types.ts';
import { api } from './api.ts';

export interface Detection {
  detector: DetectorId;
  states: Record<DetectorId, DetectorState> | null;
  result: DetectionResult | null;
  progress: DetectionProgress | null;
  error: string | null;
  choose(id: DetectorId): void;
  download(id: DetectorId): void;
  cancel(id: DetectorId): void;
  retry(): void;
}

/**
 * Runs the chosen detector over the open document while `active`, and remembers results by
 * document and model so switching back and forth never runs the same check twice.
 */
export function useDetection(doc: OpenedDocument, active: boolean): Detection {
  const [detector, setDetector] = useState<DetectorId>('standard');
  const [states, setStates] = useState<Record<DetectorId, DetectorState> | null>(null);
  const [results, setResults] = useState<ReadonlyMap<string, DetectionResult>>(new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState<DetectionProgress | null>(null);
  const inFlight = useRef<string | null>(null);

  const key =`${detector}|${doc.path}|${doc.content.fingerprint}`;

  useEffect(() => {
    api.preferences().then((p) => setDetector(p.detector), () => {});
    api.detectors().then(setStates, () => {});
    const offState = api.onDetectorState((id, state) => setStates((all) => (all ? { ...all, [id]: state } : all)));
    const offProgress = api.onDetectionProgress(setProgress);
    return () => {
      offState();
      offProgress();
    };
  }, []);

  const ready = states?.[detector].status === 'ready';

  useEffect(() => {
    if (!active || !ready || inFlight.current || results.has(key) || errors.has(key)) return;
    inFlight.current = key;
    setRunning(key);
    setProgress(null);
    api
      .detect(doc.path, detector)
      .then(
        (result) => setResults((all) => new Map(all).set(key, result)),
        (error: unknown) => setErrors((all) => new Map(all).set(key, messageOf(error))),
      )
      .finally(() => {
        inFlight.current = null;
        setRunning(null);
      });
  }, [active, ready, running, results, errors, key, doc.path, detector]);

  const choose = useCallback((id: DetectorId) => {
    setDetector(id);
    api.setPreferences({ detector: id }).catch(() => {});
  }, []);

  const download = useCallback((id: DetectorId) => {
    setErrors((all) => {
      const next = new Map(all);
      for (const k of next.keys()) if (k.startsWith(`${id}|`)) next.delete(k);
      return next;
    });
    setStates((all) => (all ? { ...all, [id]: { status: 'downloading', received: 0, total: 0 } } : all));
    api.downloadDetector(id).catch((error: unknown) => {
      const message = messageOf(error);
      if (message !== 'Download cancelled.') {
        setStates((all) => (all ? { ...all, [id]: { status: 'error', message } } : all));
      }
    });
  }, []);

  const retry = useCallback(() => {
    setErrors((all) => {
      const next = new Map(all);
      next.delete(key);
      return next;
    });
  }, [key]);

  return {
    detector,
    states,
    result: results.get(key) ?? null,
    progress: running === key ? (progress ?? { done: 0, total: 0 }) : null,
    error: errors.get(key) ?? null,
    choose,
    download,
    cancel: api.cancelDownload,
    retry,
  };
}

export type Verdict = 'person' | 'unclear' | 'ai';

export function verdictOf(probability: number): Verdict {
  if (probability >= 0.7) return 'ai';
  if (probability >= 0.3) return 'unclear';
  return 'person';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The check failed.';
}
