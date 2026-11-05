import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { DETECTORS } from '../shared/detectors.ts';
import type { DetectorId } from '../shared/detectors.ts';
import type { Fields, IpcResult, Preferences } from '../shared/types.ts';
import { DetectorProcess } from './detector-process.ts';
import { UserError } from './errors.ts';
import { bodyText, DOCUMENT_EXTENSIONS, isDocumentPath, openDocument, saveDocument } from './files.ts';
import { ModelStore } from './models.ts';
import { PreferenceStore } from './preferences.ts';
import { RecentDocuments } from './recent.ts';

const TITLE_BAR_HEIGHT = 40;

/** Kept in step with --chrome and --text in the renderer's tokens. */
const CHROME = {
  light: { color: '#f6f7f8', symbolColor: '#1b1d22' },
  dark: { color: '#131417', symbolColor: '#e4e6ea' },
};

const FILTERS = [{ name: 'Word documents', extensions: DOCUMENT_EXTENSIONS }];

/** Microsoft's permanent link to the latest x64 Visual C++ Redistributable. */
const VC_RUNTIME_DOWNLOAD = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';

let window: BrowserWindow | null = null;
let dirty = false;
let pendingPath = findDocumentArgument(process.argv, process.cwd());

// Running from source keeps its own profile, so it never collides with the installed app.
if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')} (dev)`);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
    const path = findDocumentArgument(argv, workingDirectory);
    if (path) window.webContents.send('open-request', path);
  });
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
}

function start(): void {
  Menu.setApplicationMenu(null);
  const userData = app.getPath('userData');
  // The packaged app ships the standard model as resources/standard; from source it lives in models/.
  const bundledModels = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'models');
  const models = new ModelStore(bundledModels, join(userData, 'models'));

  registerHandlers(new RecentDocuments(userData));
  const detector = new DetectorProcess(join(__dirname, 'detector-worker.cjs'), (id) => models.dir(id));
  registerDetection(models, detector, new PreferenceStore(userData));
  window = createWindow();
}

function chrome() {
  return nativeTheme.shouldUseDarkColors ? CHROME.dark : CHROME.light;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'Colophon',
    backgroundColor: chrome().color,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...chrome(), height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  nativeTheme.on('updated', () => {
    if (!win.isDestroyed()) win.setTitleBarOverlay({ ...chrome(), height: TITLE_BAR_HEIGHT });
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    });
  }

  win.on('close', (event) => {
    if (!dirty) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Discard changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: 'Close without saving?',
      detail: 'Your changes have not been written to the document.',
    });
    if (choice === 0) {
      dirty = false;
      win.close();
    }
  });

  win.webContents.once('did-finish-load', () => {
    if (pendingPath) win.webContents.send('open-request', pendingPath);
    pendingPath = null;
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(join(__dirname, 'renderer', 'index.html'));
  return win;
}

function registerHandlers(recent: RecentDocuments): void {
  handle('open', async () => {
    const result = await dialog.showOpenDialog(window!, { properties: ['openFile'], filters: FILTERS });
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    const doc = await openDocument(path);
    await recent.add(path);
    return doc;
  });

  handle('open-path', async (_event, path: string) => {
    const doc = await openDocument(path);
    await recent.add(path);
    return doc;
  });

  handle('save', (_event, path: string, changes: Partial<Fields>) => saveDocument(path, changes));

  handle('save-as', async (_event, path: string, changes: Partial<Fields>) => {
    const result = await dialog.showSaveDialog(window!, { defaultPath: path, filters: FILTERS });
    if (result.canceled || !result.filePath) return null;
    const doc = await saveDocument(path, changes, result.filePath);
    await recent.add(result.filePath);
    return doc;
  });

  handle('recent', () => recent.list());
  handle('forget', (_event, path: string) => recent.remove(path));

  handle('confirm-discard', async (_event, name: string) => {
    const result = await dialog.showMessageBox(window!, {
      type: 'warning',
      buttons: ['Discard changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: `Discard your changes to ${name}?`,
      detail: 'The document on disk stays as it was.',
    });
    return result.response === 0;
  });

  ipcMain.on('reveal', (_event, path: string) => shell.showItemInFolder(path));
  ipcMain.on('set-dirty', (_event, value: boolean) => {
    dirty = value;
  });
}

function registerDetection(models: ModelStore, detector: DetectorProcess, preferences: PreferenceStore): void {
  const send = (channel: string, ...args: unknown[]) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, ...args);
  };

  handle('preferences', () => preferences.get());
  handle('set-preferences', (_event, changes: Partial<Preferences>) => preferences.update(changes));

  handle('detectors', async () => {
    const ids = Object.keys(DETECTORS) as DetectorId[];
    const states = await Promise.all(ids.map((id) => models.state(id)));
    return Object.fromEntries(ids.map((id, i) => [id, states[i]]));
  });

  handle('download-detector', async (_event, id: DetectorId) => {
    try {
      await models.download(id, (received, total) => send('detector-state', id, { status: 'downloading', received, total }));
      send('detector-state', id, await models.state(id));
    } catch (error) {
      send('detector-state', id, await models.state(id));
      throw error;
    }
  });

  ipcMain.on('cancel-download', (_event, id: DetectorId) => models.cancel(id));
  ipcMain.on('open-runtime-download', () => shell.openExternal(VC_RUNTIME_DOWNLOAD));

  handle('detect', async (_event, path: string, id: DetectorId) => {
    if ((await models.state(id)).status !== 'ready') throw new UserError(`The ${DETECTORS[id].name} model isn't downloaded yet.`);
    return detector.detect(id, await bodyText(path), (progress) => send('detection-progress', progress));
  });
}

function handle<A extends unknown[], R>(channel: string, fn: (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<R>> => {
    try {
      return { ok: true, value: await fn(event, ...(args as A)) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });
}

function findDocumentArgument(argv: string[], cwd: string): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue;
    const path = resolve(cwd, arg);
    if (isDocumentPath(path) && existsSync(path)) return path;
  }
  return null;
}
