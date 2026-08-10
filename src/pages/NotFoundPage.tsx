import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';

function NotFoundPage() {
  return (
    <PageTransition>
      <div className="flex flex-col items-center justify-center text-center px-6 py-24 gap-5">
        <p
          className="font-bold leading-none"
          style={{
            fontSize: 'clamp(4rem, 18vw, 8rem)',
            color: 'var(--color-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          404
        </p>

        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
          Page not found
        </h1>

        <p
          className="text-sm max-w-sm"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          The page you’re looking for doesn’t exist or may have been moved. Check
          the address or head back home.
        </p>

        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 h-10 px-5 font-medium transition-colors mt-1"
          style={{
            background: 'var(--color-primary)',
            color: '#ffffff',
            borderRadius: 'var(--radius-button)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <Home size={16} />
          Back to Home
        </Link>
      </div>
    </PageTransition>
  );
}

export default NotFoundPage;
