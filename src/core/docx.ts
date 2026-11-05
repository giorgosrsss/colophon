import { posix } from 'node:path';
import JSZip from 'jszip';
import { analyzeContent, detectLayout } from './content.ts';
import { childElements, findChild, parseXml, serializeXml, setText, textOf } from './xml.ts';
import type { Element, ParsedXml } from './xml.ts';
import { emptyProperties } from '../shared/fields.ts';
import type { ContentStats, DocumentProperties } from '../shared/types.ts';

export class DocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxError';
  }
}

const NS = {
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  dcmitype: 'http://purl.org/dc/dcmitype/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  xmlns: 'http://www.w3.org/2000/xmlns/',
  extended: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
  vt: 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes',
  relationships: 'http://schemas.openxmlformats.org/package/2006/relationships',
  contentTypes: 'http://schemas.openxmlformats.org/package/2006/content-types',
} as const;

type Kind = 'text' | 'integer' | 'date' | 'w3cdtf';

interface Spec {
  key: keyof DocumentProperties;
  namespace: string;
  name: string;
  kind: Kind;
}

interface PartDefinition {
  defaultPath: string;
  relationshipType: string;
  contentType: string;
  skeleton: string;
  /** Every element the part may hold, in the order Word writes them. */
  order: string[];
  specs: Spec[];
}

const CORE: PartDefinition = {
  defaultPath: 'docProps/core.xml',
  relationshipType: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  contentType: 'application/vnd.openxmlformats-package.core-properties+xml',
  skeleton:
    `<cp:coreProperties xmlns:cp="${NS.cp}" xmlns:dc="${NS.dc}" xmlns:dcterms="${NS.dcterms}" ` +
    `xmlns:dcmitype="${NS.dcmitype}" xmlns:xsi="${NS.xsi}"></cp:coreProperties>`,
  order: [
    'title', 'subject', 'creator', 'keywords', 'description', 'lastModifiedBy', 'revision',
    'lastPrinted', 'created', 'modified', 'category', 'contentStatus',
  ],
  specs: [
    { key: 'title', namespace: NS.dc, name: 'dc:title', kind: 'text' },
    { key: 'subject', namespace: NS.dc, name: 'dc:subject', kind: 'text' },
    { key: 'creator', namespace: NS.dc, name: 'dc:creator', kind: 'text' },
    { key: 'keywords', namespace: NS.cp, name: 'cp:keywords', kind: 'text' },
    { key: 'description', namespace: NS.dc, name: 'dc:description', kind: 'text' },
    { key: 'lastModifiedBy', namespace: NS.cp, name: 'cp:lastModifiedBy', kind: 'text' },
    { key: 'revision', namespace: NS.cp, name: 'cp:revision', kind: 'integer' },
    { key: 'lastPrinted', namespace: NS.cp, name: 'cp:lastPrinted', kind: 'date' },
    { key: 'created', namespace: NS.dcterms, name: 'dcterms:created', kind: 'w3cdtf' },
    { key: 'modified', namespace: NS.dcterms, name: 'dcterms:modified', kind: 'w3cdtf' },
    { key: 'category', namespace: NS.cp, name: 'cp:category', kind: 'text' },
    { key: 'contentStatus', namespace: NS.cp, name: 'cp:contentStatus', kind: 'text' },
  ],
};

const EXTENDED: PartDefinition = {
  defaultPath: 'docProps/app.xml',
  relationshipType: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  contentType: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
  skeleton: `<Properties xmlns="${NS.extended}" xmlns:vt="${NS.vt}"></Properties>`,
  order: [
    'Template', 'TotalTime', 'Pages', 'Words', 'Characters', 'Application', 'DocSecurity', 'Lines',
    'Paragraphs', 'ScaleCrop', 'HeadingPairs', 'TitlesOfParts', 'Manager', 'Company', 'LinksUpToDate',
    'CharactersWithSpaces', 'SharedDoc', 'HyperlinkBase', 'HyperlinksChanged', 'AppVersion',
  ],
  specs: [
    { key: 'template', namespace: NS.extended, name: 'Template', kind: 'text' },
    { key: 'totalTime', namespace: NS.extended, name: 'TotalTime', kind: 'integer' },
    { key: 'pages', namespace: NS.extended, name: 'Pages', kind: 'integer' },
    { key: 'words', namespace: NS.extended, name: 'Words', kind: 'integer' },
    { key: 'characters', namespace: NS.extended, name: 'Characters', kind: 'integer' },
    { key: 'application', namespace: NS.extended, name: 'Application', kind: 'text' },
    { key: 'lines', namespace: NS.extended, name: 'Lines', kind: 'integer' },
    { key: 'paragraphs', namespace: NS.extended, name: 'Paragraphs', kind: 'integer' },
    { key: 'manager', namespace: NS.extended, name: 'Manager', kind: 'text' },
    { key: 'company', namespace: NS.extended, name: 'Company', kind: 'text' },
    { key: 'charactersWithSpaces', namespace: NS.extended, name: 'CharactersWithSpaces', kind: 'integer' },
    { key: 'appVersion', namespace: NS.extended, name: 'AppVersion', kind: 'text' },
  ],
};

const PARTS = [CORE, EXTENDED];

export interface ReadResult {
  properties: DocumentProperties;
  content: ContentStats;
  body: string[];
}

export async function readDocx(data: Uint8Array): Promise<ReadResult> {
  const pkg = await Package.load(data);
  const properties = emptyProperties();

  for (const part of PARTS) {
    const xml = await pkg.readPart(part);
    if (!xml) continue;
    for (const spec of part.specs) {
      const value = decode(spec.kind, textOf(findChild(xml.root, spec.namespace, localName(spec.name))));
      Object.assign(properties, { [spec.key]: value });
    }
  }

  const documentXml = await pkg.text(pkg.mainPart);
  if (documentXml === null) throw new DocxError('The document body is missing.');
  const layout = detectLayout(await pkg.related('/styles'), await pkg.related('/theme'));

  return { properties, ...analyzeContent(documentXml, layout) };
}

/** Rewrites only the properties named in `changes`. Every other byte of every other part is kept. */
export async function writeDocx(data: Uint8Array, changes: Partial<DocumentProperties>): Promise<Uint8Array> {
  const pkg = await Package.load(data);

  for (const part of PARTS) {
    const specs = part.specs.filter((spec) => spec.key in changes);
    if (!specs.length) continue;

    let xml = await pkg.readPart(part);
    if (!xml) {
      if (specs.every((spec) => isBlank(changes[spec.key]))) continue;
      xml = await pkg.createPart(part);
    }
    for (const spec of specs) {
      applyValue(xml, part, spec, changes[spec.key] ?? null);
    }
    pkg.write(pkg.partPath(part), serializeXml(xml));
  }

  return pkg.generate();
}

function applyValue(xml: ParsedXml, part: PartDefinition, spec: Spec, value: string | number | null): void {
  const existing = findChild(xml.root, spec.namespace, localName(spec.name));
  const text = encode(spec.kind, value);

  // Word keeps empty text elements around but drops numbers and dates it has no value for.
  if (text === null || (text === '' && spec.kind !== 'text')) {
    if (existing) xml.root.removeChild(existing);
    return;
  }
  if (existing) {
    setText(existing, text);
    return;
  }
  if (text === '') return;

  const el = xml.doc.createElementNS(spec.namespace, spec.name);
  if (spec.kind === 'w3cdtf') {
    declareNamespace(xml.root, 'xsi', NS.xsi);
    declareNamespace(xml.root, 'dcterms', NS.dcterms);
    el.setAttributeNS(NS.xsi, 'xsi:type', 'dcterms:W3CDTF');
  }
  setText(el, text);
  insertInOrder(xml.root, el, part.order);
}

function insertInOrder(root: Element, el: Element, order: string[]): void {
  const rank = order.indexOf(el.localName ?? '');
  const next = childElements(root).find((child) => order.indexOf(child.localName ?? '') > rank);
  root.insertBefore(el, next ?? null);
}

function declareNamespace(root: Element, prefix: string, uri: string): void {
  if (root.lookupNamespaceURI(prefix) !== uri) {
    root.setAttributeNS(NS.xmlns, `xmlns:${prefix}`, uri);
  }
}

function decode(kind: Kind, raw: string): string | number | null {
  const value = raw.trim();
  switch (kind) {
    case 'text':
      return raw;
    case 'integer': {
      const n = Number.parseInt(value, 10);
      return Number.isFinite(n) ? n : null;
    }
    case 'date':
    case 'w3cdtf': {
      const time = Date.parse(value);
      return value && Number.isFinite(time) ? new Date(time).toISOString() : null;
    }
  }
}

function encode(kind: Kind, value: string | number | null): string | null {
  if (value === null) return null;
  switch (kind) {
    case 'text':
      return String(value);
    case 'integer':
      return Number.isFinite(value) ? String(Math.max(0, Math.round(Number(value)))) : null;
    case 'date':
    case 'w3cdtf': {
      const time = Date.parse(String(value));
      // Office writes whole seconds in UTC, with no fraction.
      return Number.isFinite(time) ? new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
    }
  }
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function localName(qualified: string): string {
  return qualified.slice(qualified.indexOf(':') + 1);
}

interface Relationship {
  id: string;
  type: string;
  target: string;
}

class Package {
  readonly zip: JSZip;
  readonly mainPart: string;
  private readonly rootRels: Relationship[];

  private constructor(zip: JSZip, rootRels: Relationship[], mainPart: string) {
    this.zip = zip;
    this.rootRels = rootRels;
    this.mainPart = mainPart;
  }

  static async load(data: Uint8Array): Promise<Package> {
    if (isCompoundFile(data)) {
      throw new DocxError(
        'This is an older .doc file or a password-protected document. Save it from Word as a .docx without a password first.',
      );
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(data);
    } catch {
      throw new DocxError('This file is not a Word document, or it is damaged.');
    }

    const rels = await zip.file('_rels/.rels')?.async('string');
    const rootRels = rels ? readRelationships(rels, '') : [];
    const main = rootRels.find((rel) => rel.type.endsWith('/officeDocument'));
    const types = await zip.file('[Content_Types].xml')?.async('string');
    const mainType = main && types ? contentTypeOf(types, main.target) : '';

    if (!main || !/wordprocessingml|ms-word/.test(mainType)) {
      throw new DocxError('This file is not a Word document. Only .docx, .docm and .dotx files can be opened.');
    }
    return new Package(zip, rootRels, main.target);
  }

  partPath(part: PartDefinition): string {
    return this.rootRels.find((rel) => sameRelType(rel.type, part))?.target ?? part.defaultPath;
  }

  async text(path: string): Promise<string | null> {
    return (await this.zip.file(path)?.async('string')) ?? null;
  }

  async readPart(part: PartDefinition): Promise<ParsedXml | null> {
    const path = this.partPath(part);
    const source = await this.text(path);
    return source === null ? null : parseXml(source, path);
  }

  /** A part related to the main document, found by the tail of its relationship type. */
  async related(typeSuffix: string): Promise<string | null> {
    const relsPath = posix.join(posix.dirname(this.mainPart), '_rels', `${posix.basename(this.mainPart)}.rels`);
    const rels = await this.text(relsPath);
    if (!rels) return null;
    const rel = readRelationships(rels, posix.dirname(this.mainPart)).find((r) => r.type.endsWith(typeSuffix));
    return rel ? this.text(rel.target) : null;
  }

  async createPart(part: PartDefinition): Promise<ParsedXml> {
    const path = part.defaultPath;

    const rels = parseXml((await this.text('_rels/.rels')) ?? `<Relationships xmlns="${NS.relationships}"/>`, '_rels/.rels');
    const ids = new Set(childElements(rels.root).map((el) => el.getAttribute('Id')));
    let n = ids.size + 1;
    while (ids.has(`rId${n}`)) n++;
    const rel = rels.doc.createElementNS(NS.relationships, 'Relationship');
    rel.setAttribute('Id', `rId${n}`);
    rel.setAttribute('Type', part.relationshipType);
    rel.setAttribute('Target', path);
    rels.root.appendChild(rel);
    this.write('_rels/.rels', serializeXml(rels));
    this.rootRels.push({ id: `rId${n}`, type: part.relationshipType, target: path });

    const typesSource = await this.text('[Content_Types].xml');
    if (typesSource && contentTypeOf(typesSource, path) !== part.contentType) {
      const types = parseXml(typesSource, '[Content_Types].xml');
      const override = types.doc.createElementNS(NS.contentTypes, 'Override');
      override.setAttribute('PartName', `/${path}`);
      override.setAttribute('ContentType', part.contentType);
      types.root.appendChild(override);
      this.write('[Content_Types].xml', serializeXml(types));
    }

    return parseXml(part.skeleton, path);
  }

  /** Replaced entries keep their original timestamp; Word stamps every entry 1980-01-01. */
  write(path: string, content: string): void {
    const date = this.zip.file(path)?.date ?? new Date(1980, 0, 1);
    this.zip.file(path, content, { date, createFolders: false });
  }

  generate(): Promise<Uint8Array> {
    return this.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
}

/** Strict Open XML uses different namespace URIs for the same relationship types. */
function sameRelType(type: string, part: PartDefinition): boolean {
  return part === CORE ? type.endsWith('/metadata/core-properties') : type.endsWith('/extended-properties');
}

function readRelationships(xml: string, baseDir: string): Relationship[] {
  const { root } = parseXml(xml, 'relationships');
  return childElements(root)
    .filter((el) => el.localName === 'Relationship' && el.getAttribute('TargetMode') !== 'External')
    .map((el) => ({
      id: el.getAttribute('Id') ?? '',
      type: el.getAttribute('Type') ?? '',
      target: resolveTarget(baseDir, el.getAttribute('Target') ?? ''),
    }));
}

function resolveTarget(baseDir: string, target: string): string {
  const path = target.startsWith('/') ? target.slice(1) : posix.join(baseDir, target);
  return posix.normalize(path).replace(/^\.\//, '');
}

function contentTypeOf(typesXml: string, partPath: string): string {
  const { root } = parseXml(typesXml, '[Content_Types].xml');
  const name = `/${partPath}`.toLowerCase();
  const override = childElements(root).find(
    (el) => el.localName === 'Override' && el.getAttribute('PartName')?.toLowerCase() === name,
  );
  if (override) return override.getAttribute('ContentType') ?? '';
  const extension = posix.extname(partPath).slice(1).toLowerCase();
  const fallback = childElements(root).find(
    (el) => el.localName === 'Default' && el.getAttribute('Extension')?.toLowerCase() === extension,
  );
  return fallback?.getAttribute('ContentType') ?? '';
}

function isCompoundFile(data: Uint8Array): boolean {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return signature.every((byte, i) => data[i] === byte);
}
