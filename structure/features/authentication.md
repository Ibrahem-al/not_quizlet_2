# Authentication

## Overview

Authentication is entirely optional and powered by Supabase. When Supabase environment variables are not configured, all auth-related UI gracefully degrades with an informational message.

## Environment Requirements

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Without these, `supabase` client is `null` and `isSupabaseConfigured()` returns `false`.

## Auth Pages

### Sign In (`/signin`)
**File:** `src/pages/auth/SignInPage.tsx`

1. Email and password fields with show/hide toggle
2. Pre-login lockout check via `supabase.rpc('check_account_lockout', { p_email })`
3. On failure: records failed attempt via `supabase.rpc('record_failed_login', { p_email })`
4. On success: calls `useAuthStore.setUser(user, session)`, shows success toast, navigates to `/`
5. Link to Forgot Password page

### Sign Up (`/signup`)
**File:** `src/pages/auth/SignUpPage.tsx`

1. Email and password fields
2. `PasswordStrengthMeter` component shows requirements in real-time
3. Calls `supabase.auth.signUp({ email, password })`

### Forgot Password (`/forgot-password`)
**File:** `src/pages/auth/ForgotPasswordPage.tsx`

Sends password reset email via Supabase auth.

### Reset Password (`/reset-password`)
**File:** `src/pages/auth/ResetPasswordPage.tsx`

Handles the password reset confirmation from email link.

### Account Settings (`/account/settings`)
**File:** `src/pages/auth/AccountSettingsPage.tsx`

Account management for authenticated users.

## Password Strength Meter

**File:** `src/components/PasswordStrengthMeter.tsx`

### Requirements (5 total)
| Requirement | Rule |
|-------------|------|
| Length | At least 12 characters |
| Uppercase | Contains `[A-Z]` |
| Lowercase | Contains `[a-z]` |
| Digit | Contains `\d` |
| Special | Contains `[^A-Za-z0-9]` |

### Strength Levels
| Score (met count) | Label | Color |
|-------------------|-------|-------|
| 0-1 | Weak | `--color-danger` (red) |
| 2 | Fair | `#eab308` (yellow) |
| 3-4 | Good | `#f97316` (orange) |
| 5 | Strong | `#22c55e` (green) |

Visual: progress bar (width = score/5 * 100%) + checklist with green checks / gray X marks.

## Auth Store

**File:** `src/stores/useAuthStore.ts`

State: `user: User | null`, `session: Session | null`, `loading: boolean`

Actions:
- `initialize()` - Called on app mount, fetches current session
- `setUser(user, session)` - Updates state after login
- `signOut()` - Calls Supabase signOut and clears state

## Security Features

1. **Account lockout**: RPC-based brute force protection via `check_account_lockout` and `record_failed_login` stored procedures (requires Supabase database setup)
2. **Password strength enforcement**: Client-side 5-requirement meter
3. **Session management**: Supabase handles JWT tokens and refresh
4. **Graceful degradation**: App fully functional without auth; cloud features simply hidden

## Auth-Dependent Features

When authenticated:
- Cloud sync of study sets
- Set visibility toggle (private/public)
- Account settings
- Live multiplayer sessions

When not authenticated:
- All local features work (create sets, study, folders, PDF export, OCR import)
- Sign In button shown in header
