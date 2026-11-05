import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { ColophonApi, IpcResult } from '../shared/types.ts';

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

// Files passed on the command line can arrive before the page subscribes, so hold them until it does.
const queued: string[] = [];
let openListener: ((path: string) => void) | null = null;

ipcRenderer.on('open-request', (_event, path: string) => {
  if (openListener) openListener(path);
  else queued.push(path);
});

function subscribe<A extends unknown[]>(channel: string, listener: (...args: A) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, ...args: unknown[]) => listener(...(args as A));
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: ColophonApi = {
  preferences: () => call('preferences'),
  setPreferences: (changes) => call('set-preferences', changes),
  detectors: () => call('detectors'),
  downloadDetector: (id) => call('download-detector', id),
  cancelDownload: (id) => ipcRenderer.send('cancel-download', id),
  openRuntimeDownload: () => ipcRenderer.send('open-runtime-download'),
  detect: (path, id) => call('detect', path, id),
  onDetectorState: (listener) => subscribe('detector-state', listener),
  onDetectionProgress: (listener) => subscribe('detection-progress', listener),
  open: () => call('open'),
  openPath: (path) => call('open-path', path),
  save: (path, changes) => call('save', path, changes),
  saveAs: (path, changes) => call('save-as', path, changes),
  recent: () => call('recent'),
  forget: (path) => call('forget', path),
  confirmDiscard: (name) => call('confirm-discard', name),
  reveal: (path) => ipcRenderer.send('reveal', path),
  setDirty: (dirty) => ipcRenderer.send('set-dirty', dirty),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onOpenRequest(listener) {
    openListener = listener;
    for (const path of queued.splice(0)) listener(path);
    return () => {
      if (openListener === listener) openListener = null;
    };
  },
};

contextBridge.exposeInMainWorld('colophon', api);
