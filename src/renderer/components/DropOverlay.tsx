import { FileArrowUpIcon } from '@phosphor-icons/react';

export function DropOverlay() {
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-target">
        <FileArrowUpIcon size={30} />
        <p>Drop to open</p>
      </div>
    </div>
  );
}
