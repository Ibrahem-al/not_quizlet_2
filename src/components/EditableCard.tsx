import { memo, useCallback, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, AlertCircle } from 'lucide-react';
import type { Card } from '@/types';
import { cn, hasTextContent, isImageOnly } from '@/lib/utils';
import { TipTapEditor } from '@/components/TipTapEditor';

interface EditableCardProps {
  card: Card;
  index: number;
  isActive: boolean;
  onActivate: (id: string) => void;
  onUpdate: (id: string, field: 'term' | 'definition', value: string) => void;
  onDelete: (id: string) => void;
}

function hasCardContent(content: string): boolean {
  return hasTextContent(content) || isImageOnly(content);
}

const EditableCard = memo(
  function EditableCard({
    card,
    index,
    isActive,
    onActivate,
    onUpdate,
    onDelete,
  }: EditableCardProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: card.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const handleClickOutside = useCallback(
      (e: MouseEvent) => {
        if (
          isActive &&
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          onActivate('');
        }
      },
      [isActive, onActivate],
    );

    useEffect(() => {
      if (isActive) {
        document.addEventListener('mousedown', handleClickOutside);
        return () =>
          document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isActive, handleClickOutside]);

    const handleDelete = useCallback(() => {
      if (window.confirm('Delete this card?')) {
        onDelete(card.id);
      }
    }, [card.id, onDelete]);

    const handleTermUpdate = useCallback(
      (html: string) => onUpdate(card.id, 'term', html),
      [card.id, onUpdate],
    );

    const handleDefUpdate = useCallback(
      (html: string) => onUpdate(card.id, 'definition', html),
      [card.id, onUpdate],
    );

    const termEmpty = !hasCardContent(card.term);
    const defEmpty = !hasCardContent(card.definition);

    return (
      <div
        ref={(node) => {
          setNodeRef(node);
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={{
          ...style,
          background: 'var(--color-surface)',
          border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-lg)',
        }}
        className={cn(
          'flex items-stretch gap-0 transition-shadow',
          isActive && 'shadow-lg',
        )}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-center w-10 shrink-0 cursor-grab active:cursor-grabbing rounded-l-lg"
          style={{ color: 'var(--color-text-tertiary)' }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} />
        </div>

        {/* Card number */}
        <div
          className="flex items-center justify-center w-8 shrink-0 text-sm font-medium"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {index + 1}
        </div>

        {/* Content area */}
        <div
          className="flex-1 grid grid-cols-2 gap-0 min-h-[80px]"
          onClick={() => {
            if (!isActive) onActivate(card.id);
          }}
        >
          {/* Term */}
          <div
            className="border-r px-3 py-2"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="text-xs font-medium mb-1 uppercase tracking-wide"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Term
            </div>
            {isActive ? (
              <TipTapEditor
                content={card.term}
                onUpdate={handleTermUpdate}
                placeholder="Enter term"
              />
            ) : (
              <div
                className="prose prose-sm max-w-none min-h-[40px] cursor-pointer"
                style={{
                  color: termEmpty
                    ? 'var(--color-text-tertiary)'
                    : 'var(--color-text)',
                  fontFamily: 'var(--font-sans)',
                }}
                dangerouslySetInnerHTML={{
                  __html: termEmpty ? '<p>Click to edit term</p>' : card.term,
                }}
              />
            )}
            {termEmpty && isActive && (
              <div
                className="flex items-center gap-1 mt-1 text-xs"
                style={{ color: 'var(--color-danger)' }}
              >
                <AlertCircle size={12} />
                Term is required
              </div>
            )}
          </div>

          {/* Definition */}
          <div className="px-3 py-2">
            <div
              className="text-xs font-medium mb-1 uppercase tracking-wide"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              Definition
            </div>
            {isActive ? (
              <TipTapEditor
                content={card.definition}
                onUpdate={handleDefUpdate}
                placeholder="Enter definition"
              />
            ) : (
              <div
                className="prose prose-sm max-w-none min-h-[40px] cursor-pointer"
                style={{
                  color: defEmpty
                    ? 'var(--color-text-tertiary)'
                    : 'var(--color-text)',
                  fontFamily: 'var(--font-sans)',
                }}
                dangerouslySetInnerHTML={{
                  __html: defEmpty
                    ? '<p>Click to edit definition</p>'
                    : card.definition,
                }}
              />
            )}
            {defEmpty && isActive && (
              <div
                className="flex items-center gap-1 mt-1 text-xs"
                style={{ color: 'var(--color-danger)' }}
              >
                <AlertCircle size={12} />
                Definition is required
              </div>
            )}
          </div>
        </div>

        {/* Delete button */}
        <div className="flex items-center justify-center w-10 shrink-0">
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-colors"
            style={{
              color: 'var(--color-text-tertiary)',
              background: 'transparent',
              border: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-danger)';
              e.currentTarget.style.background = 'var(--color-danger-light)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
              e.currentTarget.style.background = 'transparent';
            }}
            title="Delete card"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.card.id === next.card.id &&
    prev.card.term === next.card.term &&
    prev.card.definition === next.card.definition &&
    prev.index === next.index &&
    prev.isActive === next.isActive,
);

export { EditableCard };
