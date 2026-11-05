import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** A ref that always holds the latest value, for listeners registered once. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

let nextToastId = 1;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = nextToastId++;
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), tone === 'error' ? 6500 : 3200);
  }, []);

  return { toasts, notify };
}

/** True while files are dragged over the window. Drops anywhere go to `onDrop`. */
export function useFileDrop(onDrop: (file: File) => void): boolean {
  const [active, setActive] = useState(false);
  const handler = useLatest(onDrop);

  useEffect(() => {
    let depth = 0;
    const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth++;
      setActive(true);
    };
    const over = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = carriesFiles(event) ? 'copy' : 'none';
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      depth = 0;
      setActive(false);
      const file = event.dataTransfer?.files[0];
      if (file) handler.current(file);
    };

    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [handler]);

  return active;
}

export function useShortcuts(bindings: Record<string, () => void>): void {
  const latest = useLatest(bindings);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const combo = `${event.shiftKey ? 'Shift+' : ''}${event.key.toLowerCase()}`;
      const action = latest.current[combo];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [latest]);
}
