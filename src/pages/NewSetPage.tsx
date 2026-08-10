import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageTransition from '@/components/layout/PageTransition';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useSetStore } from '@/stores/useSetStore';
import { generateId } from '@/lib/utils';
import type { StudySet } from '@/types';

function NewSetPage() {
  const navigate = useNavigate();
  const addSet = useSetStore((s) => s.addSet);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [titleError, setTitleError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;

      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setTitleError('Title is required');
        return;
      }

      const now = Date.now();
      const id = generateId();
      const newSet: StudySet = {
        id,
        title: trimmedTitle,
        description: description.trim(),
        createdAt: now,
        updatedAt: now,
        tags: [],
        cards: [],
        lastStudied: 0,
        studyStats: {
          totalSessions: 0,
          averageAccuracy: 0,
          streakDays: 0,
        },
        visibility: 'private',
      };

      setSubmitting(true);
      setSubmitError('');
      try {
        await addSet(newSet);
        navigate(`/sets/${id}`);
      } catch (err) {
        console.error('Failed to create set', err);
        setSubmitError('Failed to create set. Please try again.');
        setSubmitting(false);
      }
    },
    [title, description, addSet, navigate, submitting],
  );

  return (
    <PageTransition>
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1
          className="text-2xl font-bold mb-6"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}
        >
          Create New Set
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Title"
            placeholder="Enter a title for your study set"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError('');
            }}
            error={titleError}
            autoFocus
          />

          <Input
            label="Description"
            placeholder="Add a description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {submitError && (
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
              {submitError}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Set'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(-1)}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </PageTransition>
  );
}

export default NewSetPage;
