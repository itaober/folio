import type { FolioStatus } from '../../core/types';

export type ViewKey = 'all' | FolioStatus | 'settings';

export type ExportScope = 'current' | 'all';

export interface NoticeState {
  level: 'success' | 'error' | 'info';
  text: string;
}
