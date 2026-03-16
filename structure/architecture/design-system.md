# Design System

All design tokens are defined as CSS custom properties in `src/index.css`. Theme switching is achieved by toggling a `.dark` class on `<html>`.

## Color Tokens

### Primary

| Token | Light | Dark |
|-------|-------|------|
| `--color-primary` | `#6366f1` (indigo-500) | `#818cf8` (indigo-400) |
| `--color-primary-hover` | `#4f46e5` | `#a5b4fc` |
| `--color-primary-light` | `#eef2ff` | `rgba(99, 102, 241, 0.12)` |
| `--color-primary-ring` | `rgba(99, 102, 241, 0.3)` | `rgba(129, 140, 248, 0.3)` |

### Semantic

| Token | Light | Dark |
|-------|-------|------|
| `--color-success` | `#22c55e` | `#4ade80` |
| `--color-success-light` | `#f0fdf4` | `rgba(34, 197, 94, 0.12)` |
| `--color-warning` | `#f59e0b` | `#fbbf24` |
| `--color-warning-light` | `#fffbeb` | `rgba(245, 158, 11, 0.12)` |
| `--color-danger` | `#ef4444` | `#f87171` |
| `--color-danger-light` | `#fef2f2` | `rgba(239, 68, 68, 0.12)` |

### Surfaces

| Token | Light | Dark |
|-------|-------|------|
| `--color-bg` | `#fafbfc` | `#0c0f1a` |
| `--color-surface` | `#ffffff` | `#151823` |
| `--color-surface-raised` | `#f8f9fb` | `#1c2033` |
| `--color-muted` | `#f1f5f9` | `#1e2235` |

### Borders

| Token | Light | Dark |
|-------|-------|------|
| `--color-border` | `#e2e8f0` | `#2a2f45` |
| `--color-border-light` | `#f1f5f9` | `#1e2235` |

### Text

| Token | Light | Dark |
|-------|-------|------|
| `--color-text` | `#0f172a` | `#e8ecf4` |
| `--color-text-secondary` | `#475569` | `#94a3b8` |
| `--color-text-tertiary` | `#94a3b8` | `#64748b` |

## Shadow Tokens

| Token | Light Value | Dark Adjustment |
|-------|------------|-----------------|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | Higher opacity (0.2) |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | `0.3` |
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | `0.3` + subtle primary glow |
| `--shadow-card-hover` | `0 8px 24px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)` | `0.4` + primary glow |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | `0.35` |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,0.12)` | `0.4` |
| `--shadow-xl` | `0 20px 48px rgba(0,0,0,0.16)` | `0.5` |
| `--shadow-modal` | `0 24px 64px rgba(0,0,0,0.2)` | `0.6` |
| `--shadow-focus` | `0 0 0 3px var(--color-primary-ring)` | Same |

## Border Radius Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-xs` | `4px` | Checkboxes, small elements |
| `--radius-sm` | `6px` | Badges, tags |
| `--radius-md` | `10px` | Inputs, small cards |
| `--radius-lg` | `12px` | Card containers |
| `--radius-xl` | `16px` | Modals, large cards |
| `--radius-card` | `14px` | Set cards |
| `--radius-button` | `10px` | All buttons |
| `--radius-full` | `9999px` | Circular elements, scrollbar thumbs |

## Motion Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Exit animations |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy animations |
| `--ease-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard transitions |
| `--duration-instant` | `100ms` | Immediate feedback |
| `--duration-fast` | `150ms` | Hover states |
| `--duration-normal` | `200ms` | Default transitions |
| `--duration-slow` | `300ms` | Background/color transitions |
| `--duration-slower` | `500ms` | Complex animations |

## Typography

| Token | Value |
|-------|-------|
| `--font-sans` | `'Space Grotesk', system-ui, -apple-system, sans-serif` |
| `--font-mono` | `'JetBrains Mono', ui-monospace, monospace` |

Body line-height: `1.6`. Font smoothing: antialiased on both WebKit and Mozilla.

## Global Keyframe Animations

| Name | Effect |
|------|--------|
| `fadeIn` | Opacity 0 -> 1 |
| `slideUp` | Opacity 0, translateY(8px) -> visible |
| `scaleIn` | Opacity 0, scale(0.95) -> visible |
| `shimmer` | Background gradient sweep (skeleton loading) |
| `spin` | 360deg rotation (loading spinners) |

## Accessibility

- All interactive elements get `outline: 2px solid var(--color-primary); outline-offset: 2px` on `:focus-visible`
- Reduced motion: `prefers-reduced-motion: reduce` sets all animation/transition durations to `0.01ms`
- Custom scrollbar: 6px thin scrollbars with theme-aware track/thumb colors
- `scrollbar-width: thin` for Firefox

## Button Component Variants

Defined in `src/components/ui/Button.tsx`:

| Variant | Background | Color | Border |
|---------|-----------|-------|--------|
| `primary` | `--color-primary` | white | none |
| `secondary` | `--color-muted` | `--color-text` | none |
| `outline` | transparent | `--color-text` | `1px solid --color-border` |
| `danger` | `--color-danger` | white | none |
| `ghost` | transparent | `--color-text` | none |

Sizes: `sm` (h-8), `default` (h-10), `lg` (h-12), `icon` (h-10 w-10).

All buttons use Framer Motion for `whileTap: scale(0.97)` and `whileHover: scale(1.02)`.

## Folder Colors

Defined in `src/lib/utils.ts` as `FOLDER_COLORS`:

| Key | Hex |
|-----|-----|
| blue | `#3b82f6` |
| green | `#22c55e` |
| purple | `#a855f7` |
| red | `#ef4444` |
| orange | `#f97316` |
| yellow | `#eab308` |
| pink | `#ec4899` |
| teal | `#14b8a6` |
| gray | `#6b7280` |

## ProseMirror (TipTap) Styles

- `.ProseMirror`: No outline, min-height 2rem
- Empty placeholder: First empty paragraph shows `data-placeholder` attribute as gray text
- Images: `max-width: 100%; height: auto; border-radius: var(--radius-sm)`

## Image Sizing by Context

| Context | CSS Selector | Max Size | Purpose |
|---------|-------------|----------|---------|
| Study modes | `.study-content img` | 280x200px | Full-size in flashcards, questions |
| Match tiles | `.match-tile .study-content img` | 100% width, 70px height | Contained within tile |
| Memory cards | `.memory-card-content .study-content img` | 100% width, 80px height | Fits card space |
| Editor (active) | `.editor-content img`, `.editor-content .ProseMirror img` | 80x56px | Small thumbnails while editing |
| Card preview (inactive) | `.card-preview img` | 80x56px | Small thumbnails in card list |
