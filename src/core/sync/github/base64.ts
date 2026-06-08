/**
 * UTF-8-safe base64 for the GitHub Contents API. Titles/notes/tags hold CJK and
 * emoji; `btoa(json)` corrupts them and the service worker has no Node Buffer,
 * so we encode bytes via TextEncoder first (03-data-flow §5.4).
 */

export function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
