import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { lazy, Suspense, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import RequireAuth from '@/components/RequireAuth';
import { Spinner } from '@/components/ui/Spinner';
import { ToastContainer } from '@/components/ui/Toast';
import { useThemeStore } from '@/stores/useThemeStore';
import { useAuthStore } from '@/stores/useAuthStore';

const HomePage = lazy(() => import('@/pages/HomePage'));
const NewSetPage = lazy(() => import('@/pages/NewSetPage'));
const SetDetailPage = lazy(() => import('@/pages/SetDetailPage'));
const StudyPage = lazy(() => import('@/pages/StudyPage'));
const StatsPage = lazy(() => import('@/pages/StatsPage'));
const FolderDetailPage = lazy(() => import('@/pages/FolderDetailPage'));
const SignInPage = lazy(() => import('@/pages/auth/SignInPage'));
const SignUpPage = lazy(() => import('@/pages/auth/SignUpPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const AccountSettingsPage = lazy(() => import('@/pages/auth/AccountSettingsPage'));
const SharedSetPage = lazy(() => import('@/pages/SharedSetPage'));
const SharedStudyPage = lazy(() => import('@/pages/SharedStudyPage'));
const LiveJoinPage = lazy(() => import('@/pages/live/LiveJoinPage'));
const LiveHostPage = lazy(() => import('@/pages/live/LiveHostPage'));
const LivePlayPage = lazy(() => import('@/pages/live/LivePlayPage'));

function App() {
  const location = useLocation();

  useEffect(() => {
    useThemeStore.getState();
    useAuthStore.getState().initialize();
  }, []);

  return (
    <>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <Spinner size="lg" />
          </div>
        }
      >
        <Layout>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<HomePage />} />
              <Route path="/sets/new" element={<RequireAuth><NewSetPage /></RequireAuth>} />
              <Route path="/sets/:id" element={<SetDetailPage />} />
              <Route path="/sets/:id/study/:mode" element={<StudyPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/folders/:id" element={<FolderDetailPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/account/settings" element={<AccountSettingsPage />} />
              <Route path="/shared/:token" element={<SharedSetPage />} />
              <Route path="/shared/:token/study/:mode" element={<SharedStudyPage />} />
              <Route path="/live" element={<LiveJoinPage />} />
              <Route path="/live/host/:sessionId" element={<LiveHostPage />} />
              <Route path="/live/play" element={<LivePlayPage />} />
            </Routes>
          </AnimatePresence>
        </Layout>
      </Suspense>
      <ToastContainer />
    </>
  );
}

export default App;
