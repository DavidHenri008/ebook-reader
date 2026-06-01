# Plan: Ship the EPUB Reader as a mobile app via Capacitor

This plan turns the existing local-first PWA into a native Android and iOS app
(phone **and** tablet) using [Capacitor](https://capacitorjs.com/), while keeping
the same React/Vite/Emotion codebase and the local-first guarantee (no uploads,
no server, no cloud sync).

The web PWA build stays intact. Capacitor wraps the *same* web build in a native
WebView and adds native capabilities (file access, status bar, splash, back
button, safe areas) through plugins.

> **Execution note for AI:** Phases are ordered so each one leaves the project in
> a working state. Do **not** start a phase until the previous one's acceptance
> criteria pass. Each phase lists the files it touches, the work, and how to
> verify it. Do not break `npm run build`, `npm run lint`, or `npm test` at any
> point.

---

## Current state (baseline assessment)

| Area | Today | Mobile implication |
| --- | --- | --- |
| Routing | `BrowserRouter` in [src/App.tsx](src/App.tsx) | Native WebView serves from a non-`/` origin; history routing breaks → switch to `HashRouter`. |
| Vite base | default `base: "/"` in [vite.config.ts](vite.config.ts) | Native bundles load from a local scheme; needs relative assets (`base: "./"`) or careful config. |
| PWA service worker | `VitePWA` registered (autoUpdate) | A service worker inside Capacitor is redundant and can cause stale-cache / update bugs. Disable SW for native builds, keep it for the web PWA. |
| File import | hidden `<input type="file" accept=".epub">` in [src/components/FilePicker.tsx](src/components/FilePicker.tsx) | The web file input is unreliable for `.epub` on iOS/Android and can't receive "Open with" intents → add a Capacitor file picker + document intents. |
| Storage | IndexedDB blobs via `idb` in [src/storage](src/storage) | Works in WebViews, but iOS WKWebView can evict storage under pressure → request persistence and handle eviction. |
| Layout | desktop-first; toolbar/sidebar in [src/components/reader](src/components/reader) | Needs safe-area insets (notches), touch targets, phone/tablet responsiveness, and touch page-turn gestures. |
| Icons | SVG only in `public/icons` | Native stores require raster PNG icons + adaptive icons (Android) and asset catalogs (iOS). |

---

## Decisions to confirm before Phase 0

These should be answered up front (defaults proposed). An AI executing this plan
should use the defaults unless the user overrides them.

- **App / bundle identifier:** `com.davidhenri.epubreader` (reverse-DNS, must be unique and stable).
- **Display name:** `EPUB Reader`.
- **Minimum OS:** Android 7.0 (API 24) and iOS 14 (Capacitor 6 defaults). Confirm against device targets.
- **Capacitor major version:** latest stable (Capacitor 6.x at time of writing).
- **Package manager:** npm (matches existing `package.json`).
- **Native projects committed to git:** yes (`android/` and `ios/` checked in) so builds are reproducible.
- **Web PWA stays published:** yes. Capacitor is an *additional* target, not a replacement.

---

## Phase 0 — Prerequisites and tooling (no code changes)

**Goal:** Confirm the local toolchain can build native projects before touching code.

**Steps**
1. Document required local tooling (does not need to be installed by the AI, but
   recorded in this plan / a `docs/mobile-build.md`):
   - **Android:** Android Studio, Android SDK (API 24+), a JDK (17), an emulator or device.
   - **iOS (macOS only):** Xcode, CocoaPods, an iOS simulator or device, an Apple developer account for device/signing.
2. Note that **iOS builds require macOS**. On Windows (current dev box) only the
   Android target can be built/run locally; iOS work must happen on a Mac or CI
   runner (e.g. GitHub Actions macOS runner). Record this constraint.
3. Decide where native build docs live (`docs/mobile-build.md`).

**Acceptance criteria**
- A short `docs/mobile-build.md` exists listing prerequisites and the Windows/iOS constraint.
- No source/build changes; `npm run build`, `npm run lint`, `npm test` unaffected.

---

## Phase 1 — Make the web build Capacitor-compatible (web only, no native yet)

**Goal:** Adjust the existing web app so the *same* build works both as the
published PWA and inside a native WebView. This phase is fully testable on the
web before any native project exists.

**Steps**
1. **Routing:** Switch [src/App.tsx](src/App.tsx) from `BrowserRouter` to a router
   that works under a non-`/` origin. Use `HashRouter` for native, or detect the
   platform and choose the router. Recommended: a single `createHashRouter` /
   `HashRouter` used everywhere to keep behavior identical across targets, OR a
   small wrapper that picks `BrowserRouter` on web and `HashRouter` under
   Capacitor (`Capacitor.isNativePlatform()`).
   - Verify the canonical `/reader/:bookTitle` redirect logic in
     [src/pages/reader/useReaderBookTitle.ts](src/pages/reader/useReaderBookTitle.ts)
     and the `ErrorBoundary` reset (`window.location.assign(import.meta.env.BASE_URL)`)
     still work with hash routing.
2. **Vite base path:** Make asset URLs relative so they resolve under the native
   scheme. Set `base: "./"` (or conditionally for native) in
   [vite.config.ts](vite.config.ts). Audit absolute paths:
   - `index.html`: `/favicon.svg`, `/icons/icon-192.svg`.
   - manifest icon `src` values (`/icons/...`).
   - `navigateFallback: "/index.html"`.
   Convert to relative or `import.meta.env.BASE_URL`-aware paths where needed.
3. **Service worker strategy:** Ensure the VitePWA service worker does **not**
   register inside Capacitor. Either gate `registerType`/registration on
   `!Capacitor.isNativePlatform()`, or produce a separate native build without
   the PWA plugin. Keep the web PWA working unchanged.
4. **Platform abstraction seam:** Introduce a tiny `src/platform/` module (e.g.
   `platform.ts`) exposing `isNative()` and feature flags, so later phases can
   branch web vs native cleanly without scattering `Capacitor` checks. This keeps
   with the repo convention of narrow integration boundaries (see
   `src/services/epubjsAdapter.ts` pattern).

**Files touched:** [src/App.tsx](src/App.tsx), [vite.config.ts](vite.config.ts),
[index.html](index.html), [src/main.tsx](src/main.tsx), new `src/platform/platform.ts`.

**Acceptance criteria**
- `npm run build`, `npm run lint`, `npm test` all pass.
- `npm run preview` works; the app loads, imports an EPUB, reads, and restores position.
- Hash-based URLs work (e.g. reloading on `/#/reader/...` keeps the reader open).
- The web PWA still installs and caches the app shell.

---

## Phase 2 — Add Capacitor and create native projects

**Goal:** Install Capacitor, configure it, and generate the `android/` and `ios/`
projects that wrap the Vite build output.

**Steps**
1. Add dependencies: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`,
   `@capacitor/ios`.
2. Create `capacitor.config.ts` at the repo root:
   - `appId` = chosen bundle id, `appName` = `EPUB Reader`.
   - `webDir` = Vite output dir (`dist`).
   - Sensible defaults (`server.androidScheme: "https"`).
3. Add npm scripts to [package.json](package.json), e.g.:
   - `cap:sync` → `npm run build && cap sync`
   - `cap:android` → `cap run android`
   - `cap:ios` → `cap run ios`
4. Run `npx cap add android` (and `npx cap add ios` on macOS) to scaffold native
   projects. Commit them.
5. Add native build artifacts to `.gitignore` (build/, Pods/, etc.) while keeping
   the project files tracked.

**Files touched:** [package.json](package.json), new `capacitor.config.ts`, new
`android/` (+ `ios/` on macOS), `.gitignore`.

**Acceptance criteria**
- `npm run cap:sync` completes and copies `dist/` into the native project(s).
- The Android project opens in Android Studio and builds a debug APK.
- App launches in an emulator showing the library/home screen (file import not yet wired natively — that's Phase 4).

---

## Phase 3 — Native shell integration (status bar, splash, back button, keyboard, safe areas)

**Goal:** Make the app feel native and behave correctly within the OS chrome.

**Steps**
1. Add plugins: `@capacitor/status-bar`, `@capacitor/splash-screen`,
   `@capacitor/app`, `@capacitor/keyboard`.
2. **Status bar:** style it to match the active reader theme (light/dark) — wire
   into [src/pages/reader/useReaderTheme.ts](src/pages/reader/useReaderTheme.ts)
   or the app theme in `src/styles`. Use the existing palette
   (`src/styles/palette.ts`) as the single source of truth.
3. **Splash screen:** configure a simple splash that hides once React mounts
   (call `SplashScreen.hide()` after first render, gated on `isNative()`).
4. **Android hardware back button:** subscribe to `App.addListener('backButton', …)`
   to navigate the router back (and exit at the library root) instead of closing
   the app abruptly.
5. **Keyboard:** ensure the keyboard doesn't cover inputs (mainly the library/search
   if any); set resize behavior.
6. **Safe-area insets:** add `viewport-fit=cover` to the viewport meta in
   [index.html](index.html) and consume `env(safe-area-inset-*)` in
   [src/styles/GlobalStyles.tsx](src/styles/GlobalStyles.tsx) and the reader
   toolbar/sidebar so the toolbar and content avoid notches and the home indicator.

**Files touched:** new `src/platform/` native bootstrap, `src/main.tsx`,
`src/styles/GlobalStyles.tsx`, `src/components/reader/ReaderToolbar.tsx`,
`src/components/reader/ReaderSidebar.tsx`, theme hooks, `index.html`,
`capacitor.config.ts`.

**Acceptance criteria**
- App launches with a splash that dismisses cleanly.
- Status bar color follows the reader/app theme.
- Android back button navigates within the app and exits only at the root.
- Reader UI clears notch/home-indicator areas on a notched device/emulator.

---

## Phase 4 — Native file import and "Open with" support

**Goal:** Let users add EPUBs reliably on mobile, including opening `.epub` files
from other apps (Files, email, browser, share sheet).

**Steps**
1. Add a file-picker capability for native (e.g. `@capawesome/capacitor-file-picker`)
   plus `@capacitor/filesystem` for reading file bytes into a `Blob`.
2. Refactor [src/components/FilePicker.tsx](src/components/FilePicker.tsx) to branch
   on `isNative()`:
   - **Web:** keep the existing hidden `<input type="file">`.
   - **Native:** use the plugin to pick `.epub`/`application/epub+zip`, read the
     bytes, and produce the same `File[]`/`Blob` shape the rest of the pipeline
     expects ([src/services/bookExtractor.ts](src/services/bookExtractor.ts),
     [src/storage/bookCache.ts](src/storage/bookCache.ts)). Keep the integration
     boundary narrow so the extraction/caching code is unchanged.
3. **"Open with" / share-target intents** (open EPUBs from other apps):
   - **Android:** add `intent-filter`s in `AndroidManifest.xml` for
     `application/epub+zip` (VIEW/SEND), and handle the incoming URI via the
     `@capacitor/app` `appUrlOpen` listener → read bytes → run the import pipeline.
   - **iOS:** declare the EPUB document type (UTI `org.idpf.epub-container`) in
     `Info.plist` (`CFBundleDocumentTypes` / imported UTType) and handle the
     opened file URL through the same `appUrlOpen` path.
4. Ensure imported books still flow through the existing cache-then-extract
   pipeline ([src/pages/reader/useBookExtraction.ts](src/pages/reader/useBookExtraction.ts))
   and that progress UI stays intact.

**Files touched:** [src/components/FilePicker.tsx](src/components/FilePicker.tsx),
new native-import helper in `src/platform/` or `src/services/`, app URL-open
listener wiring, `android/app/src/main/AndroidManifest.xml`, `ios/.../Info.plist`.

**Acceptance criteria**
- On Android emulator/device: picking an `.epub` imports and opens it.
- Sharing/opening an `.epub` from Files or a browser into the app imports it.
- On iOS (when buildable): same picker + open-with behavior.
- Web import path is unchanged and still passes existing behavior.

---

## Phase 5 — Responsive and touch UX (phone + tablet)

**Goal:** A first-class touch experience across phone and tablet form factors and
both orientations.

**Steps**
1. **Responsive layout:** audit the library grid ([src/components/BookCard.tsx](src/components/BookCard.tsx),
   [src/pages/HomePage.tsx](src/pages/HomePage.tsx)) and reader chrome for small
   (phone) vs large (tablet) breakpoints. Sidebar/TOC should be a drawer/overlay
   on phones and can be persistent on tablets.
2. **Touch targets:** ensure toolbar buttons meet ~44px minimum hit area.
3. **Page-turn gestures:** in paginated mode, add tap zones (left/right thirds)
   and/or horizontal swipe to turn pages, integrated with the existing paginated
   controller in [src/reader/paginatedController.ts](src/reader/paginatedController.ts)
   and [src/components/sectionViewer](src/components/sectionViewer). Respect the
   Shadow DOM rendering boundary documented in repo memory.
4. **Orientation:** verify scrolled and paginated modes re-measure correctly on
   rotation (page-map invalidation in [src/pages/reader/usePageMap.ts](src/pages/reader/usePageMap.ts)).
   Lazy-image measurement gotcha (do not set `loading="lazy"` while awaiting load)
   must be preserved.
5. **Tablet defaults:** consider a wider reading column / two-up paginated layout
   on large screens (optional, can be deferred).

**Files touched:** `src/pages/HomePage.tsx`, `src/components/BookCard.tsx`,
`src/components/reader/*`, `src/components/sectionViewer/*`,
`src/reader/paginatedController.ts`, reader hooks under `src/pages/reader/`.

**Acceptance criteria**
- Library and reader look correct on phone and tablet emulators, portrait and landscape.
- Paginated mode turns pages via tap/swipe.
- Rotation re-measures pages without breaking the reading position.
- No regressions in existing Vitest suite.

---

## Phase 6 — App icons, splash assets, and metadata

**Goal:** Produce platform-correct launcher icons and splash images.

**Steps**
1. Create a high-resolution source icon (≥1024×1024 PNG) and splash source.
   (Existing assets are SVG-only and insufficient for native stores.)
2. Use `@capacitor/assets` to generate Android adaptive icons, iOS asset catalog
   icons, and splash screens from the source images.
3. Set app display name and version in native projects and keep them in sync with
   [package.json](package.json).
4. Configure light/dark splash background to match `src/styles/palette.ts`.

**Files touched:** new `assets/` source images, generated native icon/splash
resources, native project metadata.

**Acceptance criteria**
- Correct launcher icon on Android (adaptive) and iOS home screen.
- Splash renders at correct aspect ratios on phone and tablet.

---

## Phase 7 — Storage durability and offline behavior on native

**Goal:** Make IndexedDB-backed library/cache durable inside the WebView.

**Steps**
1. Request persistent storage (`navigator.storage.persist()`) on native startup so
   the OS is less likely to evict cached books.
2. Verify the `idb` schema ([src/storage/db.ts](src/storage/db.ts)) and blob
   round-trips work in both WebViews; add a graceful path if storage is evicted
   (book disappears from cache → re-import prompt) without crashing.
3. Confirm there is **no** unintended network access — the app must remain
   local-first (no uploads, no remote EPUB processing), matching project guidelines.

**Files touched:** `src/platform/` startup, possibly small guards in
`src/storage/*`.

**Acceptance criteria**
- Library and cached books survive app restart on device/emulator.
- No network requests for EPUB content (verify via proxy/inspector).
- Graceful handling if storage is cleared.

---

## Phase 8 — Build, signing, and store preparation

**Goal:** Produce installable/release artifacts.

**Steps**
1. **Android:** configure a release keystore (kept out of git), `versionCode`/
   `versionName`, and produce a signed AAB. Document the signing process in
   `docs/mobile-build.md`.
2. **iOS (macOS/CI):** configure signing team, bundle id, capabilities, and an
   archive/IPA. Document.
3. **(Optional) CI:** a GitHub Actions workflow with a macOS runner for iOS and a
   Linux/Windows runner for Android to automate `cap sync` + native builds.
4. Prepare store metadata (descriptions, screenshots for phone + tablet,
   privacy: "no data collected / local-only").

**Files touched:** native gradle/Xcode config, `docs/mobile-build.md`, optional
`.github/workflows/`.

**Acceptance criteria**
- A signed Android AAB/APK builds.
- (When on macOS) an iOS archive builds.
- Build steps are documented and reproducible.

---

## Phase 9 — QA matrix and device testing

**Goal:** Validate across the target device matrix.

**Test matrix**
- Android phone, Android tablet; iOS phone (iPhone), iOS tablet (iPad).
- Portrait + landscape; light + dark theme; scrolled + paginated modes.

**Checklist**
- Import via picker and via "Open with"; large fixed-layout EPUB extraction shows progress.
- Reading position restored across app restarts (current section + anchor).
- Page-turn gestures; zoom; TOC navigation; theme switch.
- Safe areas correct on notched devices; back button behavior on Android.
- Offline (airplane mode) still fully functional.

**Acceptance criteria**
- All checklist items pass on at least one phone and one tablet per platform.
- `npm run build`, `npm run lint`, `npm test` remain green.

---

## Risks and mitigations

- **iOS requires macOS.** Current dev environment is Windows → plan iOS work on a
  Mac or macOS CI runner. Android is fully buildable on Windows.
- **Service worker conflicts in WebView.** Mitigate by disabling SW registration
  on native (Phase 1) and only shipping it for the web PWA.
- **epubjs in a WebView.** epubjs rendering is already the perf bottleneck on large
  fixed-layout books; verify serial spine `item.render()` performance on real
  devices and preserve visible progress (per repo guidelines). Do not add timing
  instrumentation unless requested.
- **iOS WKWebView storage eviction.** Mitigate with `navigator.storage.persist()`
  and graceful re-import (Phase 7).
- **Routing regressions.** Hash routing changes URL shape; re-verify the canonical
  redirect and ErrorBoundary reset paths.
- **Test environment.** Vitest + jsdom cannot run native or full `extractRawBook`;
  keep native code behind the `isNative()` seam so unit tests stay deterministic.

---

## Out of scope (explicitly not doing unless requested)

- Cloud sync, accounts, server-side storage, or remote EPUB processing.
- Uploading user EPUB files anywhere.
- Replacing the web PWA — it remains a supported target.

---

## Suggested execution order summary

0. Prereqs/docs → 1. Web Capacitor-compat → 2. Add Capacitor + platforms →
3. Native shell → 4. File import + open-with → 5. Touch/responsive UX →
6. Icons/splash → 7. Storage durability → 8. Build/signing → 9. QA matrix.
