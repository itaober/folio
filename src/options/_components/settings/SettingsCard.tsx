import type { ReactElement, ReactNode } from 'react';

interface SettingsCardProps {
  title?: string;
  sub?: string;
  children: ReactNode;
}

export function SettingsCard({ title, sub, children }: SettingsCardProps): ReactElement {
  return (
    <div className="fz-card mb-[18px] p-[22px]">
      {title ? (
        <div className="mb-4">
          <div className="fz-h text-base font-bold">{title}</div>
          {sub ? <div className="mt-0.5 text-[13px] text-muted-foreground">{sub}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

interface SettingRowProps {
  label: string;
  hint?: ReactNode;
  last?: boolean;
  children: ReactNode;
}

export function SettingRow({ label, hint, last, children }: SettingRowProps): ReactElement {
  return (
    <div
      className={`flex items-center gap-5 py-3.5 ${last ? '' : 'border-b border-border'}`}
    >
      <div className="min-w-0 flex-1">
        <div className="fz-h text-sm font-semibold">{label}</div>
        {hint ? (
          <div className="mt-0.5 max-w-[380px] text-[13px] text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
