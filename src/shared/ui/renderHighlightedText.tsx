import type { ReactNode } from 'react';

export function renderHighlightedText(
  text: string,
  keyword: string,
  highlightClassName = 'text-accent'
): ReactNode {
  const term = keyword.trim();
  if (!term) {
    return text;
  }

  const loweredText = text.toLowerCase();
  const loweredTerm = term.toLowerCase();
  const chunks: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = loweredText.indexOf(loweredTerm, cursor);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      chunks.push(text.slice(cursor, matchIndex));
    }

    const end = matchIndex + term.length;
    chunks.push(
      <span key={`${matchIndex}-${end}`} className={highlightClassName}>
        {text.slice(matchIndex, end)}
      </span>
    );
    cursor = end;
    matchIndex = loweredText.indexOf(loweredTerm, cursor);
  }

  if (chunks.length === 0) {
    return text;
  }

  if (cursor < text.length) {
    chunks.push(text.slice(cursor));
  }

  return <>{chunks}</>;
}
