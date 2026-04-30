import type { ReactElement, ReactNode, SelectHTMLAttributes } from 'react';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  leftIcon?: ReactNode;
  wrapperClassName?: string;
}

export function SelectField({
  leftIcon,
  wrapperClassName,
  className,
  children,
  ...props
}: SelectFieldProps): ReactElement {
  const hasLeftIcon = Boolean(leftIcon);
  const baseClass =
    'folio-control folio-select h-10 w-full rounded-md border border-(--border) bg-bg-surface px-3 text-sm text-text-secondary';

  return (
    <label className={`relative block ${wrapperClassName ?? ''}`.trim()}>
      {hasLeftIcon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          {leftIcon}
        </span>
      ) : null}
      <select
        {...props}
        className={`${baseClass} ${hasLeftIcon ? 'pl-9' : ''} ${className ?? ''}`.trim()}
      >
        {children}
      </select>
    </label>
  );
}
