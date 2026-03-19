import type { ReactElement } from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel
}: ToggleSwitchProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`relative inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
        checked ? 'bg-accent' : 'bg-bg-sunken'
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`h-4 w-4 rounded-full bg-[#fff8f2] transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
