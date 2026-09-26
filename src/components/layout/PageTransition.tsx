import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

/** Enter animation for every page. Plain CSS so the first paint of any
 *  route doesn't wait on the animation library. */
function PageTransition({ children }: PageTransitionProps) {
  return <div className="sf-page-enter">{children}</div>;
}

export default PageTransition;
