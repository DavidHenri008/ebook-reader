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

- **Theme (light/dark)**       | Already modelled in `ReadingState.theme`; inject CSS vars into Shadow DOM on theme change.

---

## Phase 7 — Scrolled Mode Lazy-Loading Optimizations

**Goal:** Keep scrolled mode responsive for very large books by bounding mounted DOM size and deferring expensive work until content is near the viewport.

### Changes

1. **Virtualize mounted sections in `src/components/SectionViewer.tsx`:**
   - Keep only the visible section plus a small buffer, for example current ±2 sections.
   - Unmount sections that move far outside the viewport.
   - Preserve scroll position when removing sections above the viewport by replacing their DOM with height placeholders or adjusting `scrollTop` by the removed height.

2. **Track mounted section measurements:**
   - Store measured heights by section index after each section lays out.
   - Reuse measured heights when temporarily replacing removed sections with placeholders.
   - Invalidate affected measurements when zoom changes, mode changes, or section content is re-rendered.

3. **Improve image loading behavior:**
   - Add `loading="lazy"` and `decoding="async"` to images injected into scrolled sections where safe.
   - Avoid awaiting image decode for sections that are not near the viewport.
   - Run layout stabilization only for sections that are visible or within the preload buffer.

4. **Throttle expensive anchor work:**
   - Keep the existing debounced persistence path, but avoid full text-node walks on every scroll event.
   - Use the topmost visible mounted section as the search root before falling back to the whole flow.
   - Consider `requestIdleCallback` for non-critical position updates during fast scrolling.

5. **Add defensive cleanup:**
   - Disconnect observers and cancel pending animation/layout work when switching mode, changing books, or unmounting the component.
   - Ensure placeholders, sentinels, and mounted-range refs cannot drift out of sync after rapid scrolling.

### Verification

1. Long book in scrolled mode keeps only the visible section buffer mounted in the DOM.
2. Scrolling forward and backward does not jump when old sections are removed or remounted.
3. Memory usage remains roughly bounded after scrolling through many sections.
4. Image-heavy sections load smoothly without blocking unrelated off-screen sections.
5. Rapid mode toggles, zoom changes, and TOC jumps do not leave stale sentinels, placeholders, or observers behind.

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
