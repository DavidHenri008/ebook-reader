# EPUB Reader — Second-Pass Cleanup Plan

This document is a fresh, read-only audit. It complements [PLAN.md](PLAN.md) but is organized around concrete findings rather than themes, and it tries to be precise about what to change, where, and why. **No code changes are included here.**

For each step the format is:

- **Finding** — what is wrong or smelly, with file/line evidence.
- **Why** — the cost today.
- **Change** — the smallest defensible edit.
- **Risk / payoff** — what to validate, what to preserve.

The steps are grouped from lowest-risk / highest-confidence to highest-risk / highest-judgment.

---

## Group A — Trivially dead or unused code

These changes are mechanical, type-safe, and reversible.

### A1. Drop unused exports

**Finding.** Several `export`s have no external consumer:

| Export                                        | File                                                                                                     | Used by                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `BASE_CHARS_PER_PAGE`, `estimateCharsPerPage` | [src/services/pageEstimation.ts](src/services/pageEstimation.ts#L14-L58)                                 | self only                                           |
| `defaultReadingState`                         | [src/storage/readingState.ts](src/storage/readingState.ts#L8)                                            | self only                                           |
| `bookTitleToUrlSegment`                       | [src/utils/bookTitleUrl.ts](src/utils/bookTitleUrl.ts#L11)                                               | self only (call sites use `readerPathForBookTitle`) |
| `isReadableTextNode`                          | [src/components/sectionViewer/anchor.ts](src/components/sectionViewer/anchor.ts#L6)                      | self only                                           |
| `THEME_CSS`                                   | [src/components/sectionViewer/shadowHost.ts](src/components/sectionViewer/shadowHost.ts#L7)              | self only (`buildHostStyle`)                        |
| `UseSectionViewerResult`                      | [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts#L47) | re-declared as a return type, not imported anywhere |

**Why.** They inflate the apparent public surface and make refactoring riskier than it is.

**Change.** Demote each to a non-exported local declaration. TypeScript will keep inferring the call-site types.

**Risk / payoff.** Lint + `tsc --noEmit` are sufficient validation.

### A2. Remove the unused `services` barrel

**Finding.** [src/services/index.ts](src/services/index.ts) re-exports `extractRawBook` and `sectionIndexForHref`, but every call site imports directly from [src/services/bookExtractor.ts](src/services/bookExtractor.ts) or [src/services/pageEstimation.ts](src/services/pageEstimation.ts). No file imports `"../services"`.

**Why.** It is a maintenance trap: the barrel only exposes one of the two service modules, so anyone trusting the barrel would silently miss `pageEstimation`.

**Change.** Delete [src/services/index.ts](src/services/index.ts).

**Risk / payoff.** None observable.

### A3. Remove the never-navigated `/reader` route

**Finding.** [src/App.tsx](src/App.tsx) registers both `"/reader"` and `"/reader/:bookTitle"`. No file calls `navigate("/reader")` or `<Link to="/reader">`; the home page always navigates through `readerPathForBookTitle(book.title)`.

**Why.** The bare route is reachable only via direct URL and lands on a `ReaderPage` instance with no `file`, no `bookId`, and no `routeBookTitle`, producing a permanent "Loading..." state. Misleading.

**Change.** Drop the bare `"/reader"` route. Keep the canonical `"/reader/:bookTitle"`.

**Risk / payoff.** Confirm that no bookmarks rely on `/reader` (none exist in source). Lint + manual nav.

### A4. Unify `types` import style

**Finding.** Imports of `src/types/*` are inconsistent across the codebase:

- [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L16-L17) and [src/components/BookCard.tsx](src/components/BookCard.tsx#L2) use `"../types"` (barrel).
- [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L26-L27) uses **both** `"../types"` and `"../types/bookPages"` in adjacent lines.
- [src/storage/db.ts](src/storage/db.ts#L2-L4), [src/storage/library.ts](src/storage/library.ts#L2), [src/storage/readingState.ts](src/storage/readingState.ts#L1), [src/storage/bookCache.ts](src/storage/bookCache.ts#L2), [src/services/bookExtractor.ts](src/services/bookExtractor.ts#L2-L3), and [src/services/pageEstimation.ts](src/services/pageEstimation.ts#L1-L2) use the direct sub-paths.

**Why.** Readers can't tell where a type really lives; the barrel hides ownership and creates a small risk of circular re-exports as the project grows.

**Change.** Pick one convention. Recommendation: keep [src/types/index.ts](src/types/index.ts) as a convenience for consumers that already import multiple unrelated types (UI/pages), and switch [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx) to the barrel for consistency. Alternative: delete the barrel and require direct sub-path imports everywhere (more honest, marginally more typing).

**Risk / payoff.** Pure mechanical edit. Validate with lint + `tsc --noEmit`.

---

## Group B — Direct duplication to consolidate

### B1. Location-normalization helpers (already noted, restated for completeness)

**Finding.** `normalizeAnchor`, `normalizeSectionIndex`, `clampSectionIndex` are byte-identical in [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L205-L219) and [src/services/pageEstimation.ts](src/services/pageEstimation.ts#L61-L75).

**Change.** Extract to a single module (e.g. `src/utils/readingLocation.ts`) and import it from both call sites. PLAN.md Step 1 already covers this; PLAN2 endorses it as the first concrete code change.

### B2. `disableEpubJsResourceSubstitution` duplicated

**Finding.** Identical helper at [src/services/bookExtractor.ts](src/services/bookExtractor.ts#L287-L291) and [src/storage/library.ts](src/storage/library.ts#L31-L36), plus a duplicated adapter-type block for the same `book.resources?.replaceCss` and `book.spine?.hooks?.serialize?.clear` calls.

**Change.** Move EPUB metadata extraction (`extractEpubMetadata`) and the helper into the services layer next to `bookExtractor`, e.g. a new `src/services/epubMetadata.ts` that also owns the adapter types. Library storage should not import `epubjs`. This is PLAN.md Step 2 — keep it on the list.

### B3. `yieldToBrowser` and equivalents

**Finding.** Identical `setTimeout(resolve, 0)` helpers in [src/services/bookExtractor.ts](src/services/bookExtractor.ts#L294-L296) and [src/storage/bookCache.ts](src/storage/bookCache.ts#L29-L31). Conceptually similar `yieldToReaderPaint` (double-rAF) in [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L198-L202).

**Change.** Create `src/utils/async.ts` with `yieldToBrowser()` (macrotask) and `yieldToReaderPaint()` (double-rAF). Import where needed. These are different primitives and should keep distinct names.

**Risk.** None — same semantics.

### B4. Blob → data URL

**Finding.** Two distinct implementations:

- `blobToDataUrl` in [src/services/bookExtractor.ts](src/services/bookExtractor.ts#L298-L312) with proper rejection.
- Inline `FileReader` block for cover extraction in [src/storage/library.ts](src/storage/library.ts#L75-L86), which uses `reader.onload`/`onerror` (less defensive than `addEventListener`).

**Change.** Move `blobToDataUrl` into `src/utils/blob.ts` and use it from both call sites. After B2 it lives next to its only remaining caller anyway; either way, do not keep two copies.

### B5. "Viewport equal within 0.5px" check

**Finding.** The same approximate-equality test appears in at least four places:

- [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L235-L240) (`activePageMap` guard)
- [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L552-L558) (`handleViewportChange`)
- [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts#L141-L147) (`reportViewport`)
- [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts) ResizeObserver debounce path

**Change.** Add a tiny helper `viewportsAlmostEqual(a, b, eps = 0.5)` (or `samePageViewport`) in [src/services/pageEstimation.ts](src/services/pageEstimation.ts) (next to `PageViewport`) and reuse it.

**Risk.** Behavior identical; payoff is one place to change the tolerance.

### B6. Live-render and measurement share the same paginated layout block

**Finding.** Two near-identical blocks set host/clamp/cols CSS the same way:

- Measurement at [src/services/pageEstimation.ts](src/services/pageEstimation.ts#L186-L223) (`measurePageMap`).
- Live render at [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts) `renderPaginated`.

Each does: `getColDims` → set host width/height → set `clamp.style.cssText` and `cols.style.cssText` from the same template → `setSectionContent` → `waitForContentLayout` → `measureLogicalContentHeight` → re-apply heights → `nextAnimationFrame` → compute `Math.ceil(scrollWidth / colWidth)`.

**Why.** Any future fix to the layout (e.g. handling RTL columns, gutter, fixed-layout edge cases) must be applied in two places. This is the single biggest correctness risk in the codebase.

**Change.** Extract one shared helper, e.g.:

```
applyPaginatedLayout(host, clamp, cols, flow, dims, zoomFactor, html) -> { pageCount }
```

placed in `src/components/sectionViewer/paginated.ts` (it already owns `getColDims` and dimensions). Both [src/services/pageEstimation.ts](src/services/pageEstimation.ts) and `useSectionViewer.renderPaginated` would call it.

Be careful: live render also needs to set `cols.style.transform = ""`, mutate refs, and bump a render-id. Keep that orchestration in the hook; only the deterministic DOM-shape part moves.

**Risk / payoff.** Medium risk, very high payoff. Validate on:

- A reflowable book at multiple zooms (estimated total page count == measured total page count).
- A fixed-layout book that has section viewports.
- Mode switching round-trips (paginated → scrolled → paginated keeps page count stable).

### B7. Theme bootstrap repeats on both pages

**Finding.** Both pages independently read `getCurrentLibraryTheme()`, hold `theme` state, and mirror it onto `document.documentElement.dataset.theme`:

- [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L150-L163)
- [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L255-L260) + [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L386-L389) + the `toggleTheme` callback that writes `localStorage` directly

**Change.** Introduce `useAppTheme()` in `src/styles/useAppTheme.ts` (or `src/hooks/useAppTheme.ts`) that owns: initial read from `localStorage`, `dataset.theme` write, and `localStorage` write. Each page consumes `[theme, setTheme]`. Reader's book-scoped persistence (`saveReadingState(bookId, { theme })`) stays in `ReaderPage` — do **not** push IndexedDB writes into the generic theme hook.

**Risk.** Low. Confirm theme persists across reloads and reflects on both pages.

### B8. Scrolled-mode "topmost visible section" logic is duplicated inside the hook

**Finding.** Inside [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts), the same flow appears twice:

- `readVisiblePosition` (scrolled branch): top-of-document early return, then `getTopmostVisibleSection` → `Number(dataset.sectionIndex)` → notify if changed.
- `updateScrolledSectionFromViewport`: identical top-of-document early return, identical `getTopmostVisibleSection`+`Number(...)` block.

`saveAnchor` and `flushAnchor` also share almost their whole body — `flushAnchor` is "save without idle deferral".

**Change.** Extract:

- `readVisibleSectionIndex(wrapper, flow): number | null` for the scrolled "which section is on top" computation.
- `commitPosition(position, { defer: boolean })` that wraps the `idleHandleRef` cancel/schedule branching.

`saveAnchor`, `flushAnchor`, and `updateScrolledSectionFromViewport` would each shrink to a few lines.

**Risk / payoff.** Medium. The hook is the most subtle code in the app; refactor only with manual reading regression coverage. See Group D for the bigger-picture concern.

---

## Group C — Overcomplicated patterns to simplify

### C1. Hand-rolled HTML attribute scanner

**Finding.** [src/services/bookExtractor.ts](src/services/bookExtractor.ts#L78-L235) implements its own character-by-character attribute parser (`collectAttributeReferences`, `findAttributeValueEnd`, `collectStyleAttributeUrls`, `collectStyleElementUrls`, `addAssetReference`, `addSrcsetReferences`, …). That is ~160 lines.

**Why it exists.** Comments and the project guidelines say asset rewriting must preserve `src`, `srcset`, `href`, `poster`, `data`, `xlink:href`, CSS `url(...)`, fragments, and `./` path variants. The scanner is one defensible way to enumerate those references without parsing.

**Why it is overcomplicated.** [src/components/sectionViewer/shadowHost.ts](src/components/sectionViewer/shadowHost.ts#L24-L46) already uses `DOMParser` to round-trip the same HTML. `DOMParser` would give us a real attribute view (including `xlink:href`, `srcset`, inline `style`, and `<style>` text content) with native fidelity and is the approach the project guidelines recommend.

**Change.** Two options, listed in order of risk:

1. **Conservative.** Keep the scanner, but consolidate the duplicate attribute-walk between `collectAttributeReferences` and `collectStyleAttributeUrls` into one parameterized helper (the only differences are which extractor is called per value). This removes ~60 lines without changing behavior.
2. **Recommended.** Replace the scanner with a `DOMParser` pass that:
   - reads each attribute in `ASSET_ATTRIBUTE_NAMES` via `element.getAttribute`,
   - reads inline `style` attributes,
   - reads `<style>` `textContent` and applies `CSS_URL_PATTERN`,
   - keeps the same `./` variant logic and `&amp;` decoding (which is already needed when parsing-then-serializing).

   Then drop the scanner functions.

**Risk / payoff.** Option 1: low risk. Option 2: medium risk — but it unlocks future maintainability and removes the most brittle code in the repo. Either option requires testing across a real corpus (reflowable, fixed-layout, books that use `srcset`, books that use inline `style`, books with CSS files referenced via `@import`).

**Do not change** without test coverage of `inlineAssets` over at least a few representative books. This is the strongest argument for the testing work in PLAN.md Step 8.

### C2. `useSectionViewer` ref soup

**Finding.** [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts#L67-L113) declares ~20 refs. Many exist solely as "live mirrors" of props (`sectionRef`, `anchorRef`, `modeRef`, `zoomRef`, `themeRef`). Three more mirror callback props (`onNavigateRef`, `onPositionChangeRef`, `onViewportChangeRef`) and are updated by individual `useEffect`s.

**Why.** Avoid stale closures in callbacks fired by observers, timeouts, and rAF.

**Why it's smelly.** It is the codebase's biggest single source of accidental complexity. The combined mount + prop-change effect at lines ~700–820 then has to read both the prop and the mirrored ref to decide what changed.

**Change.** Two pragmatic, low-risk improvements:

1. Coalesce prop mirrors into one ref:
   `const propsRef = useRef({ section, anchor, mode, zoom, theme });` updated in a single `useEffect`. Replace `sectionRef.current` reads with `propsRef.current.section`. Net effect: ~15 lines removed, the "which changed?" computation reads from `propsRef` cleanly.
2. Replace the three callback-prop mirror effects with the React 19 stable-event idiom (small `useEvent`-like helper that returns a stable function reading from a ref). One helper, three call sites.

Do **not** rewrite to `useReducer` in the same change. The reducer pattern would obscure the imperative DOM operations the hook actually does.

**Risk / payoff.** Medium. Validate StrictMode mount/unmount, mode switching, navigation, position save.

### C3. ReaderPage owns extraction orchestration plus UI

**Finding.** [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx) is ~670 lines: 13 styled components, a recursive `TocList`, a `LocationState` interface, two normalization helpers (B1), an extraction `useEffect` with cache-then-extract logic, a measurement `useEffect`, a theme `useEffect`, a `loadedBookTitle` fetch, canonical-URL redirect, then UI.

**Change.** Same plan as PLAN.md Step 3 but with a recommended order tuned to risk:

1. Pure presentational extractions first — they cannot regress logic:
   - `ReaderToolbar` (back button, title, mode select, zoom, theme toggle).
   - `TocList` and `ReaderSidebar` (sidebar shell + TOC + position).
2. Then a single hook for the extraction pipeline:
   - `useBookExtraction(file, bookId)` → `{ extractedBook, toc, progressMessage }`. This isolates the cancel-token + cache-then-extract dance.
3. Then `useReaderTheme(bookId, initialTheme)` (combines B7 with reader-scoped persistence).
4. Then `usePageMap(extractedBook, viewport, zoom, theme, bookId)` for measurement + invalidation.

Leave `currentSection`/`anchor` state in `ReaderPage` (they're directly wired into `SectionViewer` props).

**Risk.** Per-step risk is small if you do them one at a time and lint after each.

### C4. `saveReadingState` defaults overwrite stored theme

**Finding.** [src/storage/readingState.ts](src/storage/readingState.ts#L39-L60):

```ts
const defaultState = getDefaultReadingState(); // reads localStorage
const storedState = {
  ...defaultState,
  ...existing,
  ...state,
  theme: state.theme ?? defaultState.theme, // <- overrides existing.theme
  ...
};
```

When the caller does not pass `theme` (e.g. a hypothetical `saveReadingState(bookId, { lastLocation })`), the stored `theme` is replaced by the **current global theme** rather than the previously stored book theme.

Today this is masked because every `saveReadingState` call in [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx) explicitly passes `theme`. It is still a latent bug for any future caller.

**Change.** Either:

1. Drop the `theme: ...` override and rely on the `...existing, ...state` spread. `existing.theme` will survive when `state.theme` is undefined, and `defaultState.theme` will be used only on a brand-new record (because then `existing` is undefined).
2. Or, since `loadReadingState` already discards the stored theme in favor of the library theme, drop `theme` from the persisted shape entirely. This is the cleaner long-term option but is a schema change (would need a DB migration to remove the field, or just leaving it as legacy).

Recommendation: option 1 now; option 2 if/when reading-state schema is otherwise touched.

**Risk.** Low. Add a small unit test once a test setup exists.

### C5. `bookCache.ts` cache-progress throttling is fragile

**Finding.** [src/storage/bookCache.ts](src/storage/bookCache.ts#L21-L26):

```ts
if (!onProgress || (done !== 0 && done !== total && done % 8 !== 0)) return;
```

The literal `8` matches `RESTORE_BATCH_SIZE = 8` but is duplicated as a magic number. If anyone changes the batch size, progress updates fall out of sync.

**Change.** Replace `done % 8 !== 0` with `done % RESTORE_BATCH_SIZE !== 0` (already in scope). One-line edit.

### C6. `getMountedScrolledSection` / `getTopmostVisibleSection` use `Array.from(...).find`

**Finding.** [src/components/sectionViewer/scrolled.ts](src/components/sectionViewer/scrolled.ts#L48-L57) materializes a full array to find one element. [src/components/sectionViewer/anchor.ts](src/components/sectionViewer/anchor.ts#L75-L96) similarly iterates with `forEach`.

**Change.**

- `getMountedScrolledSection`: replace with `root.querySelector<HTMLElement>('[data-section-index="' + CSS.escape(String(sectionIndex)) + '"]')`. O(1) selector match, no allocation.
- `getTopmostVisibleSection`: keep the iteration (it has to consider all candidates) but use a `for…of querySelectorAll` loop, and short-circuit with `break` once a candidate sits at `viewTop` (i.e. `rect.top <= viewTop`) since later siblings cannot be higher.

**Risk.** Micro-optimization; behavior must match exactly.

### C7. `pageEstimation.getEstimatedPagePosition` recomputes the same array twice

**Finding.** [src/services/pageEstimation.ts](src/services/pageEstimation.ts#L116-L150) maps to `pageCounts`, slices and reduces twice (once for `previousPages`, once for `total`), with two `reduce` passes.

**Change.** One forward loop building `previousPages`, `pageInSection`, `total` in a single pass. Pure simplification — same output.

### C8. `restoreAnchor` paginated path duplicates page-from-rect math

**Finding.** [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts) `restoreAnchor` and `renderPaginated` both compute `Math.floor((rect.left - hostRect.left) / dims.pageWidth)` style page indexing.

**Change.** After B6 (`applyPaginatedLayout`), a thin `pageForAnchorRect(host, dims, rect)` helper in `paginated.ts` can be used by both. Defer until B6 lands.

---

## Group D — Larger architecture choices (judgement calls)

### D1. Layering inversion: `services` imports from `components`

**Finding.**

- [src/services/pageEstimation.ts](src/services/pageEstimation.ts#L3-L12) imports from `../components/sectionViewer/anchor`, `../components/sectionViewer/paginated`, and `../components/sectionViewer/shadowHost`.
- [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts#L9) imports `PageViewport` from `../../services/pageEstimation`.

Conceptually, `services` should not depend on `components`. The reason it does is that `measurePageMap` needs the same shadow-host/anchor primitives that the viewer uses.

**Change.** Move the lowest-level DOM helpers (`initShadowHost`, `setSectionContent`, `waitForContentLayout`, `measureLogicalContentHeight`, `nextAnimationFrame`, `getColDims`, `getTopmostVisibleAnchor`, `findNodeAtOffset`) out of `src/components/sectionViewer/` into a non-React location, e.g. `src/reader/shadowHost.ts`, `src/reader/anchor.ts`, `src/reader/paginated.ts`. Then both the viewer (a component) and `pageEstimation` (a service) depend downward into `src/reader/*`.

`PageViewport` belongs in `src/types/bookPages.ts` or a new `src/types/reader.ts`, not in `pageEstimation`.

**Risk.** Mostly mechanical (path updates). Worth doing **before** C2/C3 because it reduces the surface area of those files.

### D2. `bookExtractor` depends on `pageEstimation`

**Finding.** [src/services/bookExtractor.ts](src/services/bookExtractor.ts#L4) imports `getPlainTextLength` from `./pageEstimation`. Extraction conceptually does not estimate pages; it only measures plain-text length.

**Change.** Move `getPlainTextLength` to `src/utils/htmlText.ts` (next to `htmlReferences.ts`). Both `bookExtractor` and `pageEstimation` import it from there.

**Risk.** Tiny.

### D3. Reader-page "many useStates, many saveReadingState calls" pattern

**Finding.** [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx) has nine independent `useState`s and a handful of callbacks that each fire `saveReadingState` with one field. This is workable but produces:

- ad-hoc serialization order (theme can be written by zoomIn at the same time scrolled-mode autosave is writing position),
- repeated `if (bookId) saveReadingState(bookId, …)` boilerplate.

**Change.** Two options, in increasing scope:

1. Wrap persistence behind a `useReaderPersistence(bookId)` hook returning `{ saveTheme, saveZoom, saveMode, savePosition }`. Each one no-ops without `bookId`. This removes the `if (bookId)` guards and makes save sites obvious. Recommended.
2. (Larger) Consolidate `zoom`/`mode`/`theme`/`lastLocation` into a single `readerState` reducer with persistence as a side-effect of dispatch. This is the textbook React pattern but adds indirection; only do it if option 1 still feels noisy after C3.

### D4. Defer SectionViewer rewrite

Same conclusion as PLAN.md Step 9. After B6, B8, C2, D1, the hook should be ~30% smaller and an extraction (viewport reporting, scrolled mounting, paginated rendering) can be re-evaluated.

---

## Group E — Non-standard React / SPA hygiene

### E1. `BookCard` is a clickable `<div>` with hover-only buttons

**Finding.** [src/components/BookCard.tsx](src/components/BookCard.tsx#L120-L168):

- `<Card onClick={...}>` is a `<div>` (not keyboard reachable).
- `RemoveButton` and `ClearCacheButton` rely on `opacity: 0` until parent `:hover` (not focus-visible).
- No `aria-label` on the action buttons (only `title`).

**Change.**

- Convert `Card` to a `<button type="button">` (or render the cover content inside a real `<button>` that fills the card area).
- Show action buttons on `:hover, :focus-within`.
- Add `aria-label="Remove …"` / `aria-label="Clear cache for …"` on the action buttons.

**Risk.** Visual: button defaults need a CSS reset. Behavior: ensure `stopPropagation` in the action-button handlers still works once the parent is a button (it does).

### E2. `confirm` / `alert` in HomePage

**Finding.** [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L210-L245) calls `confirm` and `alert` directly.

**Change.** Defer until a small shared dialog primitive exists. In the meantime, do **not** remove confirmations.

### E3. Repeated button styles

**Finding.** Five+ near-identical button styled components: [src/components/FilePicker.tsx](src/components/FilePicker.tsx#L14-L43), [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L46-L75) (`ClearCachedBooksButton`), [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L115-L138) (`ThemeButton`), [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L107-L126) (`Button`), [src/components/sectionViewer/SectionViewer.tsx](src/components/sectionViewer/SectionViewer.tsx#L28-L52) (`NavButton`).

**Change.** Introduce `Button`/`IconButton` primitives in `src/components/ui/`. Re-skin only after C3 lands, otherwise the diff lands in the middle of a moving target.

### E4. Hard-coded colors that ignore theme

**Finding.** [src/components/sectionViewer/SectionViewer.tsx](src/components/sectionViewer/SectionViewer.tsx) `NavButton` uses `rgba(0,0,0,0.4)`; [src/components/BookCard.tsx](src/components/BookCard.tsx) `RemoveButton` uses `rgba(0,0,0,0.6)` and `rgba(220,38,38,0.9)`.

**Change.** Add `--overlay`, `--overlay-strong`, `--danger` CSS variables in [src/styles/GlobalStyles.tsx](src/styles/GlobalStyles.tsx) (light + dark blocks). Replace literal rgba values.

### E5. GlobalStyles repeats variable blocks

**Finding.** [src/styles/GlobalStyles.tsx](src/styles/GlobalStyles.tsx) declares the same light values in both `:root` and `html[data-theme="light"]`, and dark values in both `@media (prefers-color-scheme: dark)` and `html[data-theme="dark"]`.

**Change.** Put the **light** palette only in `:root` (as default). Override with `@media (prefers-color-scheme: dark) and :root:not([data-theme])`. Then `html[data-theme="dark"]` overrides for the explicit choice and `html[data-theme="light"]` is unnecessary. Net: one block of light, one media query for system dark, one explicit-dark block.

**Risk.** Verify both themes still apply correctly on first load and after toggling.

---

## Group F — Project metadata leftovers (already in PLAN.md)

PLAN.md Step 7 covers:

- Default Vite [readme.md](readme.md) → replace with project-specific content.
- Unused `@capacitor/cli`, `@capacitor/core` in [package.json](package.json#L13-L14).
- Redundant `@emotion/babel-plugin` next to `@swc/plugin-emotion`.
- PWA `includeAssets: ["favicon.svg", "icons/*.png"]` does not match the SVG icons in [public/icons/](public/icons).

PLAN2 does not restate these; treat PLAN.md Step 7 as the source of truth for that batch.

---

## Suggested execution order

The order is chosen so each step lands on a stable baseline.

1. **A1, A2, A3, A4** — dead-export and dead-route cleanup.
2. **B1, B3, C5, C7** — pure helper consolidation; no behavior change.
3. **D2, D1** — layering fixes (move `getPlainTextLength`, then move shadow/anchor/paginated primitives out of `components`).
4. **B2, B4** — relocate EPUB metadata extraction; share blob→data-URL helper.
5. **B5, B7** — viewport-equal helper + `useAppTheme`.
6. **C4** — fix the latent theme-clobber bug in `saveReadingState`.
7. **C3 (presentational extractions only)** — ReaderToolbar, ReaderSidebar, TocList.
8. **B6** — share paginated layout block between measurement and live render. _This is the highest-payoff and highest-risk step; do it only with at least manual coverage on a reflowable + fixed-layout book._
9. **C2, B8** — collapse ref soup, deduplicate scrolled visibility logic.
10. **C3 (hook extractions)** — `useBookExtraction`, `usePageMap`, then `useReaderPersistence` (D3 option 1).
11. **E1, E4, E5** — accessibility + theme-variable simplification.
12. **E3** — button primitives.
13. **C1 option 2** — DOMParser-based asset reference scan. Only with test coverage in place.
14. **C6** — querySelector micro-optimizations.
15. **C8** — `pageForAnchorRect` helper.

---

## Constraints to preserve through every step

These come from [.github/copilot-instructions.md](.github/copilot-instructions.md) and PLAN.md, restated as a checklist:

- Local-first. No uploads, server storage, cloud sync, remote EPUB processing.
- PWA caches app shell only, never user EPUB content.
- Cache reload restores section Blobs in batches with visible progress (`RESTORE_BATCH_SIZE = 8`).
- Off-screen page measurement must not set images to `loading="lazy"` while awaiting load/error.
- `SectionViewer` must report wrapper viewport dimensions independently of paginated render completion.
- Asset rewriting must preserve `src`, `srcset`, `href`, `poster`, `data`, `xlink:href`, CSS `url(...)`, fragments, and `./` path variants.
- Never persist extracted section HTML containing browser-local `blob:` URLs.
- `epubjs` is opened with `replacements: "none"`; `resources.replaceCss` and `spine.hooks.serialize` must remain neutralized.
- Reader position saves stay atomic and survive mode-switch races.
- Keep `epubjs` adapter types narrow at the boundary; do not let `any` leak.
