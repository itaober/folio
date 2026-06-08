import type { ReactElement, ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  ariaLabel?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Tighter sizing for narrow surfaces (popup): smaller padding + font. */
  tight?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * iOS-style segmented control on the faiz `fz-seg` track. The active segment is
 * marked with `data-active="true"` (CSS handles the resting surface + shadow).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tight = false,
  className,
  ariaLabel
}: SegmentedProps<T>): ReactElement {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`fz-seg ${tight ? 'fz-seg-tight' : ''} ${className ?? ''}`.trim()}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.ariaLabel}
            data-active={active ? 'true' : undefined}
            className="fz-seg-btn"
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
