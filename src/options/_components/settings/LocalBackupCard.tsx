import { Folder, Upload } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { formatRelativeTime } from '../format';
import { SettingRow, SettingsCard } from './SettingsCard';

interface LocalBackupCardProps {
  directory: string | null;
  lastSyncedAt: number | null;
  lastSyncError: string | null;
  isSyncing: boolean;
  clearArmed: boolean;
  onChooseDirectory: () => void;
  onClearDirectory: () => void;
  onSyncNow: () => void;
  onImport: () => void;
}

export function LocalBackupCard({
  directory,
  lastSyncedAt,
  lastSyncError,
  isSyncing,
  clearArmed,
  onChooseDirectory,
  onClearDirectory,
  onSyncNow,
  onImport
}: LocalBackupCardProps): ReactElement {
  const { t } = useTranslation();

  // Import is destructive (replaces everything) — keep its warning red. Shown in
  // both states, always the last row.
  const importRow = (
    <SettingRow
      label={t('settings.importTitle')}
      hint={<span className="text-danger">{t('settings.importWarning')}</span>}
      last
    >
      <Button variant="outline" size="sm" onClick={onImport}>
        {t('settings.importChooseFile')}
      </Button>
    </SettingRow>
  );

  return (
    <SettingsCard title={t('settings.dataAndBackupTitle')} sub={t('settings.dataAndBackupHint')}>
      {directory ? (
        <>
          {/* Folder + status header; folder management lives on the right. */}
          <div className="flex items-center gap-3 border-b border-border py-3.5">
            <span className="fz-icon-circle" style={{ width: 36, height: 36, background: 'var(--muted)' }}>
              <Folder size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{directory}</div>
              <div className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`fz-dot ${lastSyncError ? 'fz-dot-error' : 'fz-dot-ok'}`} />
                {lastSyncError
                  ? t('settings.syncFailed', { error: lastSyncError })
                  : `${t('settings.lastSyncedAt')} · ${formatRelativeTime(lastSyncedAt, t)}`}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onChooseDirectory}>
              {t('settings.changeDirectory')}
            </Button>
            <Button variant="danger" size="sm" onClick={onClearDirectory}>
              {clearArmed ? t('settings.clearDirectoryConfirm') : t('settings.clearDirectory')}
            </Button>
          </div>

          {/* Direction row, mirroring the GitHub card. */}
          <SettingRow label={t('settings.backupDir')} hint={t('settings.backupDesc')}>
            <Button
              variant="ink"
              size="sm"
              className="w-[104px] justify-center"
              disabled={isSyncing}
              onClick={onSyncNow}
            >
              <Upload size={15} aria-hidden="true" />
              {isSyncing ? t('sync.syncing') : t('settings.syncNow')}
            </Button>
          </SettingRow>

          {importRow}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onChooseDirectory}
            className="pressable mb-1 flex w-full items-center gap-3 rounded-[10px] border border-dashed border-border-strong bg-surface-2 px-3.5 py-4 text-left hover:bg-muted/50 focus-ring"
          >
            <span className="fz-icon-circle" style={{ width: 38, height: 38, background: 'var(--muted)' }}>
              <Folder size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{t('settings.chooseDirectory')}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t('settings.syncDirectoryHelpPrimary')}</div>
            </div>
          </button>

          {importRow}
        </>
      )}
    </SettingsCard>
  );
}
