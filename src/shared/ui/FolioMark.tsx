import type { ReactElement } from 'react';
import { getIconSvgPath, type FolioIconVariant } from '../icons';

interface FolioMarkProps {
  variant: FolioIconVariant;
  size?: number;
  className?: string;
}

export function FolioMark({
  variant,
  size = 16,
  className
}: FolioMarkProps): ReactElement {
  const assetSize = size <= 16 ? 16 : size <= 32 ? 32 : size <= 48 ? 48 : 128;
  const src = chrome.runtime.getURL(getIconSvgPath(variant, assetSize));

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={className}
    />
  );
}
