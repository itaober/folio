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
    'folio-select h-10 w-full rounded-[var(--r-md)] border border-border bg-surface px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-[var(--dur-normal)] ease-[var(--ease)] focus:border-accent focus:shadow-[0_0_0_3px_var(--brand-tint)]';

  return (
    <label className={`relative block ${wrapperClassName ?? ''}`.trim()}>
      {hasLeftIcon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
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
