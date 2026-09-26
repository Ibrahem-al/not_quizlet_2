import { Routes, Route, useLocation } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import RequireAuth from '@/components/RequireAuth';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Spinner } from '@/components/ui/Spinner';
import { ToastContainer } from '@/components/ui/Toast';
import { useThemeStore } from '@/stores/useThemeStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { startCloudBootstrap } from '@/lib/cloudBootstrap';
import { whenIdle } from '@/lib/lazyWithPreload';
import {
  HomePage,
  NewSetPage,
  SetDetailPage,
  StudyPage,
  StatsPage,
  FolderDetailPage,
  SignInPage,
  SignUpPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  AccountSettingsPage,
  SharedSetPage,
  SharedStudyPage,
  SharedFolderPage,
  SharedFolderStudyPage,
  LiveJoinPage,
  LiveHostPage,
  LivePlayPage,
  NotFoundPage,
} from '@/routes';

/** Same flag migrateOversizedImages() sets in cloudSync.ts. */
const IMAGE_MIGRATION_KEY = 'studyflow_images_migrated';

function App() {
  const location = useLocation();

  useEffect(() => {
    useThemeStore.getState();
    useAuthStore.getState().initialize();
    const stopCloudBootstrap = startCloudBootstrap();

    // One-time migration: compress oversized inline images. Checked before
    // importing so the sync module stays off the startup path, and run when
    // idle so it never competes with the first render.
    let migrated = true;
    try {
      migrated = localStorage.getItem(IMAGE_MIGRATION_KEY) !== null;
    } catch {
      // storage unavailable — skip the migration
    }
    if (!migrated) {
      whenIdle(() => {
        void import('@/lib/cloudSync').then((m) => m.migrateOversizedImages());
      });
    }

    return stopCloudBootstrap;
  }, []);

  return (
    <>
      <ErrorBoundary>
        {/* Suspense sits inside Layout so the header stays mounted while a
            page chunk loads, and there is no exit animation to wait out:
            the next page's chunk starts downloading on the click itself. */}
        <Layout>
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <Spinner size="lg" />
              </div>
            }
          >
            {/* Keyed by pathname: pages keep per-visit working state (e.g. the
                set editor's local copy) and must remount between items. */}
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
              <Route path="/shared/folder/:token" element={<SharedFolderPage />} />
              <Route path="/shared/folder/:token/set/:setId/study/:mode" element={<SharedFolderStudyPage />} />
              <Route path="/live" element={<LiveJoinPage />} />
              <Route path="/live/host/:sessionId" element={<LiveHostPage />} />
              <Route path="/live/play" element={<LivePlayPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </Layout>
      </ErrorBoundary>
      <ToastContainer />
    </>
  );
}

export default App;
