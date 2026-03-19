import { useEffect, useRef } from 'react';
import type { NoticeLevel } from './notice';

interface BaseNotice {
  level: NoticeLevel;
}

export function useAutoDismissNotice<T extends BaseNotice>(
  notice: T | null,
  setNotice: (next: T | null) => void,
  timeoutMs: number
): void {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!notice || notice.level === 'error') {
      return;
    }

    timerRef.current = window.setTimeout(() => {
      setNotice(null);
      timerRef.current = null;
    }, timeoutMs);
  }, [notice, setNotice, timeoutMs]);
}
