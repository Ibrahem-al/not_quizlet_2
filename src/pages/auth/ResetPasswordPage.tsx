import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, CheckCircle } from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { useToastStore } from '@/stores/useToastStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (!success) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/signin');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [success, navigate]);

  function getConfirmError(): string {
    if (confirmPassword && confirmPassword !== password) {
      return 'Passwords do not match.';
    }
    return '';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!isSupabaseConfigured() || !supabase) {
      setError('Cloud features require Supabase to be configured.');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // Check password reuse if RPC is available
      try {
        const { data: reuseData } = await supabase.rpc('check_password_reuse', {
          p_password: password,
        });
        if (reuseData?.reused) {
          setError('This password has been used recently. Please choose a different password.');
          setLoading(false);
          return;
        }
      } catch {
        // RPC not available, skip reuse check
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      addToast('success', 'Password reset successfully!');
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
              <ShieldCheck size={24} />
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--color-text)' }}
            >
              Reset Password
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Enter your new password below.
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
                <CheckCircle size={32} style={{ color: '#22c55e' }} />
              </div>
              <h2
                className="text-lg font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                Password Updated
              </h2>
              <p
                className="text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Your password has been reset successfully. Redirecting to sign in
                in {countdown} second{countdown !== 1 ? 's' : ''}...
              </p>
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

              <div className="relative">
                <Input
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
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

              <PasswordStrengthMeter password={password} />

              <div className="relative">
                <Input
                  label="Confirm New Password"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  error={getConfirmError()}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-[38px] cursor-pointer"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  tabIndex={-1}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <Button type="submit" disabled={loading} className="w-full mt-2">
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
