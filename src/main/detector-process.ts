import { utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import type { DetectionProgress, DetectionResult, DetectorId } from '../shared/detectors.ts';
import type { WorkerReply, WorkerRequest } from './detector-protocol.ts';
import { UserError } from './errors.ts';

/** A loaded model is worth keeping for the next check, but not forever: the large one holds 2 GB. */
const IDLE_MS = 3 * 60_000;

interface Job {
  resolve(result: DetectionResult): void;
  reject(error: Error): void;
  onProgress(progress: DetectionProgress): void;
}

/** Talks to the detector running in its own process, starting it on demand and again after a crash. */
export class DetectorProcess {
  private readonly script: string;
  private readonly locate: (id: DetectorId) => string;
  private readonly jobs = new Map<number, Job>();
  private child: UtilityProcess | null = null;
  private nextJob = 1;
  private idleTimer: NodeJS.Timeout | undefined;

  constructor(script: string, locate: (id: DetectorId) => string) {
    this.script = script;
    this.locate = locate;
  }

  detect(id: DetectorId, paragraphs: string[], onProgress: (progress: DetectionProgress) => void): Promise<DetectionResult> {
    clearTimeout(this.idleTimer);
    const child = this.start();
    const job = this.nextJob++;
    return new Promise<DetectionResult>((resolve, reject) => {
      this.jobs.set(job, { resolve, reject, onProgress });
      const request: WorkerRequest = { type: 'detect', job, id, dir: this.locate(id), paragraphs };
      child.postMessage(request);
    });
  }

  private start(): UtilityProcess {
    if (this.child) return this.child;
    const child = utilityProcess.fork(this.script, [], { serviceName: 'Colophon AI check' });

    child.on('message', (reply: WorkerReply) => {
      const job = this.jobs.get(reply.job);
      if (!job) return;
      if (reply.type === 'progress') {
        job.onProgress(reply.progress);
        return;
      }
      this.jobs.delete(reply.job);
      if (reply.type === 'result') job.resolve(reply.result);
      else job.reject(new UserError(reply.message));
      if (this.jobs.size === 0) this.idleTimer = setTimeout(() => this.stop(), IDLE_MS);
    });

    child.on('exit', (code) => {
      if (this.child === child) this.child = null;
      const crashed = new UserError(
        `The AI detector stopped unexpectedly (exit code ${code}). Try again, and reinstall Colophon if it keeps happening.`,
      );
      for (const job of this.jobs.values()) job.reject(crashed);
      this.jobs.clear();
    });

    this.child = child;
    return child;
  }

  private stop(): void {
    if (this.jobs.size > 0) return;
    this.child?.kill();
    this.child = null;
  }
}
