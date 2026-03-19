import { type KeyboardEvent, type ReactElement } from 'react';

interface TagInputFieldProps {
  tags: string[];
  inputValue: string;
  placeholder?: string;
  onInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (index: number) => void;
}

export function TagInputField({
  tags,
  inputValue,
  placeholder,
  onInputChange,
  onAddTag,
  onRemoveTag
}: TagInputFieldProps): ReactElement {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      onAddTag();
    }
  }

  return (
    <div className="rounded-[6px] border border-(--border) bg-bg-surface px-2 py-1.5">
      {tags.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {tags.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="group/tag relative inline-flex max-w-[180px] items-center rounded-[8px] bg-bg-elevated px-2.5 py-1 pr-4 text-xs text-text-secondary"
              title={tag}
            >
              <span className="truncate">#{tag}</span>
              <button
                type="button"
                className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-(--border) bg-bg-surface text-[11px] leading-none text-text-muted opacity-0 pointer-events-none transition-opacity group-hover/tag:pointer-events-auto group-hover/tag:opacity-100 hover:bg-bg-sunken hover:text-text-secondary"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveTag(index);
                }}
                aria-label={`Remove ${tag}`}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        className="h-6 w-full border-0 bg-transparent px-0 text-xs text-text-primary outline-none placeholder:text-text-muted"
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
    </div>
  );
}
