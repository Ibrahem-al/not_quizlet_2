import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Mail, ArrowLeft } from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToastStore } from '@/stores/useToastStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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
      // Check rate limiting if RPC is available
      try {
        const { data: rateLimitData } = await supabase.rpc('check_password_reset_rate_limit', {
          p_email: email,
        });
        if (rateLimitData?.limited) {
          setError('Too many reset requests. Please try again later.');
          setLoading(false);
          return;
        }
      } catch {
        // RPC not available, skip rate limiting check
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccess(true);
      addToast('success', 'Password reset email sent!');
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
              <KeyRound size={24} />
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--color-text)' }}
            >
              Forgot Password
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Enter your email and we&apos;ll send you a reset link.
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
              Cloud features require Supabase to be configured. Set{' '}
              <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in your
              environment to enable them.
            </div>
          ) : success ? (
            <div className="text-center flex flex-col items-center gap-4">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full"
                style={{ background: 'color-mix(in srgb, #22c55e 15%, transparent)' }}
              >
                <Mail size={32} style={{ color: '#22c55e' }} />
              </div>
              <h2
                className="text-lg font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                Check Your Email
              </h2>
              <p
                className="text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                If an account exists for <strong>{email}</strong>, you&apos;ll
                receive a password reset link shortly.
              </p>
              <Link
                to="/signin"
                className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                style={{ color: 'var(--color-primary)' }}
              >
                <ArrowLeft size={16} />
                Back to Sign In
              </Link>
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

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>

              <Link
                to="/signin"
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium hover:underline"
                style={{ color: 'var(--color-primary)' }}
              >
                <ArrowLeft size={16} />
                Back to Sign In
              </Link>
            </form>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
