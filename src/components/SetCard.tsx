import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import type { StudySet } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface SetCardProps {
  set: StudySet;
  onDelete: (id: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  return 'just now';
}

function SetCard({ set, onDelete }: SetCardProps) {
  const navigate = useNavigate();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleClick = useCallback(() => {
    navigate(`/sets/${set.id}`);
  }, [navigate, set.id]);

  const handleDelete = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setShowDeleteModal(true);
    },
    [],
  );

  const confirmDelete = useCallback(() => {
    onDelete(set.id);
    setShowDeleteModal(false);
  }, [onDelete, set.id]);

  return (
    <>
      <motion.div layoutId={set.id}>
        <Card hover onClick={handleClick} className="relative group">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="text-base font-semibold truncate"
              style={{ color: 'var(--color-text)' }}
            >
              {set.title}
            </h3>
            <button
              onClick={handleDelete}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded cursor-pointer"
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
              aria-label="Delete set"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {set.description && (
            <p
              className="mt-1 text-sm line-clamp-2"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {set.description}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {set.cards.length} {set.cards.length === 1 ? 'card' : 'cards'}
            </span>
            {set.lastStudied > 0 && (
              <span
                className="text-xs"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                &middot; Studied {formatRelativeTime(set.lastStudied)}
              </span>
            )}
          </div>

          {set.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {set.tags.slice(0, 4).map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
              {set.tags.length > 4 && (
                <Badge>+{set.tags.length - 4}</Badge>
              )}
            </div>
          )}
        </Card>
      </motion.div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Set"
        danger
        size="sm"
      >
        <p
          className="text-sm mb-4"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Are you sure you want to delete &quot;{set.title}&quot;? This action
          cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={confirmDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default React.memo(SetCard, (prev, next) => {
  return (
    prev.set.id === next.set.id &&
    prev.set.updatedAt === next.set.updatedAt &&
    prev.set.title === next.set.title &&
    prev.set.cards.length === next.set.cards.length
  );
});
