import { useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface TagManagerProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

const MAX_TAG_LENGTH = 30;

function TagManager({ tags, onChange }: TagManagerProps) {
  const [input, setInput] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = input.trim().slice(0, MAX_TAG_LENGTH);
    if (!trimmed) return;

    // Prevent duplicates (case-insensitive)
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setInput('');
      return;
    }

    onChange([...tags, trimmed]);
    setInput('');
  }, [input, tags, onChange]);

  const handleRemove = useCallback(
    (tag: string) => {
      onChange(tags.filter((t) => t !== tag));
    },
    [tags, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
      // Backspace on empty input removes last tag
      if (e.key === 'Backspace' && !input && tags.length > 0) {
        onChange(tags.slice(0, -1));
      }
    },
    [handleAdd, input, tags, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Tag badges */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
              }}
            >
              {tag}
              <button
                onClick={() => handleRemove(tag)}
                className="flex items-center justify-center w-3.5 h-3.5 rounded-full cursor-pointer transition-colors"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary)',
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-primary)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-primary)';
                }}
                aria-label={`Remove ${tag}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value.slice(0, MAX_TAG_LENGTH))}
        onKeyDown={handleKeyDown}
        placeholder="Add a tag..."
        className="w-full h-9 px-3 text-sm"
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--color-primary)';
          e.target.style.boxShadow = 'var(--shadow-focus)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--color-border)';
          e.target.style.boxShadow = '';
        }}
      />

      {input.length > 0 && (
        <p
          className="text-xs"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Press Enter to add &middot; {MAX_TAG_LENGTH - input.length} chars remaining
        </p>
      )}
    </div>
  );
}

export default TagManager;
