import { memo } from 'react';
import { cn } from '@/lib/utils';

interface StudyContentProps {
  html: string;
  className?: string;
}

function StudyContentInner({ html, className }: StudyContentProps) {
  return (
    <div
      className={cn('study-content', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const StudyContent = memo(StudyContentInner);
export default StudyContent;
