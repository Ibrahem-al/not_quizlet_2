import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Zap, Sun, Moon, Menu, X, LogOut } from 'lucide-react';
import { useThemeStore } from '@/stores/useThemeStore';
import { useAuthStore } from '@/stores/useAuthStore';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  const { theme, toggleTheme } = useThemeStore();
  const { user, signOut } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${
      isActive
        ? 'opacity-100'
        : 'opacity-60 hover:opacity-100'
    }`;

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between h-16 px-4 md:px-6"
        style={{
          background: 'color-mix(in srgb, var(--color-bg) 80%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <Zap
              size={22}
              style={{ color: 'var(--color-primary)' }}
              strokeWidth={2.5}
            />
            <span
              className="text-lg font-bold"
              style={{
                fontFamily: "'Space Grotesk', var(--font-sans)",
                color: 'var(--color-text)',
              }}
            >
              StudyFlow
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-4">
            <NavLink to="/" end className={navLinkClass} style={{ color: 'var(--color-text)' }}>
              Your Sets
            </NavLink>
          </nav>
        </div>

        {/* Right: Theme toggle + Auth + Mobile menu */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-muted)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {/* Auth button - desktop */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <>
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold"
                  style={{
                    background: 'var(--color-primary)',
                    color: 'white',
                  }}
                >
                  {user.email?.charAt(0).toUpperCase() ?? 'U'}
                </div>
                <button
                  onClick={() => signOut()}
                  className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-muted)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  aria-label="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Link
                to="/signin"
                className="text-sm font-medium px-4 py-2 rounded-lg no-underline transition-colors"
                style={{
                  background: 'var(--color-primary)',
                  color: 'white',
                }}
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex md:hidden items-center justify-center w-9 h-9 rounded-lg cursor-pointer"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
            }}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile slide-out nav */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.4)' }}
          />
          <nav
            className="absolute top-16 right-0 w-64 h-[calc(100vh-64px)] flex flex-col gap-2 p-4"
            style={{
              background: 'var(--color-surface)',
              borderLeft: '1px solid var(--color-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <NavLink
              to="/"
              end
              className={navLinkClass}
              style={{ color: 'var(--color-text)', padding: '8px 0' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              Your Sets
            </NavLink>
            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '8px 0' }} />
            {user ? (
              <button
                onClick={() => {
                  signOut();
                  setMobileMenuOpen(false);
                }}
                className="text-sm font-medium text-left cursor-pointer"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  padding: '8px 0',
                }}
              >
                Sign Out
              </button>
            ) : (
              <Link
                to="/signin"
                className="text-sm font-medium no-underline"
                style={{ color: 'var(--color-primary)', padding: '8px 0' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      )}

      {/* Content */}
      <main className="px-4 md:px-6 py-6">
        {children}
      </main>
    </div>
  );
}

export default Layout;
