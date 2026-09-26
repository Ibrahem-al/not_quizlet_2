import { lazyWithPreload } from '@/lib/lazyWithPreload';

// Route-level code splitting. Pages are exported with a preload() handle so
// links can fetch the next screen on hover/focus, before the click.

export const HomePage = lazyWithPreload(() => import('@/pages/HomePage'));
export const NewSetPage = lazyWithPreload(() => import('@/pages/NewSetPage'));
export const SetDetailPage = lazyWithPreload(() => import('@/pages/SetDetailPage'));
export const StudyPage = lazyWithPreload(() => import('@/pages/StudyPage'));
export const StatsPage = lazyWithPreload(() => import('@/pages/StatsPage'));
export const FolderDetailPage = lazyWithPreload(() => import('@/pages/FolderDetailPage'));
export const SignInPage = lazyWithPreload(() => import('@/pages/auth/SignInPage'));
export const SignUpPage = lazyWithPreload(() => import('@/pages/auth/SignUpPage'));
export const ForgotPasswordPage = lazyWithPreload(() => import('@/pages/auth/ForgotPasswordPage'));
export const ResetPasswordPage = lazyWithPreload(() => import('@/pages/auth/ResetPasswordPage'));
export const AccountSettingsPage = lazyWithPreload(() => import('@/pages/auth/AccountSettingsPage'));
export const SharedSetPage = lazyWithPreload(() => import('@/pages/SharedSetPage'));
export const SharedStudyPage = lazyWithPreload(() => import('@/pages/SharedStudyPage'));
export const SharedFolderPage = lazyWithPreload(() => import('@/pages/SharedFolderPage'));
export const SharedFolderStudyPage = lazyWithPreload(() => import('@/pages/SharedFolderStudyPage'));
export const LiveJoinPage = lazyWithPreload(() => import('@/pages/live/LiveJoinPage'));
export const LiveHostPage = lazyWithPreload(() => import('@/pages/live/LiveHostPage'));
export const LivePlayPage = lazyWithPreload(() => import('@/pages/live/LivePlayPage'));
export const NotFoundPage = lazyWithPreload(() => import('@/pages/NotFoundPage'));
