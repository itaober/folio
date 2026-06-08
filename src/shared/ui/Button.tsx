import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';

export type ButtonVariant = 'ink' | 'brand' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  ink: 'fz-btn-ink',
  brand: 'fz-btn-brand',
  outline: 'fz-btn-outline',
  ghost: 'fz-btn-ghost',
  danger: 'fz-btn-danger'
};

/**
 * The one button. Wraps the faiz `fz-btn` utility classes so call sites pick a
 * variant + size instead of repeating `fz-btn fz-btn-… fz-btn-sm focus-ring`.
 * Every native button prop (onClick, disabled, title, aria-*, …) passes through;
 * extra layout classes go via `className`.
 */
export function Button({
  variant = 'outline',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps): ReactElement {
  const classes = ['fz-btn', VARIANT_CLASS[variant], size === 'sm' ? 'fz-btn-sm' : '', 'focus-ring', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
