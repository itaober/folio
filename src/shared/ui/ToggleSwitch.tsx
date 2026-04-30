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
      className={`folio-pressable relative inline-flex h-6 w-11 items-center rounded-full p-0.5 ${
        checked ? 'bg-accent' : 'bg-bg-sunken'
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`h-5 w-5 rounded-full bg-bg-base transition-transform duration-150 ease-[var(--ease-out)] ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
