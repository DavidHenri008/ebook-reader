# Final Code Analysis & Modification Plan

This document captures the result of a final pass over the codebase
(`src/**`, `package.json`) and lists the modifications proposed before
shipping. Items are grouped by severity and scope.

---

## 1. Bugs / correctness

### 1.1 Duplicate dependency in `package.json` (BUG)

[package.json](package.json#L25-L29) lists `@vitejs/plugin-react-swc` twice
(`^3.9.0` then `^4.3.0`). JSON keeps only the last entry, but most lockfiles
and CI lint steps flag this. Keep a single declaration (`^4.3.0`).

### 1.2 Untyped `lastLocationCfi` migration shim (dead code)

[src/storage/readingState.ts](src/storage/readingState.ts#L50-L55) reads
`state.lastLocationCfi`, but the field is not declared on
`StoredReadingState`. This is a legacy migration that pre-dates the current
schema (DB version 3). It compiles only because of structural typing on the
IDB record. **Remove** the shim and the associated cast — current users no
longer have records with that shape.

### 1.3 Routing loses `File` on refresh

`ReaderPage` reads `location.state.file`. A hard refresh on `/reader` drops
the state and the user is sent back to the library. Acceptable for an MVP
but worth a follow-up: navigate with `?bookId=…` and rehydrate the file
through `getBookFile(bookId)`. **Defer** — not part of this pass.

---

## 2. Dead / unused code

### 2.1 `getBook` is over-exported

[src/storage/library.ts](src/storage/library.ts#L107) is exported but only
consumed inside the same module by `getBookFile`/`updateLastOpened`. Make it
file-local (`function getBook…` without `export`).

### 2.2 `RawExtractionResult.toc` duplicates `raw.toc`

[src/services/bookExtractor.ts](src/services/bookExtractor.ts#L57-L60) returns
both `raw` and a separate `toc`, and the caller in
[src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L353-L355) uses both even
though they are the same array. Return only `raw` (drop the wrapper type) and
read `raw.toc` at the call site.

### 2.3 `bookToMeta` `eslint-disable` for unused destructuring

[src/storage/library.ts](src/storage/library.ts#L168-L173) uses an
`eslint-disable` comment for the discarded `fileData`. Rename to
`{ fileData: _fileData, ...meta }` (or use `omit`) to drop the comment.

---

## 3. React conventions

### 3.1 `useState` without a setter

[src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L226-L227):

```ts
const [file] = useState<File | null>(locationState?.file ?? null);
const [bookId] = useState<string | null>(locationState?.bookId ?? null);
```

Neither setter is used. Replace with plain `useMemo` (or `const`) — the
values are immutable for the page's lifetime.

### 3.2 Single-click vs double-click on `BookCard`

[src/components/BookCard.tsx](src/components/BookCard.tsx#L141) opens books on
`onDoubleClick`. Library UIs are conventionally single-click to open (with
optional double-click for desktop parity). Switch the primary action to
`onClick` and keep the hover-revealed remove / clear-cache buttons. This also
removes the friction on touch devices.

### 3.3 Five effects that each diff a ref against a prop

[src/components/SectionViewer.tsx](src/components/SectionViewer.tsx#L912-L1004)
has four near-identical effects for `currentSection`, `zoom`, `theme`, `mode`
each starting with `if (xxxRef.current === xxx) return;` and ending with
`// eslint-disable-next-line react-hooks/exhaustive-deps`. Consolidate:

- Track only what actually triggers a re-render path.
- Where the ref mirror exists only to dodge stale closures, move the work
  into a single `useEffect` keyed on the relevant props and let the
  exhaustive-deps lint pass.
- Remove the `eslint-disable` comments after the consolidation; if any
  remain, document why with a one-line comment instead.

### 3.4 `SectionViewer` is a 1100-line component

[src/components/SectionViewer.tsx](src/components/SectionViewer.tsx) bundles
shadow-DOM lifecycle, paginated rendering, scrolled rendering with sentinel
mounting, anchor save/restore, keyboard handling, and ResizeObserver into one
file. Split (without changing behaviour) into focused modules under
`src/components/sectionViewer/`:

- `shadowHost.ts` — `ensureShadow`, `buildHostStyle`, content-mount helpers.
- `paginated.ts` — `renderPaginated`, `getColDims`,
  `measureLogicalContentHeight`.
- `scrolled.ts` — sentinel helpers and `mountPrev/Next` + range logic.
- `anchor.ts` — text-walker helpers (`getTopmostVisibleAnchor`,
  `findNodeAtOffset`, `getTopmostVisibleSection`).
- `useSectionViewer.ts` — the orchestration hook.
- `SectionViewer.tsx` — thin presentational wrapper.

Goal: each file < 250 lines and free of `// eslint-disable` directives.

### 3.5 Avoid `confirm` / `alert` in render path

[src/pages/HomePage.tsx](src/pages/HomePage.tsx#L195-L226) uses native
`confirm` and `alert`. Keep for now (low-priority polish), but flag for a
follow-up that introduces a small modal. **Defer**.

### 3.6 `window.location.reload()` after cache clear

[src/pages/HomePage.tsx](src/pages/HomePage.tsx#L220) forces a full reload.
Replace with `await loadLibrary()` since clearing the cache database does not
affect the library DB or React state.

---

## 4. Timers / async control

Reviewed every `setTimeout` / `requestIdleCallback` / `setInterval`. Findings:

| Location                                                | Purpose                                                 | Verdict                   |
| ------------------------------------------------------- | ------------------------------------------------------- | ------------------------- |
| `SectionViewer.saveAnchor` 300 ms `setTimeout` fallback | persist anchor only if `requestIdleCallback` is missing | Keep — necessary fallback |
| `SectionViewer` ResizeObserver 100 ms debounce          | avoid thrashing on resize                               | Keep                      |
| No `setInterval` anywhere                               | —                                                       | OK                        |

No excessive timers. The only **minor** improvement: the idle-callback /
setTimeout fallback would read more clearly as a 2-line `scheduleIdle`
helper extracted to the new `anchor.ts` module from §3.4.

---

## 5. Implementation complexity (incidental)

### 5.1 `estimateCharsPerPage` lives in `ReaderPage`

[src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L181-L190) estimates page
counts independently of the real layout in `SectionViewer`. It is necessary
today because `SectionViewer` only reports `pageInSection` for the active
section, not the total. Two options:

1. **Keep** the estimation (current behaviour) but move the helper into
   `src/services/pageEstimation.ts` so the page component stays focused on
   composition. (Recommended for this pass.)
2. Have `SectionViewer` expose total pages across all sections via callback —
   larger change, **defer**.

### 5.2 `extractRawBook` uses `any` heavily

[src/services/bookExtractor.ts](src/services/bookExtractor.ts#L70-L120) wraps
`epub.js` internals with `any`. The library has no public types for the spine
iterator or `resources.replacements`, so the disables are justified. Narrow
each cast to the smallest possible expression (per-line `// eslint-disable…`
instead of the file-wide block) to keep the rest of the file type-checked.

---

## 6. Plan — ordered modifications

Pass 1 — small, safe edits (no behaviour change):

1. Fix duplicate `@vitejs/plugin-react-swc` entry in `package.json`.
2. Remove legacy `lastLocationCfi` migration shim in `readingState.ts`.
3. Drop `export` from `getBook`; rename `_fileData` and remove the
   `eslint-disable` comment in `library.ts`.
4. Collapse `RawExtractionResult` to return `RawExtractedBook` directly.
5. Replace `useState` with `useMemo`/`const` for `file` and `bookId` in
   `ReaderPage`.
6. Swap `onDoubleClick` → `onClick` in `BookCard`.
7. Replace `window.location.reload()` after cache clear with
   `await loadLibrary()`.

Pass 2 — `SectionViewer` refactor: 8. Extract anchor utilities, shadow-host helpers, paginated and scrolled
modules into `src/components/sectionViewer/` as described in §3.4. 9. Consolidate the four prop→ref diffing effects and remove every
`react-hooks/exhaustive-deps` disable in this file. 10. Extract a `scheduleIdle` helper to encapsulate the
`requestIdleCallback` / `setTimeout` fallback (§4).

Pass 3 — light cleanup: 11. Move `estimateCharsPerPage` + `getPlainTextLength` to
`src/services/pageEstimation.ts`. 12. Narrow `any` casts in `bookExtractor.ts` to per-line disables.

Pass 1 is mergeable on its own and unblocks Pass 2. Pass 2 is the largest
change and should land behind a focused PR with no behaviour change other
than the removal of disables. Pass 3 is polish.

---

## 7. Non-issues confirmed during review

- Folder layout (`pages`, `components`, `services`, `storage`, `styles`,
  `types`) is consistent and barrel files are thin.
- `App` / `main` are minimal and idiomatic for React 19 + Vite.
- `idb` schemas are versioned with proper `upgrade` migrations.
- Strict mode is enabled, ESLint config is in place, no `console.log`
  spam (only one intentional `console.warn` for cache-save failures).
- No usage of `dangerouslySetInnerHTML`; sectioned HTML is mounted via
  `DOMParser` + manual node import into a shadow root (safer than raw HTML
  injection).
