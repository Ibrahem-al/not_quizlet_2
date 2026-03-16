import { Users } from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';

export default function LiveJoinPage() {
  return (
    <PageTransition>
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div
          className="w-full max-w-md p-8 rounded-xl text-center"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.1))',
          }}
        >
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{ background: 'var(--color-muted)', color: 'var(--color-text-secondary)' }}
          >
            <Users size={32} />
          </div>
          <h1
            className="text-2xl font-bold mb-2"
            style={{ color: 'var(--color-text)' }}
          >
            Join Live Game
          </h1>
          <p
            className="text-sm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Live multiplayer coming soon. Stay tuned!
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
