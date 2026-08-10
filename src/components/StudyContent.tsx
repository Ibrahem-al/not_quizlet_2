import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize';

interface StudyContentProps {
  html: string;
  className?: string;
}

function StudyContentInner({ html, className }: StudyContentProps) {
  const safeHtml = useMemo(() => sanitizeHtml(html), [html]);
  return (
    <div
      className={cn('study-content', className)}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

const StudyContent = memo(StudyContentInner);
export default StudyContent;
