import { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Card } from '@/types';
import { EditableCard } from '@/components/EditableCard';

interface CardListProps {
  cards: Card[];
  onUpdateCard: (id: string, field: 'term' | 'definition', value: string) => void;
  onDeleteCard: (id: string) => void;
  onReorderCards: (cards: Card[]) => void;
  excludedCardIds?: Set<string>;
}

const VIRTUALIZATION_THRESHOLD = 20;
const ESTIMATED_CARD_HEIGHT = 120;

export function CardList({
  cards,
  onUpdateCard,
  onDeleteCard,
  onReorderCards,
  excludedCardIds,
}: CardListProps) {
  const [activeCardId, setActiveCardId] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = cards.findIndex((c) => c.id === active.id);
      const newIndex = cards.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = [...cards];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      onReorderCards(reordered);
    },
    [cards, onReorderCards],
  );

  const handleActivate = useCallback((id: string) => {
    setActiveCardId(id);
  }, []);

  const useVirtual = cards.length > VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 3,
    enabled: useVirtual,
  });

  const cardIds = cards.map((c) => c.id);

  if (useVirtual) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <div
            ref={parentRef}
            className="overflow-auto"
            style={{ maxHeight: '70vh' }}
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const card = cards[virtualItem.index];
                return (
                  <div
                    key={card.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                  >
                    <div className="pb-3">
                      <EditableCard
                        card={card}
                        index={virtualItem.index}
                        isActive={activeCardId === card.id}
                        dimmed={excludedCardIds?.has(card.id) ?? false}
                        onActivate={handleActivate}
                        onUpdate={onUpdateCard}
                        onDelete={onDeleteCard}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3">
          {cards.map((card, i) => (
            <EditableCard
              key={card.id}
              card={card}
              index={i}
              isActive={activeCardId === card.id}
              dimmed={excludedCardIds?.has(card.id) ?? false}
              onActivate={handleActivate}
              onUpdate={onUpdateCard}
              onDelete={onDeleteCard}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
