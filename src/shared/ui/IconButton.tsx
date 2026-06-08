import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';

export type IconButtonTone = 'default' | 'danger';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
  tone?: IconButtonTone;
  children: ReactNode;
}

/**
 * Square icon-only button on the faiz `fz-iconbtn` utility — the companion to
 * {@link Button} for text actions. Every native button prop (onClick, title,
 * aria-*, pointer handlers for hold gestures, …) passes through; extra layout
 * classes go via `className`.
 */
export function IconButton({
  size = 'sm',
  tone = 'default',
  className = '',
  type = 'button',
  children,
  ...rest
}: IconButtonProps): ReactElement {
  const classes = [
    'fz-iconbtn',
    size === 'sm' ? 'fz-iconbtn-sm' : '',
    tone === 'danger' ? 'fz-iconbtn-danger' : '',
    'focus-ring',
    className
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
