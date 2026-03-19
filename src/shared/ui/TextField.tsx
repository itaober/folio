import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
}

export function TextField({
  leftIcon,
  className,
  ...props
}: TextFieldProps): ReactElement {
  const hasLeftIcon = Boolean(leftIcon);
  const baseClass =
    'h-10 w-full rounded-md border border-(--border) bg-bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted';

  return (
    <label className="relative block">
      {hasLeftIcon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          {leftIcon}
        </span>
      ) : null}
      <input
        {...props}
        className={`${baseClass} ${hasLeftIcon ? 'pl-9' : ''} ${className ?? ''}`.trim()}
      />
    </label>
  );
}
