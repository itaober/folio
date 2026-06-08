import { useState, type ReactElement, type ReactNode } from 'react';

interface RemoteFaviconProps {
  /** The item's stored favicon URL (may be empty). */
  src: string;
  className?: string;
  /** CSS-only chip shown when there is no URL or the image fails to load. */
  fallback: ReactNode;
}

/**
 * Renders a remote favicon image, swapping to a CSS fallback chip when the URL
 * is empty or the image fails to load (dead/blocked favicons would otherwise
 * show the browser's broken-image glyph). Reset per item by keying on item id.
 */
export function RemoteFavicon({ src, className, fallback }: RemoteFaviconProps): ReactElement {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <>{fallback}</>;
  }
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} />;
}
