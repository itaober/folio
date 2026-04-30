import { type KeyboardEvent, type ReactElement } from 'react';

interface TagInputFieldProps {
  tags: string[];
  inputValue: string;
  placeholder?: string;
  removeButtonTitle?: string;
  removeButtonLabel?: (tag: string) => string;
  onInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (index: number) => void;
}

export function TagInputField({
  tags,
  inputValue,
  placeholder,
  removeButtonTitle = 'Remove',
  removeButtonLabel = (tag: string) => `Remove ${tag}`,
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
    <div className="folio-control rounded-md border border-(--border) bg-bg-surface px-2 py-1.5 focus-within:border-(--accent-border)">
      {tags.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {tags.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="group/tag relative inline-flex max-w-[180px] items-center rounded-md bg-bg-elevated px-2.5 py-1 pr-4 text-xs text-text-secondary"
              title={tag}
            >
              <span className="truncate">#{tag}</span>
              <button
                type="button"
                className="folio-pressable absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-(--border) bg-bg-surface text-[11px] leading-none text-text-muted opacity-70 hover:bg-bg-sunken hover:text-text-secondary hover:opacity-100 focus-visible:opacity-100"
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
                aria-label={removeButtonLabel(tag)}
                title={removeButtonTitle}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        className="h-6 w-full border-0 bg-transparent px-0 text-xs text-text-primary placeholder:text-text-muted"
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
    </div>
  );
}
