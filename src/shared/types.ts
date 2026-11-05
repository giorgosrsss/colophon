import type { DetectionProgress, DetectionResult, DetectorId, DetectorState } from './detectors.ts';

/** Properties stored inside the document, in docProps/core.xml and docProps/app.xml. */
export interface DocumentProperties {
  title: string;
  subject: string;
  creator: string;
  keywords: string;
  description: string;
  category: string;
  contentStatus: string;
  lastModifiedBy: string;
  revision: number | null;
  created: string | null;
  modified: string | null;
  lastPrinted: string | null;

  /** Minutes. */
  totalTime: number | null;
  pages: number | null;
  words: number | null;
  characters: number | null;
  charactersWithSpaces: number | null;
  lines: number | null;
  paragraphs: number | null;

  application: string;
  appVersion: string;
  template: string;
  company: string;
  manager: string;
}

/** Timestamps the file system keeps for the file itself. */
export interface FileTimes {
  fileCreated: string | null;
  fileModified: string | null;
  fileAccessed: string | null;
}

export type Fields = DocumentProperties & FileTimes;
export type FieldKey = keyof Fields;

export interface Layout {
  fontFamily: string | null;
  fontSizePt: number;
  lineSpacing: number;
}

export interface ExcerptParagraph {
  text: string;
  kind: 'title' | 'heading' | 'body';
}

export type SignalId =
  | 'vocabulary'
  | 'phrases'
  | 'rhythm'
  | 'openers'
  | 'dashes'
  | 'paragraphs'
  | 'triads'
  | 'slips'
  | 'voice';

export interface WritingSignal {
  id: SignalId;
  label: string;
  /** 0 to 1. */
  strength: number;
  pointsTo: 'ai' | 'person';
  finding: string;
  examples: string[];
}

export interface MarkedSentence {
  text: string;
  /** Character ranges within `text` that set off a signal, sorted and non-overlapping. */
  marks: [number, number][];
}

export interface WritingAssessment {
  words: number;
  sentences: number;
  /** 0 to 100, or null when there is too little text to judge. */
  score: number | null;
  verdict: 'person' | 'unclear' | 'ai' | 'too-short';
  signals: WritingSignal[];
  marked: MarkedSentence[];
}

/** What the text of the document actually contains, independent of the stored counts. */
export interface ContentStats {
  words: number;
  characters: number;
  charactersWithSpaces: number;
  paragraphs: number;
  lines: number;
  pages: number;
  layout: Layout;
  excerpt: ExcerptParagraph[];
  writing: WritingAssessment;
  fingerprint: number;
}

export interface OpenedDocument {
  path: string;
  name: string;
  folder: string;
  size: number;
  fields: Fields;
  content: ContentStats;
}

export interface RecentDocument {
  path: string;
  name: string;
  folder: string;
  openedAt: string;
}

/** Errors cross IPC as plain messages; Electron would otherwise wrap them in its own text. */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; message: string };

export interface Preferences {
  detector: DetectorId;
}

export interface ColophonApi {
  preferences(): Promise<Preferences>;
  setPreferences(changes: Partial<Preferences>): Promise<Preferences>;
  detectors(): Promise<Record<DetectorId, DetectorState>>;
  downloadDetector(id: DetectorId): Promise<void>;
  cancelDownload(id: DetectorId): void;
  /** Opens Microsoft's download page for the Visual C++ Redistributable the detector depends on. */
  openRuntimeDownload(): void;
  detect(path: string, id: DetectorId): Promise<DetectionResult>;
  onDetectorState(listener: (id: DetectorId, state: DetectorState) => void): () => void;
  onDetectionProgress(listener: (progress: DetectionProgress) => void): () => void;
  open(): Promise<OpenedDocument | null>;
  openPath(path: string): Promise<OpenedDocument>;
  save(path: string, changes: Partial<Fields>): Promise<OpenedDocument>;
  saveAs(path: string, changes: Partial<Fields>): Promise<OpenedDocument | null>;
  recent(): Promise<RecentDocument[]>;
  forget(path: string): Promise<void>;
  reveal(path: string): void;
  pathForFile(file: File): string;
  confirmDiscard(name: string): Promise<boolean>;
  setDirty(dirty: boolean): void;
  onOpenRequest(listener: (path: string) => void): () => void;
}
