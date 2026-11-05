// Runs inside an Electron utility process. ONNX Runtime is native code, and if it ever
// fails hard it should take down this process, not the app.
import type { DetectorId } from '../shared/detectors.ts';
import { Detector } from './detector.ts';
import type { WorkerReply, WorkerRequest } from './detector-protocol.ts';
import { UserError } from './errors.ts';

const port = process.parentPort;
const dirs = new Map<DetectorId, string>();
const detector = new Detector((id) => dirs.get(id) ?? '');

// One check at a time: the detector holds a single model, and switching mid-run would unload it.
let queue: Promise<void> = Promise.resolve();

port.on('message', ({ data }: { data: WorkerRequest }) => {
  queue = queue.then(() => handle(data));
});

async function handle(request: WorkerRequest): Promise<void> {
  const { job, id, dir, paragraphs } = request;
  dirs.set(id, dir);
  const reply = (message: WorkerReply) => port.postMessage(message);
  try {
    const result = await detector.detect(id, paragraphs, (progress) => reply({ type: 'progress', job, progress }));
    reply({ type: 'result', job, result });
  } catch (error) {
    const message = error instanceof UserError ? error.message : `The check failed: ${error instanceof Error ? error.message : String(error)}`;
    reply({ type: 'error', job, message });
  }
}
