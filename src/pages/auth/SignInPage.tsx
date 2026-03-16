import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string })?.returnTo || '/';
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useToastStore((s) => s.addToast);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!isSupabaseConfigured() || !supabase) {
      setError('Cloud features require Supabase to be configured.');
      return;
    }

    setLoading(true);

    try {
      // Check account lockout if RPC is available
      try {
        const { data: lockoutData } = await supabase.rpc('check_account_lockout', {
          p_email: email,
        });
        if (lockoutData?.locked) {
          setError('Account is temporarily locked due to too many failed attempts. Please try again later.');
          setLoading(false);
          return;
        }
      } catch {
        // RPC not available, skip lockout check
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // Record failed login attempt if RPC is available
        try {
          await supabase.rpc('record_failed_login', { p_email: email });
        } catch {
          // RPC not available, skip
        }
        setError(signInError.message);
        return;
      }

      if (data.user && data.session) {
        setUser(data.user, data.session);
        addToast('success', 'Signed in successfully!');
        navigate(returnTo, { replace: true });
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageTransition>
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div
          className="w-full max-w-md p-8 rounded-xl"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.1))',
          }}
        >
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
              style={{ background: 'var(--color-primary)', color: '#ffffff' }}
            >
              <LogIn size={24} />
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--color-text)' }}
            >
              Sign In
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Welcome back! Sign in to your account.
            </p>
          </div>

          {!isSupabaseConfigured() ? (
            <div
              className="text-center p-4 rounded-lg text-sm"
              style={{
                background: 'var(--color-muted)',
                color: 'var(--color-text-secondary)',
              }}
            >
              Cloud features (sign in, sync, multiplayer) require Supabase to be
              configured. Set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in your
              environment to enable them.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div
                  className="p-3 rounded-lg text-sm"
                  style={{
                    background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
                    color: 'var(--color-danger)',
                  }}
                >
                  {error}
                </div>
              )}

              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[38px] cursor-pointer"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm hover:underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Forgot Password?
                </Link>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>

              <p
                className="text-center text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Don&apos;t have an account?{' '}
                <Link
                  to="/signup"
                  className="font-medium hover:underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Sign Up
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
