# File Structure

```
not_quizlet_2/
├── index.html                          # HTML entry point, mounts #root
├── package.json                        # Dependencies, scripts (dev/build/lint/preview)
├── vite.config.ts                      # Vite config: React, Tailwind, PWA, path alias, chunk splitting
├── vercel.json                         # Vercel SPA rewrite rules
├── tsconfig.json                       # Base TS config (references app + node)
├── tsconfig.app.json                   # App TS config, path alias @/ -> ./src
├── tsconfig.node.json                  # Node TS config for vite.config.ts
├── eslint.config.js                    # ESLint 9 flat config
├── public/                             # Static assets (favicon.svg, fonts/)
│   └── fonts/
│       └── NotoSansArabic-Regular.ttf  # Arabic + Latin font for PDF generation
├── dist/                               # Build output (not committed)
├── structure/                          # This documentation
│
└── src/
    ├── main.tsx                        # React entry: StrictMode, QueryClient, BrowserRouter
    ├── App.tsx                         # Router setup, lazy page imports, AnimatePresence, auth init
    ├── index.css                       # Design tokens, dark theme, global styles, ProseMirror styles
    ├── vite-env.d.ts                   # Vite type declarations
    │
    ├── types/
    │   └── index.ts                    # All TypeScript interfaces (Card, StudySet, Folder, etc.)
    │
    ├── stores/
    │   ├── useSetStore.ts              # Study sets CRUD, search query
    │   ├── useThemeStore.ts            # Light/dark theme with localStorage persistence
    │   ├── useToastStore.ts            # Toast notification queue with auto-dismiss
    │   ├── useAuthStore.ts             # Supabase user/session, signOut, initialize
    │   ├── useFolderStore.ts           # Folders CRUD, selected folder
    │   └── useFilterStore.ts           # Card filter (all/due/new/difficult), filtered IDs
    │
    ├── db/
    │   └── index.ts                    # Dexie database: tables, indexes, CRUD helpers
    │
    ├── lib/
    │   ├── supabase.ts                 # Supabase client initialization (nullable)
    │   ├── cloudSync.ts                # Sync sets/folders to/from cloud, share link operations
    │   ├── spaced-repetition.ts        # SM-2 algorithm: recordReview, isDueForReview, getCardState
    │   ├── equivalence.ts              # Equivalence groups, multi-answer grading
    │   ├── validation.ts               # Card/set validation (empty, length, duplicates, etc.)
    │   ├── ocrParser.ts                # Parse OCR text into term-definition pairs
    │   ├── pdfGenerator.ts             # 6 PDF activity generators using jsPDF, equivalence-aware answer keys
    │   └── utils.ts                    # cn, generateId, stripHtml, shuffleArray, levenshtein, gradeAnswer, compressImage, FOLDER_COLORS
    │
    ├── hooks/
    │   └── useCommandPalette.ts        # Ctrl+K / "/" keyboard shortcut hook
    │
    ├── pages/
    │   ├── HomePage.tsx                # Main dashboard with folder sidebar + set grid
    │   ├── NewSetPage.tsx              # Create new study set with card editor
    │   ├── SetDetailPage.tsx           # Set overview, study mode picker, edit mode
    │   ├── StudyPage.tsx               # Study session router (loads correct mode component)
    │   ├── StatsPage.tsx               # Study statistics dashboard
    │   ├── FolderDetailPage.tsx        # View sets within a folder, share folder
    │   ├── SharedSetPage.tsx           # Read-only shared set view (no auth)
    │   ├── SharedStudyPage.tsx         # Study modes for shared sets
    │   ├── SharedFolderPage.tsx        # Read-only shared folder view (no auth)
    │   ├── SharedFolderStudyPage.tsx   # Study modes for sets in shared folders
    │   └── auth/
    │       ├── SignInPage.tsx           # Email/password login with lockout check
    │       ├── SignUpPage.tsx           # Registration with password strength meter
    │       ├── ForgotPasswordPage.tsx   # Request password reset email
    │       ├── ResetPasswordPage.tsx    # Set new password from reset link
    │       └── AccountSettingsPage.tsx  # Account management
    │   └── live/
    │       ├── LiveJoinPage.tsx         # Join a live multiplayer session
    │       ├── LiveHostPage.tsx         # Host a live session
    │       └── LivePlayPage.tsx         # Play in live session
    │
    └── components/
        ├── CardList.tsx                # Virtualized sortable card list (DnD + @tanstack/react-virtual)
        ├── EditableCard.tsx            # Single card row: drag handle, number, term/def editors, delete
        ├── TipTapEditor.tsx            # Rich text editor: bold, italic, strike, highlight, image, undo/redo
        ├── CommandPalette.tsx          # cmdk-based search: quick actions + fuzzy set search
        ├── FolderSidebar.tsx           # Recursive folder tree with color-coded icons
        ├── MoveToFolderModal.tsx       # Modal to move a set into a folder
        ├── PhotoImportModal.tsx        # 3-step OCR workflow: upload -> process -> preview/edit
        ├── PrintDialog.tsx             # PDF activity picker (gradient grid) + test config sub-view
        ├── GameBrowserModal.tsx        # Game mode selector grid (Spinner, Block Builder, Memory, Race)
        ├── SetCard.tsx                 # Set preview card for grid views
        ├── StudyContent.tsx            # Safe HTML renderer for study mode content
        ├── TagManager.tsx              # Tag input/management for sets
        ├── PasswordStrengthMeter.tsx   # Password requirements checklist with strength bar
        │
        ├── layout/
        │   ├── Layout.tsx              # App shell: sticky header, nav, theme toggle, auth, mobile menu
        │   └── PageTransition.tsx      # Framer Motion page enter/exit animations
        │
        ├── RequireAuth.tsx            # Route guard: redirects to /signin if not authenticated
        │
        ├── modes/
        │   ├── FlashcardMode.tsx       # Simple flashcards with flip + prev/next navigation
        │   ├── LearnMode.tsx           # Mixed question types (MC, written, T/F) with SR
        │   ├── MatchMode.tsx           # Drag-and-drop tile-matching game with confetti
        │   ├── TestMode.tsx            # Configurable test with results and missed-card review
        │   └── games/
        │       ├── SpinnerMode.tsx     # SVG spinner wheel game
        │       ├── BlockBuilderMode.tsx # Tower-building game with rising lava
        │       ├── MemoryCardFlipMode.tsx # Classic memory/concentration card game
        │       └── RaceToFinishMode.tsx # Board game race with dice, shortcuts, multiplayer
        │
        └── ui/
            ├── Button.tsx              # Framer Motion button with 5 variants, 4 sizes
            ├── Card.tsx                # Generic card container
            ├── Input.tsx               # Styled input with label
            ├── Modal.tsx               # Animated modal with backdrop
            ├── Badge.tsx               # Status badge component
            ├── Skeleton.tsx            # Loading skeleton
            ├── Spinner.tsx             # Loading spinner
            └── Toast.tsx               # Toast notification container + individual toast
```
