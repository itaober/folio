export type FolioIconVariant = 'classic' | 'dark' | 'cream';

export const DEFAULT_ICON_VARIANT: FolioIconVariant = 'classic';

export function isFolioIconVariant(value: unknown): value is FolioIconVariant {
  return value === 'classic' || value === 'dark' || value === 'cream';
}

function normalizeVariant(value: unknown): FolioIconVariant {
  if (isFolioIconVariant(value)) {
    return value;
  }
  return DEFAULT_ICON_VARIANT;
}

export function getIconPath(
  variant: unknown,
  size: 16 | 32 | 48 | 128
): string {
  const normalized = normalizeVariant(variant);
  return `icons/${normalized}-${size}.png`;
}

export function getActionIconPathSet(variant: unknown): {
  16: string;
  32: string;
  48: string;
  128: string;
} {
  return {
    16: getIconPath(variant, 16),
    32: getIconPath(variant, 32),
    48: getIconPath(variant, 48),
    128: getIconPath(variant, 128)
  };
}
