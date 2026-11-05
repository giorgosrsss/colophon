import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ContentStats } from '../../shared/types.ts';

/** US Letter at 96 dpi with one-inch margins. The page is laid out at full size, then scaled to fit. */
const PAGE_WIDTH = 816;

const SERIF = /times|cambria|georgia|garamond|palatino|antiqua|baskerville|minion|bookman|century|serif/i;

function fontStack(family: string | null): string {
  const fallback = family && SERIF.test(family) ? "'Times New Roman', serif" : "Aptos, Calibri, 'Segoe UI', sans-serif";
  return family ? `"${family.replace(/"/g, '')}", ${fallback}` : fallback;
}

export function Sheet({ content }: { content: ContentStats }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / PAGE_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { layout, excerpt } = content;
  const style: CSSProperties = {
    transform: `scale(${scale})`,
    fontFamily: fontStack(layout.fontFamily),
    fontSize: `${layout.fontSizePt}pt`,
    lineHeight: layout.lineSpacing * 1.17,
  };

  return (
    <div className="sheet" ref={frame} aria-label="First page of the document">
      <div className="sheet-page" style={style} data-ready={scale > 0 || undefined}>
        <div className="sheet-text">
          {excerpt.length > 0 ? (
            excerpt.map((paragraph, i) => (
              <p key={i} data-kind={paragraph.kind}>
                {paragraph.text || ' '}
              </p>
            ))
          ) : (
            <p className="sheet-blank">This document has no text.</p>
          )}
        </div>
      </div>
    </div>
  );
}
