import { Check, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui/Button';
import { IconButton } from '../../shared/ui/IconButton';
import { FolioMark } from '../../shared/ui/FolioMark';

export type HeaderMode = 'save' | 'saved' | 'disabled';

interface PopupHeaderProps {
  mode: HeaderMode;
  onSave: () => void;
  onRemove: () => void;
  onOpenLibrary: () => void;
}

/**
 * Popup header: the Folio mark, the primary capture action (ink "Save page"
 * pill / quiet green "Saved" ghost / disabled "Can't save"), and a link out to
 * the full library. Primary fill is the foreground ink, never a brand color.
 */
export function PopupHeader({
  mode,
  onSave,
  onRemove,
  onOpenLibrary
}: PopupHeaderProps): ReactElement {
  const { t } = useTranslation();
  // Two-step remove: first click arms, second confirms — no accidental delete
  // (the popup has no undo). Auto-disarms after a few seconds.
  const [armed, setArmed] = useState(false);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (disarmTimer.current !== null) {
        clearTimeout(disarmTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== 'saved') {
      setArmed(false);
    }
  }, [mode]);

  function handleRemoveClick(): void {
    if (armed) {
      if (disarmTimer.current !== null) {
        clearTimeout(disarmTimer.current);
      }
      setArmed(false);
      onRemove();
      return;
    }
    setArmed(true);
    disarmTimer.current = setTimeout(() => setArmed(false), 2600);
  }

  return (
    <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-3">
      <FolioMark size={20} />
      <span className="fz-title" style={{ fontSize: 16, fontWeight: 700 }}>
        {t('popup.title')}
      </span>
      <div className="flex-1" />

      {mode === 'saved' ? (
        <Button
          variant="ghost"
          size="sm"
          style={{ color: armed ? 'var(--danger)' : 'var(--st-done-fg)' }}
          title={t('popup.removeCurrent')}
          aria-label={t('popup.removeCurrent')}
          onClick={handleRemoveClick}
        >
          {armed ? <Trash2 size={14} strokeWidth={2.4} /> : <Check size={15} strokeWidth={2.6} />}
          {armed ? t('popup.removeConfirm') : t('popup.savedShort')}
        </Button>
      ) : (
        <Button
          variant="brand"
          size="sm"
          disabled={mode === 'disabled'}
          onClick={onSave}
        >
          <Plus size={15} strokeWidth={2.4} />
          {mode === 'disabled' ? t('popup.cantSave') : t('popup.saveShort')}
        </Button>
      )}

      <IconButton
        size="sm"
        title={t('popup.openDashboard')}
        aria-label={t('popup.openDashboard')}
        onClick={onOpenLibrary}
      >
        <ExternalLink size={16} strokeWidth={2} />
      </IconButton>
    </div>
  );
}
