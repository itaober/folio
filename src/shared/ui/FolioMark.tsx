import type { ReactElement } from 'react';

interface FolioMarkProps {
  size?: number;
  /** CSS color for the mark body. Defaults to the faiz ink (foreground). */
  color?: string;
  className?: string;
}

/**
 * Folio's own mark — a folded page / bookmark in a rounded square. Neutral, ink
 * by default (faiz: primary = foreground). The page lines are knocked out in the
 * page background color so the mark inverts correctly in light + dark.
 */
export function FolioMark({
  size = 22,
  color = 'var(--foreground)',
  className
}: FolioMarkProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ display: 'block', flex: '0 0 auto', color }}
      aria-hidden="true"
    >
      <rect x="2.5" y="1.5" width="19" height="21" rx="5" fill="currentColor" />
      <path
        d="M8.5 6.5h7M8.5 11h7M8.5 15.5h4"
        stroke="var(--background)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
