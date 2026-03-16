import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Settings, CheckCircle } from 'lucide-react';
import PageTransition from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function AccountSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (!user && !useAuthStore.getState().loading) {
      navigate('/signin');
    }
  }, [user, navigate]);

  function getConfirmError(): string {
    if (confirmPassword && confirmPassword !== newPassword) {
      return 'Passwords do not match.';
    }
    return '';
  }

  function resetForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!isSupabaseConfigured() || !supabase || !user) {
      setError('Cloud features require Supabase to be configured.');
      return;
    }

    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // Verify current password by attempting sign-in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: currentPassword,
      });

      if (signInError) {
        setError('Current password is incorrect.');
        setLoading(false);
        return;
      }

      // Check password reuse if RPC is available
      try {
        const { data: reuseData } = await supabase.rpc('check_password_reuse', {
          p_password: newPassword,
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
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      addToast('success', 'Password updated successfully!');
      resetForm();
      setSuccess(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return null;
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
              <Settings size={24} />
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--color-text)' }}
            >
              Account Settings
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Change your password.
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
              Cloud features require Supabase to be configured.
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

              {success && (
                <div
                  className="p-3 rounded-lg text-sm flex items-center gap-2"
                  style={{
                    background: 'color-mix(in srgb, #22c55e 10%, transparent)',
                    color: '#22c55e',
                  }}
                >
                  <CheckCircle size={16} />
                  Password updated successfully!
                </div>
              )}

              <div className="relative">
                <Input
                  label="Current Password"
                  type={showCurrent ? 'text' : 'password'}
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-[38px] cursor-pointer"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  tabIndex={-1}
                  aria-label={showCurrent ? 'Hide password' : 'Show password'}
                >
                  {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="relative">
                <Input
                  label="New Password"
                  type={showNew ? 'text' : 'password'}
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-[38px] cursor-pointer"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  tabIndex={-1}
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <PasswordStrengthMeter password={newPassword} />

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
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
