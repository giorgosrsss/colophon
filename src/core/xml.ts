import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { Document, Element } from '@xmldom/xmldom';

export type { Document, Element };

const DECLARATION = /^\s*<\?xml[^?]*\?>/;
const STANDARD_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export interface ParsedXml {
  doc: Document;
  root: Element;
  declaration: string;
}

const ELEMENT_NODE = 1;

export function parseXml(source: string, part: string): ParsedXml {
  let failure: string | null = null;
  let doc: Document | null = null;
  try {
    const parser = new DOMParser({
      onError(level, message) {
        if (level !== 'warning') failure ??= message;
      },
    });
    doc = parser.parseFromString(source, 'text/xml');
  } catch (error) {
    failure ??= error instanceof Error ? error.message : String(error);
  }
  const root = doc?.documentElement;
  if (failure || !doc || !root) {
    throw new Error(`${part} is not valid XML${failure ? `: ${failure}` : ''}`);
  }
  const declaration = DECLARATION.exec(source)?.[0].trim() ?? STANDARD_DECLARATION;
  return { doc, root, declaration };
}

/** Word writes the declaration followed by CRLF and no other whitespace, so we do the same. */
export function serializeXml({ doc, declaration }: ParsedXml): string {
  const body = new XMLSerializer().serializeToString(doc).replace(DECLARATION, '');
  return `${declaration}\r\n${body.replace(/^\s+/, '')}`;
}

export function childElements(parent: Element): Element[] {
  const result: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === ELEMENT_NODE) result.push(node as Element);
  }
  return result;
}

export function findChild(parent: Element, namespace: string, localName: string): Element | null {
  return childElements(parent).find((el) => el.namespaceURI === namespace && el.localName === localName) ?? null;
}

export function textOf(el: Element | null): string {
  return el?.textContent ?? '';
}

export function setText(el: Element, value: string): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  if (value && el.ownerDocument) el.appendChild(el.ownerDocument.createTextNode(value));
}
