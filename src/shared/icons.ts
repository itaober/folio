export type FolioIconVariant = 'classic' | 'mono';

export const DEFAULT_ICON_VARIANT: FolioIconVariant = 'classic';

export function isFolioIconVariant(value: unknown): value is FolioIconVariant {
  return value === 'classic' || value === 'mono';
}

function normalizeVariant(value: unknown): FolioIconVariant {
  if (isFolioIconVariant(value)) {
    return value;
  }

  if (value === 'dark' || value === 'cream') {
    return 'classic';
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

export function getIconSvgPath(
  variant: unknown,
  size: 16 | 32 | 48 | 128
): string {
  const normalized = normalizeVariant(variant);
  return `icons/${normalized}-${size}.svg`;
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
