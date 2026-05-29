# EPUB Reader Improvement Plan

This plan is based on a read-only audit of the current React/TypeScript/Vite app. No application code changes are included here.

## Audit Snapshot

- `npm run lint` passes with the existing ESLint config.
- `npx tsc -p tsconfig.app.json --noEmit --pretty false` passes.
- No test files were found (`*.test.*`, `*.spec.*`, or `__tests__`).
- The working tree was clean before this file was added.
- A local `dist/` folder exists, but it is ignored by `.gitignore`; it does not need to be part of normal source cleanup.

## Main Findings

- The app is already a fairly standard small Vite SPA: [src/main.tsx](src/main.tsx), [src/App.tsx](src/App.tsx), page components under [src/pages](src/pages), reusable components under [src/components](src/components), services under [src/services](src/services), and IndexedDB wrappers under [src/storage](src/storage).
- There is little compiler-visible dead code because `strict`, `noUnusedLocals`, and `noUnusedParameters` are enabled in [tsconfig.app.json](tsconfig.app.json#L23-L29).
- The clearest cleanup opportunities are duplicate helpers, a wide public export surface, an oversized [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx), duplicated UI patterns, and a couple of template or dependency leftovers.
- Some complexity is intentional. EPUB extraction, Shadow DOM rendering, anchor measurement, cache restoration, and page estimation all contain edge-case handling that should be preserved unless covered by focused tests.

## Step 1: Consolidate Reading Location Normalization

Priority: high
Risk: low
Expected payoff: removes the most direct code repetition.

Evidence:

- [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L205-L219) defines `normalizeAnchor`, `normalizeSectionIndex`, and `clampSectionIndex`.
- [src/services/pageEstimation.ts](src/services/pageEstimation.ts#L61-L75) defines the same three helpers.

Plan:

1. Create a small shared helper module, for example `src/utils/readingLocation.ts`.
2. Move `normalizeAnchor`, `normalizeSectionIndex`, and `clampSectionIndex` there.
3. Import those helpers from [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx) and [src/services/pageEstimation.ts](src/services/pageEstimation.ts).
4. Keep behavior identical: anchors clamp to `>= 0`, section indexes truncate to integers and clamp to `>= 0`, empty section sets clamp to `0`.
5. Validate with `npm run lint` and the no-emit TypeScript command above.

Why this shape: these helpers are about persisted reader location, not only page estimation, so `src/utils` is a clearer home than exporting them from [src/services/pageEstimation.ts](src/services/pageEstimation.ts).

## Step 2: Recenter `epubjs` Boundary Outside Storage

Priority: high
Risk: medium
Expected payoff: cleaner architecture and less duplicated adapter logic.

Evidence:

- Project guidance says [src/services/bookExtractor.ts](src/services/bookExtractor.ts) is the `epubjs` boundary.
- [src/storage/library.ts](src/storage/library.ts#L1-L31) imports `epubjs`, defines metadata-specific adapter types, and has its own `disableEpubJsResourceSubstitution` helper.
- [src/services/bookExtractor.ts](src/services/bookExtractor.ts#L287-L291) has a similar `disableEpubJsResourceSubstitution` helper for extraction.

Plan:

1. Move EPUB metadata extraction out of [src/storage/library.ts](src/storage/library.ts) into a service module, such as `src/services/bookMetadata.ts`, or into [src/services/bookExtractor.ts](src/services/bookExtractor.ts) if keeping all `epubjs` adapters together is preferred.
2. Keep [src/storage/library.ts](src/storage/library.ts) focused on IndexedDB operations and `StoredBook` to `BookMeta` conversion.
3. Share or colocate the resource-substitution disabling logic so the metadata and extraction paths both preserve the current `replacements: "none"` behavior.
4. Preserve the current cover conversion behavior: cover blob URLs must become persistent data URLs before `book.destroy()`.
5. Validate by importing a new EPUB, reopening an existing cached EPUB, and checking that no temporary `blob:` URLs are persisted.

Do not regress these known constraints:

- Keep `epubjs` opened with `replacements: "none"`.
- Keep the serialize hook clearing/resource substitution override.
- Keep visible progress during full extraction.

## Step 3: Split `ReaderPage` Into Smaller Units

Priority: high
Risk: medium
Expected payoff: improves maintainability without changing the rendering engine.

Evidence:

- [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx) combines route-state handling, book title canonicalization, cache loading, extraction, reading-state persistence, theme control, page-map measurement, TOC rendering, toolbar rendering, and reader layout.
- The file also owns many styled components at [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L29-L188) and a recursive `TocList` at [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L222-L249).

Plan:

1. Extract presentational pieces first:
   - `ReaderToolbar` for back navigation, title, mode, zoom, and theme controls.
   - `ReaderSidebar` and `TocList` for contents and page position.
   - `ReaderProgress` for extraction/cache progress.
2. Extract orchestration only after the UI split is stable:
   - `useReaderBookLoader` for `loadRawBook`, `extractRawBook`, progress text, and deferred cache save.
   - `useReaderTheme` for root `data-theme`, local storage, and reading-state theme persistence.
   - `usePageMeasurement` for viewport tracking, measured page-map invalidation, and fallback estimated page position.
3. Keep [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx) as the page-level coordinator that wires hooks and components together.
4. Avoid introducing a reducer until the extracted hooks show a real need for one. A reducer would add indirection before the state boundaries are clearer.
5. Validate scrolled mode, paginated mode, mode switching, zoom changes, cache load progress, extraction progress, TOC navigation, and canonical reader URLs.

## Step 4: Audit And Narrow Implementation-Only Exports

Priority: medium
Risk: low
Expected payoff: removes dead public API surface and makes module ownership clearer.

Evidence:

- [src/services/pageEstimation.ts](src/services/pageEstimation.ts#L14-L58) exports `BASE_CHARS_PER_PAGE` and `estimateCharsPerPage`, but current app usage only needs them inside that module.
- [src/storage/readingState.ts](src/storage/readingState.ts#L8-L13) exports `defaultReadingState`, but current app code only uses it inside that module.
- [src/utils/bookTitleUrl.ts](src/utils/bookTitleUrl.ts#L11-L13) exports `bookTitleToUrlSegment`, but current app code calls `readerPathForBookTitle` instead.
- [src/components/sectionViewer/anchor.ts](src/components/sectionViewer/anchor.ts#L6-L9) exports `isReadableTextNode`, but it is only used inside that file.
- [src/components/sectionViewer/shadowHost.ts](src/components/sectionViewer/shadowHost.ts#L7-L15) exports `THEME_CSS`, but it is only used by `buildHostStyle`.
- [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts#L47-L54) exports `UseSectionViewerResult`, but it is not imported elsewhere.

Plan:

1. Decide which modules have an intentional public API and which are implementation files.
2. Remove `export` from implementation-only constants, helpers, and interfaces where TypeScript still infers call-site types cleanly.
3. Keep exports that are cross-file dependencies, such as `getColDims`, `setSectionContent`, `waitForContentLayout`, and `measureLogicalContentHeight`.
4. If tests are added first, keep helper exports only when the tests genuinely need them; otherwise test through public behavior.
5. Validate with lint and no-emit TypeScript.

## Step 5: Normalize Theme And Button Patterns

Priority: medium
Risk: medium
Expected payoff: more standard React app style and less duplicated UI code.

Evidence:

- [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L149-L163) and [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L255-L260) both initialize theme from navigation/local storage.
- [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L156-L160) and [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L386-L389) both write `document.documentElement.dataset.theme`.
- Button styles are repeated across [src/components/FilePicker.tsx](src/components/FilePicker.tsx#L14-L43), [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L46-L75), [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L115-L138), [src/pages/ReaderPage.tsx](src/pages/ReaderPage.tsx#L107-L126), and [src/components/sectionViewer/SectionViewer.tsx](src/components/sectionViewer/SectionViewer.tsx#L28-L52).

Plan:

1. Introduce a small `useTheme` hook that owns the app theme value, root `data-theme` updates, and local storage writes.
2. Keep book-specific reading-state persistence in reader-specific code; do not hide IndexedDB writes inside a generic theme hook unless the hook is explicitly reader-scoped.
3. Add lightweight shared button primitives only if they reduce duplication without forcing all buttons into one visual style. Likely candidates: `Button`, `IconButton`, and `ToolbarButton`.
4. Keep page-specific layout styles near the page components.
5. Validate keyboard focus styles, disabled states, and dark/light theme switching on both pages.

## Step 6: Improve Interaction Accessibility And Standard SPA UX

Priority: medium
Risk: medium
Expected payoff: better keyboard and assistive-technology behavior.

Evidence:

- [src/components/BookCard.tsx](src/components/BookCard.tsx#L5-L18) uses a clickable `div` for opening a book.
- [src/components/BookCard.tsx](src/components/BookCard.tsx#L68-L112) uses hover-revealed action buttons with text glyphs.
- [src/pages/HomePage.tsx](src/pages/HomePage.tsx#L210-L245) uses browser `confirm` and `alert` for destructive and error flows.

Plan:

1. Make book opening keyboard-accessible, either by converting the primary book action to a real button/link or by adding proper role, tab index, and key handling.
2. Give remove and clear-cache actions stable accessible labels and focus-visible behavior, not only hover visibility.
3. Consider replacing browser dialogs with small in-app confirm/error dialogs once a shared dialog pattern exists.
4. Keep destructive confirmations explicit; do not remove the confirmation behavior.
5. Validate with keyboard-only navigation through the library page.

## Step 7: Clean Project Metadata And Dependencies

Priority: medium
Risk: low to medium
Expected payoff: reduces template leftovers and dependency confusion.

Evidence:

- [readme.md](readme.md) is still the default React + TypeScript + Vite template text.
- [package.json](package.json#L13-L14) lists `@capacitor/cli` and `@capacitor/core`, but there is no `capacitor.config.*` and no source imports.
- [package.json](package.json#L24-L26) lists both `@emotion/babel-plugin` and `@swc/plugin-emotion`; the Vite config uses the SWC plugin at [vite.config.ts](vite.config.ts#L9-L18).
- [vite.config.ts](vite.config.ts#L22-L23) has `includeAssets: ["favicon.svg", "icons/*.png"]`, while the checked-in icons are SVG files.

Plan:

1. Replace [readme.md](readme.md) with project-specific setup, scripts, local-first behavior, and PWA/cache notes.
2. Decide whether Capacitor support is actually planned. If not, remove the direct Capacitor dependencies and update the lockfile.
3. Decide whether `@emotion/babel-plugin` should remain a direct dev dependency. It is also required transitively by Emotion packages, but the app's explicit compiler integration is `@swc/plugin-emotion`.
4. Align the PWA `includeAssets` pattern with the actual SVG icons, or document why the current pattern is harmless because public assets are copied separately.
5. Optionally switch [src/main.tsx](src/main.tsx#L4) from `./App.tsx` to extensionless `./App` for conventional Vite/React import style.
6. Validate with install, lint, no-emit TypeScript, and a production build after dependency changes.

## Step 8: Add Characterization Tests Before Riskier Refactors

Priority: medium
Risk: low
Expected payoff: makes future cleanup safer.

Evidence:

- No dedicated test script exists in [package.json](package.json#L6-L11).
- The most complex code paths are DOM- and EPUB-specific, so broad refactors would be risky without coverage.

Plan:

1. Add a minimal test setup only when implementation work begins, likely Vitest plus Testing Library for React components and jsdom-backed utility tests.
2. Start with low-friction utility tests:
   - URL title encoding/decoding in [src/utils/bookTitleUrl.ts](src/utils/bookTitleUrl.ts).
   - Browser blob URL detection in [src/utils/htmlReferences.ts](src/utils/htmlReferences.ts).
   - Reading location normalization after Step 1.
   - Estimated page-position behavior in [src/services/pageEstimation.ts](src/services/pageEstimation.ts).
3. Add component tests for `BookCard`, `FilePicker`, and the extracted reader toolbar/sidebar after Step 3.
4. Treat [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts) as integration-test territory; unit tests alone may not capture layout behavior.
5. Add `npm run test` only once the test setup exists.

## Step 9: Defer Any Large `SectionViewer` Rewrite

Priority: low until tests exist
Risk: high
Expected payoff: possible long-term maintainability, but easy to regress reader behavior.

Evidence:

- [src/components/sectionViewer/useSectionViewer.ts](src/components/sectionViewer/useSectionViewer.ts) is large and stateful, but it is already supported by helper modules for anchors, pagination dimensions, scrolled sections, and Shadow DOM setup.
- Existing behavior depends on React StrictMode cleanup, scrolled-mode position flushing, paginated anchor restoration, viewport reporting, and expensive anchor lookup staying out of hot scroll paths.

Plan:

1. Do not rewrite this hook as part of the first cleanup pass.
2. After tests and ReaderPage extraction, consider narrow extractions only where boundaries are obvious:
   - viewport reporting and resize handling;
   - paginated render/navigation helpers;
   - scrolled render/range mounting helpers.
3. Keep current behavior around idle-deferred saves, cleanup flushes, mode-switch position capture, and viewport reporting.
4. Validate manually with large reflowable books, fixed-layout books, scrolled navigation, paginated navigation, mode switching, zooming, and returning to the library quickly after scrolling.

## Suggested Implementation Order

1. Step 1: consolidate reading-location helpers.
2. Step 8, utility-only portion: add basic tests for helpers and page estimation.
3. Step 4: narrow implementation-only exports.
4. Step 2: move EPUB metadata extraction out of storage.
5. Step 3: split ReaderPage presentational pieces, then hooks.
6. Step 5 and Step 6: normalize theme/buttons and improve library interactions.
7. Step 7: clean README, dependencies, and PWA asset metadata.
8. Step 9: revisit SectionViewer only after coverage and manual reader checks are in place.

## Areas To Preserve Carefully

- Local-first behavior: no file uploads, server storage, cloud sync, or remote EPUB processing.
- PWA should cache the app shell only, not user EPUB files.
- Cache reload should continue restoring section `Blob`s in batches with visible progress.
- Off-screen page measurement must not make awaited hidden images lazy-loaded.
- Asset rewriting must continue preserving `src`, `srcset`, `href`, `poster`, `data`, `xlink:href`, CSS `url(...)`, fragments, and `./` path variants.
- Do not persist extracted section HTML containing browser-local `blob:` URLs.
- Keep reader position saves atomic and resistant to mode-switch races.
