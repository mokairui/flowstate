# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowState is a local-first, offline-capable todo capture app for developers and knowledge workers. It uses a glassmorphism UI (Style B · Raycast-inspired) with a Command Palette–style quick capture overlay. All data is persisted locally via IndexedDB (Dexie). AI task processing is fully implemented via OpenAI-compatible API (GLM/DeepSeek/Qwen/GPT supported). Theme switching supports System / Dark / Light.

## Important Rule

@AGENTS.md — This is NOT standard Next.js. Read `node_modules/next/dist/docs/` before writing any Next.js-specific code. APIs, conventions, and file structure may differ from training data.

## Common Commands

| Command | Purpose |
|---------|---------|
| `npx next dev` | Start dev server (Turbopack, port 3000) |
| `npx next build` | Production build |
| `npx tsc --noEmit` | Type-check only (strict mode) |
| `npm run lint` | ESLint (Next.js config) |

No test suite exists yet.

## High-Level Architecture

### Stack
- **Framework**: Next.js 16.2.9 App Router
- **Language**: TypeScript (strict, `noEmit`)
- **Styling**: Tailwind CSS v4 with `@theme inline` design tokens + CSS custom properties for runtime theme switching in `app/globals.css`
- **State**: Zustand (`lib/store.ts`)
- **Persistence**: Dexie (IndexedDB wrapper, `lib/db.ts`)
- **AI**: OpenAI-compatible API via `lib/ai.ts` (supports GLM, DeepSeek, Qwen, GPT)
- **Animation**: Framer Motion
- **Icons**: Lucide React

### All UI Components are Client Components

This app is a single-page interactive tool. Every component file starts with `"use client"`. The root `app/layout.tsx` is the only server component; it loads Google Fonts (Inter, JetBrains Mono) and renders the ambient background div. `app/page.tsx` bootstraps the Dexie DB on mount and renders the layout shell.

### Data Model (P0 + P1 AI + P2 Theme)

`lib/types.ts` defines the full schema:

- `TodoItem`: `id`, `title`, `rawInput`, `note`, `status` (`inbox` | `today` | `doing` | `done` | `archived` | `error`), `priority`, `tags`, `source`, timestamps, and AI fields (`aiSummary`, `aiStatus`, `errorMessage`)
- `AppSettings`: `theme` (`system` | `dark` | `light`), `aiEnabled`, `apiBaseUrl`, `apiKey`, `model`, `autoParse`, `quickCaptureShortcut`

Do not remove AI fields. Do not remove theme switching support.

### State & Persistence Split

- **Zustand** (`lib/store.ts`) holds the in-memory source of truth for all UI state and todo arrays. It also manages the `recentlyDeleted` buffer for undo delete.
- **Dexie** (`lib/db.ts`) is the async persistence layer. Every write operation must:
  1. Await the Dexie call (e.g., `await updateTodo(id, changes)`)
  2. Then update Zustand (`updateInStore(id, changes)`)
  3. On failure, show a toast and do **not** update Zustand

This two-step pattern appears in every mutating component (TodoCard, TodoDetail, QuickCapture, SettingsPanel).

**Delete with Undo**: TodoCard and TodoDetail use `softDelete(todo)` from Zustand instead of direct `deleteTodo`. The task is removed from UI immediately, stored in `recentlyDeleted` for 5 seconds with an undo Toast. If not undone, `confirmDelete` permanently removes it from Dexie.

### Visual System

Design tokens live in `app/globals.css`. The `@theme inline` block references CSS custom properties (e.g., `--color-text-primary: var(--text-primary)`), which are defined on `:root` for dark defaults and overridden via `[data-theme="light"]` and `[data-theme="system"]` + `@media (prefers-color-scheme: light)`.

Key concepts:
- Glass surfaces: `.glass` (blur 20px) and `.glass-strong` (blur 40px)
- Colors are semantic: `--color-bg-base`, `--color-surface`, `--color-primary` (#7C3AED), `--color-accent` (#22D3EE), `--color-text-primary`, etc.
- Ambient background: `.ambient-bg` with two radial-gradient glows (purple top-left, cyan bottom-right)
- No hardcoded colors in components — always use Tailwind semantic classes like `text-text-primary`, `bg-primary`, `border-glass-border`
- Hardcoded white/black utilities (`bg-white/5`, `border-white/5`, `bg-black/50`) are inverted in light theme via CSS overrides in `globals.css`

### Component Responsibilities

- `QuickCapture.tsx` — Command Palette overlay. Auto-focus textarea, auto-resize, `Cmd/Ctrl+K` shortcut, `Enter` to save, `Cmd/Ctrl+Enter` to save + AI parse, `Esc` to close (preserves draft).
- `Sidebar.tsx` — Left nav with status counts. Active indicator uses Framer Motion `layoutId="active-nav"`.
- `TodoList.tsx` — Filters by current status, supports search (title/rawInput/tags/note), keyboard arrow navigation (↑/↓), `/` to focus search.
- `TodoCard.tsx` — Card with complete toggle, move-next, archive, softDelete (with undo). Hover shows action buttons.
- `TodoDetail.tsx` — Right drawer. Full CRUD: editable title/note, status buttons, priority buttons, tag add/remove, timestamps, copy, archive, softDelete, AI result display (action/context/nextStep/relatedFiles/relatedSymbols/subtasks), reparse button.
- `SettingsPanel.tsx` — AI configuration (enable/API URL/Key/model/auto-parse/test connection), theme switcher (System/Dark/Light), export/import JSON, clear all data.
- `ThemeProvider.tsx` — Client component that watches `settings.theme`, sets `data-theme` attribute and `dark`/`light` class on `<html>`, listens to `matchMedia` for system preference changes.
- `Toast.tsx` — Toast container. Supports optional action button (e.g., "撤销" for delete undo). Action-bearing toasts display for 5s, others for 3s.

### AI Integration

`lib/ai.ts` provides:
- `parseTodoWithAi(rawInput, settings)` — calls chat completions API with strict System Prompt, retries 2x, 15s timeout, supports `response_format: { type: "json_object" }` for compatible models.
- `testAiConnection(settings)` — quick connectivity test.
- Deep JSON extraction: handles markdown code blocks, surrounding text, trailing commas, unquoted keys.
- `applyAiResultToTodo(item)` — maps AI result fields to TodoItem fields.

AI results update `title`, `tags`, `priority`, and `aiSummary` (which includes `action`, `context`, `suggestedNextStep`, `relatedFiles`, `relatedSymbols`, `subtasks`). Multiple items from AI are split into separate todos with `source: "ai_split"`.

### Accessibility & Motion Constraints

- All icon-only buttons must have `aria-label`.
- Touch targets should be ≥ 44px.
- `prefers-reduced-motion` is respected in `globals.css` (all transitions/animations collapse to 0.01ms).
- Exit animations must be faster than enter animations (per PRD §7.6).
- Max animation duration: 500ms (transform/opacity only).
