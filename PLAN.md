# EPUB Reader — Reflowable Architecture Rewrite Plan

## Background & Problem

The existing reader uses a **fixed-page-size + pre-measured pagination** architecture:

- On every book open, the full EPUB is extracted and each section is rendered into a hidden off-screen Shadow DOM to measure page counts using CSS multi-column layout.
- Page size is stored per-cache entry, so any change to width/height invalidates the cache and re-triggers a full re-measurement.
- Zoom is applied via `transform: scale()`, which magnifies the already-laid-out columns — causing page overlap, scrollbar scaling artifacts, and no actual text reflow.
- Scrolled mode renders every page of the entire book into a single Shadow DOM upfront, making the mode toggle extremely slow for large books.

## Architecture Decision

Replace the fixed-page-size model with a **reflowable, viewport-driven** one.

### Locked Decisions

| Concern              | Decision                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Width selector**   | Removed. Reading area = container width. User resizes window/sidebar.                                                                              |
| **Zoom**             | CSS `zoom` property applied inside the Shadow DOM. Real reflow. Scales text + images. Scrollbar lives on the outer container and is unaffected.    |
| **Pagination**       | Lazy, per-section. Only the current section (±1 prefetch) is measured and rendered.                                                                |
| **Scrolled mode**    | Raw section HTML, vertically flowed. No precomputation.                                                                                            |
| **Reading position** | `{ sectionIndex: number, anchor: number }` — anchor is a character offset into the section's plain text. Survives zoom, resize, and re-extraction. |
| **Total page count** | Background-computed approximation. Shown as `Section X · ~page Y of ~Z`.                                                                           |
| **Cache**            | Raw HTML only, keyed by `bookId`. Never invalidated by size or zoom changes.                                                                       |

### Why CSS `zoom` over `transform: scale`

- `transform: scale()` magnifies pixels — no reflow, content overflows its layout box, scrollbar scales with the content (the existing bug).
- `font-size` changes reflow text but don't scale images.
- `CSS zoom` (standardized in all major browsers as of 2024) reflows the entire subtree — text wraps, images resize, and the outer scroll container's scrollbar is untouched because it operates outside the zoomed subtree.

---

## Phase 1 — Cache Simplification _(foundation)_

**Goal:** Extraction runs once per book ever. The cache has no concept of page size.

### Changes

1. **`src/types/bookPages.ts`** — replace all existing types with slim raw types:
   - `RawSection { index, href, html }` — no `pageCount`.
   - `RawExtractedBook { bookId, sections: RawSection[], extractedAt }` — no `pageSize`, `totalPages`.
   - Delete `PageSize`, `ExtractedSection`, `ExtractedBook`, `PagePreset`, `PAGE_PRESETS`, `DEFAULT_PAGE_SIZE`.

2. **`src/storage/bookCache.ts`** — bump DB to v2:
   - Single store `extracted-books-raw` keyed by `bookId`.
   - `upgrade()`: if `oldVersion < 2`, delete the legacy `extracted-books` store.
   - Replace `saveExtractedBook` / `loadExtractedBook` with `saveRawBook` / `loadRawBook`.
   - Delete `deleteExtractedBook` (replace with `deleteRawBook`).

3. **`src/services/bookExtractor.ts`**:
   - Replace `extractBook` with `extractRawBook(fileData, bookId, onProgress) → { raw: RawExtractedBook, toc: TocItem[] }`.
   - Delete `measurePageCount`, `remeasurePages`, `resolveGlobalPage`.
   - Rename `globalPageForHref` → `sectionIndexForHref(sections, href) → number` (returns section index, not a global page).

### Verification

1. First open of a book: extraction progress shown, raw HTML stored in IDB.
2. Second open: no extraction logs, opens instantly.
3. DevTools → Application → IndexedDB shows only `extracted-books-raw` store at DB v2.

---

## Phase 2 — Position Model _(parallel with Phase 1)_

**Goal:** Reading positions survive zoom, viewport resize, and re-extraction.

### Changes

1. **`src/types/storage.ts`** — change `ReadingState`:
   - Replace `lastLocationCfi?: string` with `lastLocation?: { sectionIndex: number; anchor: number }`.
   - Keep `zoom: number` (still meaningful — controls CSS zoom level).
   - Remove any `pageSize` / `pageWidth` fields (not needed).

2. **`src/storage/readingState.ts`**:
   - Update `defaultReadingState` to use `lastLocation: undefined`.
   - In `loadReadingState`, add a migration shim: if the stored record has `lastLocationCfi` but no `lastLocation`, map to `{ sectionIndex: 0, anchor: 0 }` as a safe fallback.
   - Update `saveReadingState` to write `lastLocation`.

### Verification

1. Existing reading state in IDB does not throw on load — falls back to `{sectionIndex: 0, anchor: 0}`.
2. After Phase 3, reopening a book resumes within ~1 line of the saved anchor.

---

## Phase 3A — Create `SectionViewer` Component _(depends on Phases 1–2)_

**Goal:** Create `src/components/SectionViewer.tsx` only. No other files are modified. Keeping this phase purely additive makes it fit within one response.

### New file: `src/components/SectionViewer.tsx`

#### Props

```ts
interface SectionViewerProps {
  sections: RawSection[];
  bookId: string;
  currentSection: number;
  anchor: number;
  zoom: number; // 20–400, maps to CSS zoom = zoom/100
  mode: "paginated" | "scrolled";
  onPositionChange: (pos: { sectionIndex: number; anchor: number }) => void;
  onNavigate?: (sectionIndex: number) => void;
}
```

#### Outer wrapper

- Flex container, owns the scrollbar in scrolled mode; clips in paginated mode.
- `ResizeObserver` watches its own client dimensions.

#### Shadow DOM host

- Single `<div>` whose shadow root contains:
  - `:host { zoom: <zoom/100>; }` — scales everything inside; outer scrollbar unaffected.
  - An injected `<style>` for safe image sizing: `img, svg { max-width: 100%; height: auto; }`.

#### Column-dimension math (key insight)

Because CSS `zoom` rescales the layout box, the _logical_ dimensions for column layout must be divided by the zoom factor:

```
colWidth  = wrapper.clientWidth  / (zoom / 100)
colHeight = wrapper.clientHeight / (zoom / 100)
```

This keeps column widths in the zoomed coordinate space, so `scrollWidth / colWidth` gives the correct page count.

#### Paginated mode

1. Inject section HTML in a `.cols` div: `column-width: ${colWidth}px; column-gap: 0; column-fill: auto; width: ${colWidth}px; height: ${colHeight}px; overflow: hidden`.
2. After layout: `pageCount = ceil(scrollWidth / colWidth)`.
3. Translate `.cols` by `-pageInSection * colWidth` to show the current page.
4. `prev`: if `pageInSection > 0` go to previous column; else jump to last page of previous section.
5. `next`: if `pageInSection < pageCount - 1` go to next column; else jump to first page of next section.
6. Prefetch: the adjacent sections (prev/next) are rendered off-screen so section-boundary navigation is instant.

#### Scrolled mode

1. Plain `.flow` div containing current section HTML, `width: 100%`.
2. Outer wrapper has `overflow-y: auto`.
3. `IntersectionObserver` on sentinel elements near the top and bottom mounts the previous and next sections lazily as the user scrolls near section edges.
4. Each mounted section is its own Shadow DOM subtree so styles don't bleed between sections.

#### Anchor tracking

- `saveAnchor()`: walk text nodes in the rendered content to find the character offset of the topmost visible glyph. Persist `{sectionIndex, anchor}` debounced (300ms) on scroll/page-flip.
- `restoreAnchor()`: walk text nodes to find the node at `anchor`, then:
  - _Paginated:_ `getBoundingClientRect()` → compute which column it falls in → set page.
  - _Scrolled:_ `element.scrollIntoView({ block: 'start' })`.
- `restoreAnchor()` is called after: mount, zoom change, resize, mode toggle.

#### Zoom changes

- Update `:host { zoom }` in the shadow style sheet.
- Both paginated and scrolled modes reflow automatically.
- Re-run `restoreAnchor()` to stay on the same content.

#### Resize (`ResizeObserver`)

- Triggers the same flow as a zoom change: re-paginate current section, re-run `restoreAnchor()`.

#### Mode toggle

- Swap which renderer (paginated `.cols` or scrolled `.flow`) is active inside the same shadow root. No destroy/recreate → instant toggle.

#### Image-only pages (fallback)

- If no text anchor is available in the current view, fall back to storing the nearest element `id` attribute or spine element index.

### Verification

1. `npx tsc -p tsconfig.app.json --noEmit` passes with the new file present.
2. Existing app still uses `PageViewer` — no regressions until Phase 3B.

---

## Phase 3B — Wire `SectionViewer` into the App _(depends on Phase 3A)_

**Goal:** Replace every reference to `PageViewer` with `SectionViewer`, update the state model in `ReaderPage`, and delete the old component.

### Changes

1. **`src/components/index.ts`** — export `SectionViewer` instead of `PageViewer`.

2. **`src/pages/ReaderPage.tsx`**:
   - Replace `<PageViewer>` with `<SectionViewer>`.
   - Replace `currentPage` / `totalPages` state with `currentSection` / `anchor`.
   - Pass `onPositionChange` which calls `saveReadingState`.
   - TOC navigation: call `sectionIndexForHref` from `bookExtractor.ts` (already imported).
   - Remove `pageSize` state and `PAGE_PRESETS` imports entirely.
   - Remove page-size `<Select>` from toolbar.

3. **Delete `src/components/PageViewer.tsx`**.

### Verification

1. Image-heavy book: text + images zoom together; scrollbar is unaffected at any zoom level.
2. Toggle paginated ↔ scrolled rapidly: instant, no freeze.
3. Resize window: current section re-paginates in <100ms; reading position preserved within ~1 line.
4. Zoom in/out: no page-overlap artifacts at any level.
5. Close and reopen: resumes within ~1 line of saved anchor.
6. Memory profiler: only current ±1 sections live in DOM at any time.

---

## Phase 4 — Toolbar Cleanup _(depends on Phase 3B)_

### Changes to `src/pages/ReaderPage.tsx`

- Remove `Select` (page-size picker) and all `pageSize` / `PAGE_PRESETS` state.
- Keep: zoom `−` / `+` buttons (or convert to a slider), mode toggle, section/page indicator.
- Update page indicator label to `Section X · ~page Y of ~Z`.
- Clean up unused styled components (`Select`, `ProgressText` if replaced).

### Verification

1. Toolbar shows only zoom + mode toggle + section/page indicator — no size picker.
2. `tsc --noEmit` and `eslint .` pass clean.

---

## Phase 5 — Legacy Cleanup _(parallel with Phase 5)_

### Files to delete

- `src/components/EpubViewer.tsx`
- `src/components/EpubViewerOld.tsx`
- `src/pages/ReaderPageOld.tsx`

### Other changes

- Remove their exports from `src/components/index.ts` and `src/pages/index.ts`.
- Add a **"Clear cached books"** button in `src/pages/HomePage.tsx` that calls `indexedDB.deleteDatabase('epub-reader-pages')` then reloads. Useful for manual recovery and dev iteration.

### Verification

1. `git grep "EpubViewer\|PageViewer\|ReaderPageOld\|PAGE_PRESETS\|DEFAULT_PAGE_SIZE"` returns nothing.
2. `npm run build` succeeds with no errors.

---

## Phase 6 — Future Enhancements _(out of scope for this rewrite)_

- **Theme (light/dark)** | Already modelled in `ReadingState.theme`; inject CSS vars into Shadow DOM on theme change.

---

## Phase 7A — Section Virtualization _(scrolled mode)_

**Goal:** Bound the number of sections mounted in the DOM so memory stays roughly constant regardless of how far the user scrolls.

### Changes to `src/components/SectionViewer.tsx`

1. Define a `BUFFER = 2` constant. At any time, keep only sections in the range `[visibleSection - BUFFER, visibleSection + BUFFER]` mounted inside `.flow`.
2. After mounting a new adjacent section, check whether the opposite end of the mounted range now exceeds the buffer. If so, **unmount** the farthest section:
   - When removing a section **above** the viewport, replace its DOM node with a `<div class="flow-placeholder" data-section-index="…" style="height:${measuredHeight}px">` so the scroll position is preserved. Adjust `wrapper.scrollTop` by `(placeholder.offsetHeight - removedHeight)` if there is any rounding discrepancy.
   - When removing a section **below** the viewport, simply remove the node (no scroll compensation needed).
3. Update `mountedRangeRef` after each removal.
4. When the sentinel for a section that was previously unmounted becomes visible again, remove the placeholder and re-mount the full section in its place, compensating `scrollTop` the same way.

### Verification

1. Open a long book in scrolled mode. After scrolling forward through > 5 sections, DOM contains at most `2 * BUFFER + 1 = 5` section wrappers.
2. Scrolling back through already-visited sections re-mounts them without a visible jump.
3. `mountedRangeRef` never contains stale indices after rapid forward/backward scrolling.

---

## Phase 7B — Section Height Cache _(depends on Phase 7A)_

**Goal:** Make placeholder heights accurate by recording each section's rendered height after layout, and keep those measurements consistent when zoom or content changes.

### Changes to `src/components/SectionViewer.tsx`

1. Add a `sectionHeightCacheRef = useRef<Map<number, number>>(new Map())` to store measured heights keyed by section index.
2. After `waitForContentLayout` resolves for a scrolled section, record its `offsetHeight` in the cache.
3. When creating a placeholder for a removed section, look up its cached height. If not cached, use a reasonable fallback (e.g. `wrapper.clientHeight`) until the section is re-mounted and re-measured.
4. Invalidate the entire cache when:
   - `zoom` changes (layout dimensions change).
   - `mode` changes to scrolled (fresh render, old measurements are meaningless).
   - The component unmounts.
5. Do **not** invalidate individual entries when an unrelated section is re-rendered.

### Verification

1. After scrolling through several sections each gets an entry in the height cache.
2. Removing and re-inserting a placeholder uses the cached height — the page does not jump.
3. Changing zoom clears the cache; re-scrolling re-populates it with updated values.

---

## Phase 7C — Lazy Image Loading in Scrolled Mode _(depends on Phase 7A)_

**Goal:** Prevent off-screen section images from blocking layout stabilization and consuming bandwidth before the user reaches them.

### Changes to `src/components/SectionViewer.tsx`

1. In `createScrolledSection`, after `setSectionContent` populates the wrapper, iterate over all `<img>` elements inside it and set:
   - `img.loading = "lazy"` — browser defers network fetch until the image is near the viewport.
   - `img.decoding = "async"` — browser decodes off the main thread.
2. In `waitForContentLayout`, add a parameter `isNearViewport: boolean`. When `false`, skip awaiting image load/decode events entirely (the function still waits for fonts and two animation frames, but does not block on images).
3. Call `waitForContentLayout(section, /* isNearViewport= */ true)` only for the **initial** section and for sections mounted within `BUFFER = 1` of the current viewport. Sections at the outer edge of the preload buffer (`BUFFER = 2`) use `isNearViewport = false`.

### Verification

1. Network tab shows images in buffer-edge sections not fetched until scrolled closer.
2. The visible section still waits for images before snapping layout.
3. `estimateTotalPages` (off-screen measurement) is unaffected — it already renders in a hidden container that is not governed by `createScrolledSection`.

---

## Phase 7D — Anchor-Save Throttling _(depends on Phase 7A)_

**Goal:** Reduce main-thread cost during fast scrolling by avoiding redundant full-document text-node walks.

### Changes to `src/components/SectionViewer.tsx`

1. In `saveAnchor`, before calling `getTopmostVisibleAnchor` on the whole flow, first call `getTopmostVisibleSection` to identify the topmost visible section wrapper. Pass **that element** as the root to `getTopmostVisibleAnchor` instead of `flowRef.current`. Fall back to the full flow only if no section wrapper is visible.
2. Wrap the `onPositionChange` persistence call (the `setTimeout` at 300 ms) with `requestIdleCallback` where available, so the write is deferred until the browser is idle:
   ```ts
   const persist = () =>
     onPositionChangeRef.current({ sectionIndex, anchor: newAnchor });
   if (typeof requestIdleCallback !== "undefined") {
     requestIdleCallback(persist, { timeout: 1000 });
   } else {
     setTimeout(persist, 300);
   }
   ```
3. Cancel any pending `requestIdleCallback` handle (alongside the existing `saveTimerRef` cancel) when `saveAnchor` is called again before the callback fires.

### Verification

1. DevTools Performance trace during fast scroll shows no long tasks attributable to text-node walks.
2. Position is still persisted within ~1 second of the user stopping.
3. Changing section via TOC still calls `onPositionChange` promptly (idle callback has a 1 s timeout).

---

## Phase 7E — Defensive Observer & Ref Cleanup _(depends on Phases 7A–7D)_

**Goal:** Ensure no stale observers, placeholders, idle callbacks, or ref values survive across mode toggles, book changes, or rapid TOC jumps.

### Changes to `src/components/SectionViewer.tsx`

1. Extract a `teardownScrolled()` helper that:
   - Disconnects and nulls `intersectObserverRef`.
   - Nulls `topSentinelRef` and `bottomSentinelRef`.
   - Cancels any pending `requestIdleCallback` handles and `saveTimerRef`.
   - Clears `.flow` children.
   - Resets `mountedRangeRef` to `{ first: currentSection, last: currentSection }`.
2. Call `teardownScrolled()` at the top of `renderScrolled` (before creating new sentinels) and at the top of the `mode → paginated` branch in the mode-change effect.
3. In the component unmount cleanup (the `return` of the mount `useEffect`), call `teardownScrolled()` and also disconnect the `ResizeObserver`.
4. After a TOC jump (`currentSection` prop change) in scrolled mode, call `teardownScrolled()` before calling `renderScrolled(newSection)` so no stale sentinels from the previous position remain.
5. Guard every sentinel `IntersectionObserver` callback with a `renderId` check identical to the one already used in `renderPaginated`, so a callback fired for a stale render cycle is silently dropped.

### Verification

1. Toggling mode 10 times rapidly leaves exactly one `IntersectionObserver` connected.
2. Jumping via TOC while mid-scroll does not leave orphaned sentinels or placeholders in the DOM.
3. Unmounting the component (navigating back to library) leaves no active timers or observers (verify via a `console.warn` stub on `setTimeout` / `observe` after unmount).

---

## Risks & Mitigations

| Risk                                                   | Mitigation                                                                                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS `zoom` browser support                             | All major browsers support it as of 2024. If a niche browser lacks it, fall back to `transform: scale` on inner content + a compensating outer wrapper (more complex; only do if needed). |
| Image-only pages have no text anchor                   | Fallback to nearest element `id` or spine element index for anchor storage.                                                                                                               |
| ResizeObserver + zoom changes piling up estimator runs | Estimator returns a `cancel()` handle; ReaderPage cancels before restarting.                                                                                                              |
| Anchor accuracy after section re-render                | Anchor is a character offset into text content — not layout-dependent. Since raw HTML is cached permanently and never regenerated, offsets remain valid indefinitely.                     |
| Section-boundary page navigation latency               | ±1 sections are prefetched and pre-measured off-screen in paginated mode, so cross-section page flips are instant.                                                                        |

---

## File Map

```
src/
  types/
    bookPages.ts          Phase 1 — slim to RawSection + RawExtractedBook
    storage.ts            Phase 2 — lastLocation replaces lastLocationCfi
  storage/
    bookCache.ts          Phase 1 — DB v2, single raw store
    readingState.ts       Phase 2 — migration shim + new field
  services/
    bookExtractor.ts      Phase 1 — extractRawBook, sectionIndexForHref
  components/
    SectionViewer.tsx     Phase 3A+7 — NEW; scrolled-mode virtualization optimizations
    PageViewer.tsx        Phase 3B — DELETED
    EpubViewer.tsx        Phase 5 — DELETED
    EpubViewerOld.tsx     Phase 5 — DELETED
    index.ts              Phase 3B+5 — export SectionViewer; remove deleted
  pages:
    ReaderPage.tsx        Phase 3B+4 — full rewire
    ReaderPageOld.tsx     Phase 5 — DELETED
    HomePage.tsx          Phase 5 — add Clear cache button
```
