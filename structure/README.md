# StudyFlow Documentation

Complete documentation for the StudyFlow flashcard and study application.

## Contents

### Architecture
- [overview.md](architecture/overview.md) - High-level architecture and tech stack
- [file-structure.md](architecture/file-structure.md) - Project file organization
- [design-system.md](architecture/design-system.md) - CSS tokens, theming, typography
- [state-management.md](architecture/state-management.md) - Zustand stores and data flow

### Features
- [study-modes.md](features/study-modes.md) - All study and game modes
- [card-editor.md](features/card-editor.md) - TipTap editor, card management
- [authentication.md](features/authentication.md) - Auth flow, security
- [folders.md](features/folders.md) - Folder organization system
- [command-palette.md](features/command-palette.md) - Quick navigation
- [ocr-import.md](features/ocr-import.md) - Photo import via OCR
- [pdf-generation.md](features/pdf-generation.md) - Printable worksheet generation

### Data
- [data-models.md](data/data-models.md) - TypeScript types and data shapes
- [local-database.md](data/local-database.md) - IndexedDB via Dexie
- [cloud-sync.md](data/cloud-sync.md) - Supabase integration
- [supabase-schema.md](data/supabase-schema.md) - Database tables and RLS

### Performance
- [optimization.md](performance/optimization.md) - Performance strategies
- [bundle-analysis.md](performance/bundle-analysis.md) - Code splitting approach

### Deployment
- [deployment.md](deployment/deployment.md) - Vercel deployment, env vars, PWA
