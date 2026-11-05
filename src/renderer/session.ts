import type { FieldKey, Fields, OpenedDocument } from '../shared/types.ts';

export interface Session {
  doc: OpenedDocument;
  draft: Fields;
  /** Which variation of the recommendation is on offer. */
  variant: number;
  /** The draft as it was before the recommendation was applied, for undo. */
  beforeApply: Fields | null;
}

export type SessionAction =
  | { type: 'load'; doc: OpenedDocument }
  | { type: 'edit'; key: FieldKey; value: Fields[FieldKey] }
  | { type: 'restore'; key: FieldKey }
  | { type: 'restore-all' }
  | { type: 'apply'; fields: Fields; variant: number }
  | { type: 'undo-apply' }
  | { type: 'next-variant' };

export function sessionReducer(session: Session | null, action: SessionAction): Session | null {
  if (action.type === 'load') {
    return { doc: action.doc, draft: action.doc.fields, variant: 0, beforeApply: null };
  }
  if (!session) return session;

  switch (action.type) {
    case 'edit':
      return { ...session, draft: { ...session.draft, [action.key]: action.value } };
    case 'restore':
      return { ...session, draft: { ...session.draft, [action.key]: session.doc.fields[action.key] } };
    case 'restore-all':
      return { ...session, draft: session.doc.fields, beforeApply: null };
    case 'apply':
      return {
        ...session,
        draft: action.fields,
        variant: action.variant,
        beforeApply: session.beforeApply ?? session.draft,
      };
    case 'undo-apply':
      return session.beforeApply ? { ...session, draft: session.beforeApply, beforeApply: null } : session;
    case 'next-variant':
      return { ...session, variant: session.variant + 1 };
  }
}
