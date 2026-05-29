# Improvement Plan

A precise, step-by-step plan derived from a full read-through of `src/`. No
changes have been made yet — each step below is independently actionable.

Steps are grouped by theme and ordered roughly from lowest-risk/highest-clarity
to highest-effort. Every step lists the concern, the exact target(s), the
proposed change, and how to validate it.

Guardrails that constrain several steps:

- Keep EPUB content local (no uploads/sync/remote). Asset-reference behavior in
  `collectAssetReferences` is pinned by `bookExtractor.test.ts` and
  `bookExtractor.integration.test.ts` — keep them green.
- The `SectionViewer` callback-prop mirrors (`onNavigateRef`,
  `onPositionChangeRef`, `onViewportChangeRef`) are intentionally inline
  `useRef` + updater `useEffect` (documented React Compiler stability
  constraint). Do **not** extract them into a custom `useLatestRef` hook.
- Validate every step with: `npm run lint`, `npm run build`, `npm test`.

---

## A. Dead code & unused surface (low risk, quick wins)

### A1. Remove unused `PagePosition` fields
- **Concern (dead code):** `PagePosition.sectionNumber` and `PagePosition.estimated`
  are computed by both `getEstimatedPagePosition` and `getMeasuredPagePosition`
  in [src/services/pageEstimation.ts](src/services/pageEstimation.ts) but never
  read. The only consumer, [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx),
  uses only `pagePosition.page` and `pagePosition.total`.
- **Change:** Drop `sectionNumber` and `estimated` from the `PagePosition`
  interface and from both return-object literals (4 sites). Keep `page` and
  `total`.
- **Validation:** `npm run build` confirms no other reader.
- **Note:** If a future "Section N" or "estimated ~" UI indicator is planned,
  keep `estimated` and instead wire it into `ReaderSidebar`; decide explicitly
  rather than leaving it dead.

### A2. Resolve the duplicate `useDialogs` export path
- **Concern (redundant surface):** `useDialogs` is exported from
  [src/components/ui/index.ts](src/components/ui/index.ts) and re-exported again
  through [src/components/index.ts](src/components/index.ts). Both `UseDialogsResult`
  and `useDialogs` travel two hops. This is harmless but ambiguous.
- **Change:** Pick one public entry point. Recommended: import dialog APIs from
  `components/ui` directly in `HomePage`, and stop re-exporting `useDialogs`/
  `UseDialogsResult` from the top-level `components` barrel (keep visual
  components there). Document the convention in repo memory.
- **Validation:** `npm run build`.

### A3. Clean up the `bookToMeta` unused-binding workaround
- **Concern (non-standard style):** [src/storage/library.ts](src/storage/library.ts)
  strips `fileData` via `const { fileData: _fileData, ...meta } = book; void _fileData;`.
  The `void _fileData;` is a lint workaround.
- **Change:** Replace with a clearer omit, e.g. build `BookMeta` explicitly or
  use a small `omit`-style helper. Avoids the throwaway binding + `void`.
- **Validation:** `npm run lint`, `npm run build`.

---

## B. Code repetition (medium risk, clear consolidation)

### B1. Share the epubjs adapter (factory cast + substitution disabling)
- **Concern (repetition):** [src/services/bookExtractor.ts](src/services/bookExtractor.ts)
  and [src/services/epubMetadata.ts](src/services/epubMetadata.ts) each define:
  - a near-identical `ePub as unknown as <Factory>` cast, and
  - an identical `disableEpubJsResourceSubstitution(book)` that no-ops
    `resources.replaceCss` and clears `spine.hooks.serialize`.
- **Change:** Add a small `src/services/epubjsAdapter.ts` exposing the shared
  cast helper (e.g. `createEpubBook(data)`) and a single
  `disableEpubJsResourceSubstitution(book)` typed against a minimal shared
  interface. Both services import from it.
- **Risk:** epubjs typing is intentionally narrow per project guidelines; keep
  the shared interface minimal and let each caller extend with the extra members
  it needs (e.g. `coverUrl`, `spine.each`).
- **Validation:** `npm test` (integration test exercises extractor),
  `npm run build`.

### B2. Centralize the theme palette (single source of truth)
- **Concern (repetition):** The dark palette is written twice in
  [src/styles/GlobalStyles.tsx](src/styles/GlobalStyles.tsx) (the
  `prefers-color-scheme` block and the explicit `html[data-theme="dark"]`
  block), and the reader's shadow-DOM palette is hand-duplicated in
  `THEME_CSS` in [src/reader/shadowHost.ts](src/reader/shadowHost.ts). Color
  values live in three places.
- **Change:** Define palettes once (e.g. a `themePalettes` record of CSS-var
  strings) and derive: (1) the global `:root` / dark blocks, and (2) the
  shadow-host `--bg/--text/--text-heading/--border` declarations. The media
  query and explicit `[data-theme]` block can reference the same token map.
- **Risk:** Shadow DOM cannot inherit page CSS variables, so the reader must
  still emit literal values — but those literals should be generated from the
  shared map, not retyped.
- **Validation:** Manual visual check in `npm run dev` (light/dark, reader vs
  library); `npm run build`.

### B3. Extract a single zoom-step helper in `ReaderPage`
- **Concern (repetition):** `zoomIn`/`zoomOut` in
  [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx) are mirror images
  (`Math.min(z + 10, 400)` / `Math.max(z - 10, 20)`), each persisting via
  `saveZoom`.
- **Change:** Introduce one `applyZoomDelta(delta)` callback (clamps to
  `[20, 400]`, calls `saveZoom`); derive `zoomIn`/`zoomOut` from it. Hoist the
  `10 / 20 / 400` constants to named values.
- **Validation:** `npm run build`; manual zoom check.

### B4. De-duplicate the render→restore pattern in `useSectionViewer`
- **Concern (repetition):** [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts)
  repeats `renderPaginated(...).then(() => requestAnimationFrame(() => restoreAnchor(...)))`
  and `requestAnimationFrame(() => restoreAnchor(...))` ~6 times across the
  mount/prop-change effect and the ResizeObserver.
- **Change:** Add two private helpers inside the hook, e.g.
  `renderPaginatedThenRestore(section, zoom, anchor)` and
  `restoreOnNextFrame(anchor, mode, zoom)`, and call them from each branch.
  Also factor the repeated
  `getColDims(sectionViewportRef.current, wrapperRef.current, zoomRef.current)`
  into a `currentColDims()` helper used by `navigatePrev`/`navigateNext`.
- **Risk:** This is the most behavior-sensitive file (StrictMode mount guards,
  render-id races, position flush on mode switch — see repo memory). Keep the
  helpers purely mechanical (no ordering changes) and do **not** touch the
  callback-ref mirrors. Do this before B5/C2.
- **Validation:** `npm test`; manual: paginated next/prev across section
  boundaries, mode switch scrolled↔paginated, zoom, resize, and back-to-library
  (position save) per the section-viewer memory notes.

---

## C. Overcomplicated code (higher effort, decomposition)

### C1. Decompose `useSectionViewer` into paginated/scrolled controllers
- **Concern (complexity):** `useSectionViewer.ts` is ~640 lines with ~30 refs
  and one ~110-line combined mount + prop-change `useEffect` containing deeply
  nested `modeChanged / sectionChanged / zoomChanged / themeChanged` branches.
  This is the single largest comprehension/maintenance hazard.
- **Change (incremental, behavior-preserving):**
  1. First land B4 (mechanical de-dup) so branches shrink.
  2. Extract the paginated engine (render, navigate, anchor restore,
     `currentColDims`) into a framework-agnostic controller object under
     `src/reader/` (e.g. `paginatedController.ts`) that owns the cols transform
     and page state, leaving the hook to wire React state/refs.
  3. Extract the scrolled engine (sentinel mount/unmount, range tracking,
     `IntersectionObserver`, scroll save) similarly (e.g.
     `scrolledController.ts`), complementing the existing
     [src/components/sectionViewer/scrolled.ts](src/components/sectionViewer/scrolled.ts).
  4. Reduce the giant effect to: compute the diff, then delegate to the active
     controller.
- **Risk:** High. Must preserve: StrictMode double-mount cleanup, render-id
  cancellation, position flush before mode change, scrolled idle saves, and the
  inline callback-ref mirror constraint. Do in small, separately-validated PRs;
  keep each controller extraction independently revertible.
- **Validation:** Full manual reader matrix (both modes, boundaries, zoom,
  theme, resize, deep-link restore, rapid back-to-library) plus `npm test`.

### C2. Extract book-title/route resolution from `ReaderPage`
- **Concern (complexity):** `ReaderPage` mixes routing, title resolution
  (`locationState` → `storedBookTitle` → `titleFromRoute`), a canonical-path
  redirect effect, a `getBookMeta` title-load effect, and reading-state load —
  alongside all the reader wiring.
- **Change:** Move title + canonical-path logic into a small hook
  (e.g. `useReaderBookTitle(bookId, locationState, routeBookTitle)` under
  `src/pages/reader/`) returning `{ bookTitle, canonicalReaderPath }`, and let
  `ReaderPage` consume it. Keeps `ReaderPage` focused on composing the reader.
- **Validation:** `npm run build`; manual: open from library, deep-link by URL,
  refresh on a `/reader/:bookTitle` URL.

### C3. Simplify `ReaderPage` body rendering
- **Concern (style):** `ReaderPage` builds `let body: React.ReactNode = null;`
  via imperative `if/else if` assignment.
- **Change:** Extract a `renderReaderBody(...)` helper or small subcomponent
  returning the loading/`Container` markup, so the component returns a clean
  declarative tree. Low risk; do after C2.
- **Validation:** `npm run build`; manual smoke.

### C4. Clarify the spine-index vs array-index duality
- **Concern (complexity/foot-gun):** `RawSection.index` (spine index) and the
  array position are used interchangeably in places. `lookupSection` papers over
  this with `sections[idx] ?? sections.find((s) => s.index === idx)`, and
  `sectionIndexForHref` returns the array index. This invites off-by-context
  bugs.
- **Change:** Document the contract in one place (are they guaranteed equal
  after extraction?). If they are always equal, drop the `.find` fallback in
  `lookupSection` and rely on array index consistently. If not, name the two
  concepts distinctly (`spineIndex` vs `sectionIndex`) in types and call sites.
- **Risk:** Medium — touches navigation correctness. Verify with a book whose
  spine indices are non-contiguous before removing the fallback.
- **Validation:** `npm test`; manual TOC navigation + next/prev.

---

## D. Architecture / placement (low–medium risk)

### D1. Move `viewportsAlmostEqual` to `src/reader/`
- **Concern (layering):** `viewportsAlmostEqual` lives in
  [src/services/pageEstimation.ts](src/services/pageEstimation.ts) but is a
  generic geometry primitive imported by `useSectionViewer`, `usePageMap`, and
  `ReaderPage`. Per project guidelines, `services` should depend downward into
  `src/reader/*`; a shared primitive belongs there.
- **Change:** Move it to a small module under `src/reader/` (e.g.
  `viewport.ts`) and update imports. `pageEstimation` then imports it like the
  components do.
- **Validation:** `npm run build`; `npm test`.

### D2. Standardize export style (default vs named)
- **Concern (non-standard/inconsistent):** Components mix default exports
  (`BookCard`, `FilePicker`, `SectionViewer`, pages) with named exports
  (`ReaderToolbar`, `ReaderSidebar`, `Button`, `IconButton`). The barrels then
  normalize with `export { default as X }`.
- **Change:** Adopt one convention for components (named exports recommended for
  better refactor/rename ergonomics and consistent barrels) and apply it
  uniformly. This is mechanical but broad — do as its own pass.
- **Validation:** `npm run build`; `npm run lint`.

---

## E. Robustness gaps (optional, behavior-adding — confirm before doing)

> These add behavior rather than refactor; only pursue if desired.

### E1. Add a React error boundary around routes
- **Concern:** `useBookExtraction` re-throws non-abort extraction errors, and
  there is no error boundary in [src/App.tsx](src/App.tsx). A bad EPUB can blank
  the app.
- **Change:** Add an error boundary wrapping `Routes` (or just `ReaderPage`)
  that shows a recoverable "failed to open book" state with a back-to-library
  action.
- **Validation:** Manual: feed a deliberately broken/empty file.

### E2. Reconsider the `Button`/`IconBtn` duplication in `ReaderToolbar`
- **Concern (repetition/inconsistency):**
  [src/components/reader/ReaderToolbar.tsx](src/components/reader/ReaderToolbar.tsx)
  defines its own `Button`/`IconBtn`/`ModeSelect` styled components even though
  shared [src/components/ui/Button.tsx](src/components/ui/Button.tsx) exists
  (`Button`, `IconButton`). The toolbar variants are visually different
  (borderless, larger glyphs), so this may be intentional.
- **Change (optional):** Either (a) add a `ghost`/`toolbar` variant to the
  shared `Button` and reuse it, or (b) explicitly document that the toolbar uses
  bespoke controls and leave as-is. Decide intentionally rather than leaving two
  parallel button systems undocumented.
- **Validation:** Manual visual check of the toolbar.

---

## Suggested sequencing

1. **A1–A3** (dead code / quick cleanups) — isolated, fast, build-verified.
2. **D1, B3** (small relocations/consolidations).
3. **B1, B2** (shared epub adapter, theme palette).
4. **B4** (mechanical de-dup in `useSectionViewer`) — prerequisite for C1.
5. **C2, C3, C4** (`ReaderPage` and index-duality clarifications).
6. **C1** (decompose `useSectionViewer`) — largest effort, most validation.
7. **D2** (export-style normalization) — broad but mechanical, do in isolation.
8. **E1, E2** (optional behavior/robustness) — only if explicitly wanted.

## Out of scope (do not change without explicit request)

- `collectAssetReferences` output set (pinned by tests).
- The inline callback-ref mirrors in `useSectionViewer`.
- epubjs `replacements: "none"` + serialize-hook clearing (prevents `blob:` URL
  leakage into cached HTML — see repo memory).
- Re-adding extraction/cache performance timing instrumentation.
