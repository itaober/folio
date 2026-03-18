export function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function extractDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return 'unknown';
  }
}
