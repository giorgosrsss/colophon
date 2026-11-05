import type { ColophonApi } from '../shared/types.ts';

declare global {
  interface Window {
    colophon: ColophonApi;
  }
}

export const api = window.colophon;

const DOCUMENT_EXTENSION = /\.(docx|docm|dotx|dotm)$/i;

export function isDocumentPath(path: string): boolean {
  return DOCUMENT_EXTENSION.test(path);
}
