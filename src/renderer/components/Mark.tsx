export function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 2h9L20 7.5V19a3 3 0 0 1-3 3H5.5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" fill="var(--ink)" />
      <path d="M14.5 2v3.5a2 2 0 0 0 2 2H20Z" fill="var(--accent)" />
      <path d="M7 12.5h8M7 16.5h5" stroke="var(--on-ink)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
