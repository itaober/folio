import type { ReactElement } from 'react';

interface DeleteProgressRingProps {
  /** 0..1 hold progress. */
  progress: number;
  size?: number;
}

/**
 * Hold-to-delete progress as a thin stroke ring traced around the edge of the
 * delete button (NOT a filled pie sector). Rendered as an absolute overlay; the
 * Trash icon stays centered underneath. Shared by the popup and options rows.
 */
export function DeleteProgressRing({ progress, size = 28 }: DeleteProgressRingProps): ReactElement {
  const stroke = 2;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const center = size / 2;
  return (
    <svg
      className="pointer-events-none absolute inset-0 m-auto -rotate-90"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
    >
      <circle cx={center} cy={center} r={r} stroke="var(--danger-tint)" strokeWidth={stroke} />
      <circle
        cx={center}
        cy={center}
        r={r}
        stroke="var(--danger)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(Math.max(progress, 0), 1))}
      />
    </svg>
  );
}
